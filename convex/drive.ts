import { ConvexError, v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation, mutation, query } from "./_generated/server";
import { deleteDriveFile } from "./cleanup";
import type { ProjectAccess } from "./lib/access";
import {
  allows,
  canSee,
  ifVisible,
  requireDriveFile,
  requireDriveFolder,
  requireProject,
  requireUser,
  visibleProjects,
} from "./lib/access";
import { dropFile, keyName, ownedFile, signedLink } from "./lib/files";
import { mediaUrl } from "./lib/media";
import type { DriveChange } from "./lib/validators";
import { vColor, vUpload } from "./lib/validators";
import { r2 } from "./r2";
import {
  cleanName,
  driveFileKey,
  driveThumbKey,
  isDriveFileKey,
  isThumbKey,
  MAX_COUNTED,
  MAX_DRIVE_BATCH,
  MAX_DRIVE_FILE_BYTES,
  MAX_THUMB_BYTES,
  nameKey,
  numberedName,
  TOO_BIG,
  TRASH_MS,
} from "./shared/drive";
import { mentionedUsers } from "./shared/mentions";
import type { Color } from "./shared/palette";

const MAX_TYPE = 100;
const MAX_ICON = 16;
const MAX_COMMENT = 10_000;
/** Folders one folder dropped from the computer can hold, and how deep. */
const MAX_NEW_FOLDERS = 1000;
const MAX_DEPTH = 50;
const DEFAULT_FOLDER = "New folder";
/** Recent files listed, and the opens kept per person per project to find them. */
const RECENT = 30;
const KEEP_OPENS = 50;
const SEARCH_RESULTS = 50;
/** Opening the same file again this soon doesn't count as another open. */
const REOPEN_MS = 60_000;
/** An upload not filed in a day was left behind, by a closed tab or a lost connection. */
const LEFT_BEHIND_MS = 24 * 60 * 60 * 1000;
/** Deleting a file also deletes it from R2: a few per batch. */
const FILE_BATCH = 20;
const BATCH = 100;

type FolderId = Id<"driveFolders">;

export interface DriveFolderView {
  _id: FolderId;
  _creationTime: number;
  projectId: Id<"projects">;
  parentId?: FolderId;
  name: string;
  color?: Color;
  icon?: string;
  createdBy: Id<"users">;
  updatedAt: number;
}

export interface DriveFileView {
  _id: Id<"driveFiles">;
  _creationTime: number;
  projectId: Id<"projects">;
  folderId?: FolderId;
  name: string;
  size: number;
  type: string;
  width?: number;
  height?: number;
  duration?: number;
  /** Where it's served from; anyone holding the link can load it. */
  url: string;
  thumbUrl?: string;
  uploadedBy: Id<"users">;
  updatedAt: number;
}

interface Trashed {
  trashedAt: number;
  trashedBy?: Id<"users">;
}

function folderView(folder: Doc<"driveFolders">): DriveFolderView {
  return {
    _creationTime: folder._creationTime,
    _id: folder._id,
    color: folder.color,
    createdBy: folder.createdBy,
    icon: folder.icon,
    name: folder.name,
    parentId: folder.parentId,
    projectId: folder.projectId,
    updatedAt: folder.updatedAt,
  };
}

function fileView(file: Doc<"driveFiles">): DriveFileView {
  return {
    _creationTime: file._creationTime,
    _id: file._id,
    duration: file.duration,
    folderId: file.folderId,
    height: file.height,
    name: file.name,
    projectId: file.projectId,
    size: file.size,
    thumbUrl: file.thumbKey ? mediaUrl(file.thumbKey) : undefined,
    type: file.type,
    updatedAt: file.updatedAt,
    uploadedBy: file.uploadedBy,
    url: mediaUrl(file.key),
    width: file.width,
  };
}

function trashFields(item: Doc<"driveFiles"> | Doc<"driveFolders">): Trashed {
  return { trashedAt: item.trashedAt ?? 0, trashedBy: item.trashedBy };
}

function isGone(folder: Doc<"driveFolders">): boolean {
  return folder.deleting === true || folder.trashedAt !== undefined;
}

/** A positive, finite number from the browser, or nothing. */
function measure(value: number | undefined): number | undefined {
  return value !== undefined && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}

function cleanIcon(icon: string | undefined): string | undefined {
  return icon?.trim().slice(0, MAX_ICON) || undefined;
}

function projectFolders(ctx: QueryCtx, projectId: Id<"projects">) {
  return ctx.db
    .query("driveFolders")
    .withIndex("by_parent_and_name", (q) => q.eq("projectId", projectId))
    .collect();
}

/** The folders nothing in the trash holds: neither trashed, nor inside one that is. */
function liveFolders(folders: Doc<"driveFolders">[]): Doc<"driveFolders">[] {
  const byId = new Map(folders.map((folder) => [folder._id, folder]));
  const known = new Map<string, boolean>();
  const isLive = (folder: Doc<"driveFolders">, depth: number): boolean => {
    const cached = known.get(folder._id);
    if (cached !== undefined) {
      return cached;
    }
    let live = !isGone(folder);
    if (live && folder.parentId) {
      const parent = byId.get(folder.parentId);
      live =
        parent !== undefined && depth < MAX_DEPTH && isLive(parent, depth + 1);
    }
    known.set(folder._id, live);
    return live;
  };
  return folders.filter((folder) => isLive(folder, 0));
}

async function liveFolderIds(
  ctx: QueryCtx,
  projectId: Id<"projects">
): Promise<Set<string>> {
  const folders = liveFolders(await projectFolders(ctx, projectId));
  return new Set(folders.map((folder) => folder._id));
}

/** Whether the file shows in its Drive: not trashed, nor inside a folder that is. */
function isLiveFile(file: Doc<"driveFiles">, live: Set<string>): boolean {
  return (
    file.trashedAt === undefined &&
    (file.folderId === undefined || live.has(file.folderId))
  );
}

/** Whether the folder, and every folder above it, is out of the trash. The top of the Drive always is. */
async function isLiveFolder(
  ctx: QueryCtx,
  folderId: FolderId | undefined
): Promise<boolean> {
  let id = folderId;
  for (let depth = 0; id; depth += 1) {
    const folder = await ctx.db.get(id);
    if (!folder || isGone(folder) || depth > MAX_DEPTH) {
      return false;
    }
    id = folder.parentId;
  }
  return true;
}

/** The folder things go into: one in the project and out of the trash, or the top of the Drive. */
async function requireTarget(
  ctx: QueryCtx,
  projectId: Id<"projects">,
  folderId: FolderId | undefined
): Promise<Doc<"driveFolders"> | null> {
  if (!folderId) {
    return null;
  }
  const folder = await ctx.db.get(folderId);
  if (folder?.projectId !== projectId || !(await isLiveFolder(ctx, folderId))) {
    throw new ConvexError("That folder isn’t in this Drive anymore.");
  }
  return folder;
}

/** Whether `folderId` is `ancestor` or sits somewhere inside it. */
async function isWithin(
  ctx: QueryCtx,
  folderId: FolderId | undefined,
  ancestor: FolderId
): Promise<boolean> {
  let id = folderId;
  for (let depth = 0; id && depth <= MAX_DEPTH; depth += 1) {
    if (id === ancestor) {
      return true;
    }
    const folder = await ctx.db.get(id);
    id = folder?.parentId;
  }
  return false;
}

/** The folder, or the nearest one above it still out of the trash; the top of the Drive at worst. */
async function nearestLive(
  ctx: QueryCtx,
  folderId: FolderId | undefined
): Promise<FolderId | undefined> {
  let id = folderId;
  for (let depth = 0; id && depth <= MAX_DEPTH; depth += 1) {
    if (await isLiveFolder(ctx, id)) {
      return id;
    }
    const folder = await ctx.db.get(id);
    id = folder?.parentId;
  }
  return undefined;
}

/** Whether anything out of the trash in the folder goes by the name, besides `except`. */
async function nameTaken(
  ctx: QueryCtx,
  projectId: Id<"projects">,
  folderId: FolderId | undefined,
  name: string,
  except?: string
): Promise<boolean> {
  const key = nameKey(name);
  const files = await ctx.db
    .query("driveFiles")
    .withIndex("by_folder_and_name", (q) =>
      q.eq("projectId", projectId).eq("folderId", folderId).eq("nameKey", key)
    )
    .collect();
  if (
    files.some((file) => file._id !== except && file.trashedAt === undefined)
  ) {
    return true;
  }
  const folders = await ctx.db
    .query("driveFolders")
    .withIndex("by_parent_and_name", (q) =>
      q.eq("projectId", projectId).eq("parentId", folderId).eq("nameKey", key)
    )
    .collect();
  return folders.some((folder) => folder._id !== except && !isGone(folder));
}

/** The name, or the first numbered one free in the folder, like "brief (2).pdf". */
async function freeName(
  ctx: QueryCtx,
  projectId: Id<"projects">,
  folderId: FolderId | undefined,
  name: string,
  except?: string
): Promise<string> {
  let candidate = name;
  for (
    let number = 1;
    await nameTaken(ctx, projectId, folderId, candidate, except);
    number += 1
  ) {
    candidate = numberedName(name, number);
  }
  return candidate;
}

function refuseRestore(): ConvexError<string> {
  return new ConvexError(
    "Only the project’s owners can restore what others deleted."
  );
}

function isOwner(access: ProjectAccess): boolean {
  return allows(access.role, "manage");
}

/** Owners can put anything in the trash; editors only what they added themselves. */
function mayTrash(access: ProjectAccess, addedBy: Id<"users">): boolean {
  return (
    isOwner(access) ||
    (allows(access.role, "edit") && addedBy === access.user._id)
  );
}

/** Whether the folder, and everything still in it at any depth, was added by `userId`. */
async function allAddedBy(
  ctx: QueryCtx,
  folder: Doc<"driveFolders">,
  userId: Id<"users">
): Promise<boolean> {
  if (folder.createdBy !== userId) {
    return false;
  }
  const queue: FolderId[] = [folder._id];
  for (let id = queue.pop(); id; id = queue.pop()) {
    const parentId = id;
    const files = await ctx.db
      .query("driveFiles")
      .withIndex("by_folder_and_name", (q) =>
        q.eq("projectId", folder.projectId).eq("folderId", parentId)
      )
      .collect();
    if (files.some((file) => !file.trashedAt && file.uploadedBy !== userId)) {
      return false;
    }
    const folders = await ctx.db
      .query("driveFolders")
      .withIndex("by_parent_and_name", (q) =>
        q.eq("projectId", folder.projectId).eq("parentId", parentId)
      )
      .collect();
    for (const inside of folders.filter((item) => !isGone(item))) {
      if (inside.createdBy !== userId) {
        return false;
      }
      queue.push(inside._id);
    }
  }
  return true;
}

function record(
  ctx: MutationCtx,
  fileId: Id<"driveFiles">,
  actorId: Id<"users">,
  change: DriveChange
) {
  return ctx.db.insert("driveEvents", { actorId, change, fileId });
}

async function forgetUpload(ctx: MutationCtx, key: string): Promise<void> {
  const pending = await ctx.db
    .query("driveUploads")
    .withIndex("by_key", (q) => q.eq("key", key))
    .collect();
  for (const row of pending) {
    await ctx.db.delete(row._id);
  }
}

/** How many things a folder holds, up to a cap, as its tile shows. */
async function countInside(
  ctx: QueryCtx,
  folder: Doc<"driveFolders">
): Promise<number> {
  const files = await ctx.db
    .query("driveFiles")
    .withIndex("by_folder_and_name", (q) =>
      q.eq("projectId", folder.projectId).eq("folderId", folder._id)
    )
    .take(MAX_COUNTED + 1);
  const folders = await ctx.db
    .query("driveFolders")
    .withIndex("by_parent_and_name", (q) =>
      q.eq("projectId", folder.projectId).eq("parentId", folder._id)
    )
    .take(MAX_COUNTED + 1);
  return (
    files.filter((file) => file.trashedAt === undefined).length +
    folders.filter((item) => !isGone(item)).length
  );
}

// ———————————————————————————————————————— Queries

/** Every folder of every Drive the signed-in person can see, out of the trash. */
export const tree = query({
  args: {},
  handler: async (ctx): Promise<DriveFolderView[]> => {
    const user = await requireUser(ctx);
    const projects = await visibleProjects(ctx, user);
    const lists = await Promise.all(
      projects.map(({ project }) => projectFolders(ctx, project._id))
    );
    return lists.flatMap(liveFolders).map(folderView);
  },
});

/**
 * The files in a folder, or at the top of the Drive, and how much each folder
 * there holds. Null once the folder is gone or in the trash.
 */
export const contents = query({
  args: {
    folderId: v.optional(v.id("driveFolders")),
    projectId: v.id("projects"),
  },
  handler: async (ctx, { projectId, folderId }) => {
    if (!(await ifVisible(requireProject(ctx, projectId, "view")))) {
      return null;
    }
    if (folderId) {
      const folder = await ctx.db.get(folderId);
      if (
        folder?.projectId !== projectId ||
        !(await isLiveFolder(ctx, folderId))
      ) {
        return null;
      }
    }
    const files = await ctx.db
      .query("driveFiles")
      .withIndex("by_folder_and_name", (q) =>
        q.eq("projectId", projectId).eq("folderId", folderId)
      )
      .collect();
    const folders = await ctx.db
      .query("driveFolders")
      .withIndex("by_parent_and_name", (q) =>
        q.eq("projectId", projectId).eq("parentId", folderId)
      )
      .collect();
    const counts: { folderId: FolderId; count: number }[] = [];
    for (const folder of folders.filter((item) => !isGone(item))) {
      counts.push({
        count: await countInside(ctx, folder),
        folderId: folder._id,
      });
    }
    return {
      counts,
      files: files.filter((file) => file.trashedAt === undefined).map(fileView),
    };
  },
});

/** One file, for links straight to it. Null once it's gone or in the trash. */
export const file = query({
  args: { fileId: v.id("driveFiles") },
  handler: async (ctx, { fileId }): Promise<DriveFileView | null> => {
    const access = await ifVisible(requireDriveFile(ctx, fileId, "view"));
    if (
      !access ||
      access.file.trashedAt !== undefined ||
      !(await isLiveFolder(ctx, access.file.folderId))
    ) {
      return null;
    }
    return fileView(access.file);
  },
});

/** What was put in the Drive's trash itself; what's inside a trashed folder goes with it. */
export const trashed = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    if (!(await ifVisible(requireProject(ctx, projectId, "view")))) {
      return null;
    }
    const files = await ctx.db
      .query("driveFiles")
      .withIndex("by_project_and_trashed", (q) =>
        q.eq("projectId", projectId).gte("trashedAt", 0)
      )
      .collect();
    const folders = await ctx.db
      .query("driveFolders")
      .withIndex("by_project_and_trashed", (q) =>
        q.eq("projectId", projectId).gte("trashedAt", 0)
      )
      .collect();
    return {
      files: files.map((item) => ({ ...fileView(item), ...trashFields(item) })),
      folders: folders
        .filter((folder) => !folder.deleting)
        .map((folder) => ({ ...folderView(folder), ...trashFields(folder) })),
    };
  },
});

/** What the signed-in person starred in the Drive, by id. */
export const stars = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const access = await ifVisible(requireProject(ctx, projectId, "view"));
    if (!access) {
      return { fileIds: [], folderIds: [] };
    }
    const rows = await ctx.db
      .query("driveStars")
      .withIndex("by_user_and_project", (q) =>
        q.eq("userId", access.user._id).eq("projectId", projectId)
      )
      .collect();
    return {
      fileIds: rows.flatMap((row) => row.fileId ?? []),
      folderIds: rows.flatMap((row) => row.folderId ?? []),
    };
  },
});

/** The files the signed-in person starred, out of the trash. */
export const starredFiles = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }): Promise<DriveFileView[] | null> => {
    const access = await ifVisible(requireProject(ctx, projectId, "view"));
    if (!access) {
      return null;
    }
    const rows = await ctx.db
      .query("driveStars")
      .withIndex("by_user_and_project", (q) =>
        q.eq("userId", access.user._id).eq("projectId", projectId)
      )
      .collect();
    const live = await liveFolderIds(ctx, projectId);
    const files: DriveFileView[] = [];
    for (const row of rows) {
      const found = row.fileId ? await ctx.db.get(row.fileId) : null;
      if (found && isLiveFile(found, live)) {
        files.push(fileView(found));
      }
    }
    return files;
  },
});

/**
 * Files the signed-in person opened lately, and ones uploaded, renamed or
 * moved lately by anyone, newest first.
 */
export const recent = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const access = await ifVisible(requireProject(ctx, projectId, "view"));
    if (!access) {
      return null;
    }
    const live = await liveFolderIds(ctx, projectId);
    const changed = await ctx.db
      .query("driveFiles")
      .withIndex("by_project_and_updated", (q) => q.eq("projectId", projectId))
      .order("desc")
      .take(RECENT * 2);
    const opens = await ctx.db
      .query("driveOpens")
      .withIndex("by_user_and_project_and_at", (q) =>
        q.eq("userId", access.user._id).eq("projectId", projectId)
      )
      .order("desc")
      .take(RECENT);
    const found = new Map<
      string,
      { file: Doc<"driveFiles">; at: number; openedAt?: number }
    >();
    for (const item of changed.filter((each) => isLiveFile(each, live))) {
      found.set(item._id, { at: item.updatedAt, file: item });
    }
    for (const open of opens) {
      const known = found.get(open.fileId);
      const item = known?.file ?? (await ctx.db.get(open.fileId));
      if (item && isLiveFile(item, live)) {
        found.set(item._id, {
          at: Math.max(item.updatedAt, open.at),
          file: item,
          openedAt: open.at,
        });
      }
    }
    return [...found.values()]
      .toSorted((a, b) => b.at - a.at)
      .slice(0, RECENT)
      .map(({ file: item, openedAt }) => ({ ...fileView(item), openedAt }));
  },
});

/** Files anywhere in the Drive whose names have the words, out of the trash. */
export const search = query({
  args: { projectId: v.id("projects"), text: v.string() },
  handler: async (ctx, { projectId, text }) => {
    if (!(await ifVisible(requireProject(ctx, projectId, "view")))) {
      return null;
    }
    const needle = text.trim().slice(0, 100);
    if (!needle) {
      return [];
    }
    const live = await liveFolderIds(ctx, projectId);
    const found = await ctx.db
      .query("driveFiles")
      .withSearchIndex("search_name", (q) =>
        q.search("name", needle).eq("projectId", projectId)
      )
      .take(SEARCH_RESULTS);
    return found.filter((item) => isLiveFile(item, live)).map(fileView);
  },
});

/** What was done to a file and said about it, oldest first. */
export const activity = query({
  args: { fileId: v.id("driveFiles") },
  handler: async (ctx, { fileId }) => {
    if (!(await ifVisible(requireDriveFile(ctx, fileId, "view")))) {
      return [];
    }
    const events = await ctx.db
      .query("driveEvents")
      .withIndex("by_file", (q) => q.eq("fileId", fileId))
      .collect();
    const comments = await ctx.db
      .query("driveComments")
      .withIndex("by_file", (q) => q.eq("fileId", fileId))
      .collect();
    return [
      ...events.map((event) => ({
        _creationTime: event._creationTime,
        _id: event._id,
        actorId: event.actorId,
        change: event.change,
        kind: "event" as const,
      })),
      ...comments.map((comment) => ({
        _creationTime: comment._creationTime,
        _id: comment._id,
        actorId: comment.authorId,
        content: comment.content,
        kind: "comment" as const,
      })),
    ].toSorted((a, b) => a._creationTime - b._creationTime);
  },
});

// ———————————————————————————————————————— Uploads

/**
 * Where to upload a file, or its thumbnail, before filing it in the Drive.
 * The key ends in the file's name, so it's still recognizable in the bucket.
 */
export const generateUploadUrl = mutation({
  args: {
    name: v.string(),
    projectId: v.id("projects"),
    size: v.number(),
    thumbnail: v.optional(v.boolean()),
  },
  handler: async (ctx, { name, projectId, size, thumbnail = false }) => {
    const { user } = await requireProject(ctx, projectId, "edit");
    if (!(size <= (thumbnail ? MAX_THUMB_BYTES : MAX_DRIVE_FILE_BYTES))) {
      throw new ConvexError(thumbnail ? "That preview is too big." : TOO_BIG);
    }
    const id = crypto.randomUUID();
    const key = thumbnail ? driveThumbKey(id) : driveFileKey(id, keyName(name));
    await ctx.db.insert("driveUploads", { key, userId: user._id });
    return await r2.generateUploadUrl(key);
  },
});

/** Files someone's upload in the folder, under its name or the first one free. */
export const addFile = mutation({
  args: {
    duration: v.optional(v.number()),
    file: vUpload,
    folderId: v.optional(v.id("driveFolders")),
    height: v.optional(v.number()),
    projectId: v.id("projects"),
    thumbKey: v.optional(v.string()),
    width: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { user } = await requireProject(ctx, args.projectId, "edit");
    await requireTarget(ctx, args.projectId, args.folderId);
    const { key } = args.file;
    if (!isDriveFileKey(key)) {
      throw new ConvexError("That upload couldn’t be found.");
    }
    await ownedFile(ctx, key, user._id, "drive");
    const filed = await ctx.db
      .query("driveFiles")
      .withIndex("by_key", (q) => q.eq("key", key))
      .first();
    if (filed) {
      throw new ConvexError("That file is in the Drive already.");
    }
    const thumbKey =
      args.thumbKey && isThumbKey(args.thumbKey) ? args.thumbKey : undefined;
    if (thumbKey) {
      await ownedFile(ctx, thumbKey, user._id, "drive");
    }
    // R2's word once it's been asked, the browser's until then; checked again after.
    const metadata = await r2.getMetadata(ctx, key);
    const size = Math.max(0, Math.round(metadata?.size ?? args.file.size));
    if (!(size <= MAX_DRIVE_FILE_BYTES)) {
      throw new ConvexError(TOO_BIG);
    }
    const name = await freeName(
      ctx,
      args.projectId,
      args.folderId,
      cleanName(args.file.name) || "Untitled"
    );
    const now = Date.now();
    const fileId = await ctx.db.insert("driveFiles", {
      duration: measure(args.duration),
      folderId: args.folderId,
      height: measure(args.height),
      key,
      name,
      nameKey: nameKey(name),
      projectId: args.projectId,
      size,
      thumbKey,
      type: (args.file.type || metadata?.contentType || "").slice(0, MAX_TYPE),
      updatedAt: now,
      uploadedBy: user._id,
      width: measure(args.width),
    });
    await forgetUpload(ctx, key);
    if (thumbKey) {
      await forgetUpload(ctx, thumbKey);
    }
    await record(ctx, fileId, user._id, { kind: "uploaded" });
    return { fileId, name };
  },
});

/** Deletes your upload that was never filed, like one canceled halfway. */
export const discard = mutation({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    const user = await requireUser(ctx);
    const pending = await ctx.db
      .query("driveUploads")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    if (pending?.userId === user._id) {
      await ctx.db.delete(pending._id);
      await dropFile(ctx, key);
    }
  },
});

/**
 * Checks an upload once R2 says how big it really is. One over the limit is
 * deleted, filed or not; a filed one takes the true size.
 */
export const checkUpload = internalMutation({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    const metadata = await r2.getMetadata(ctx, key);
    if (!metadata) {
      return;
    }
    const size = metadata.size ?? 0;
    if (isThumbKey(key)) {
      // A broken preview falls back to the file's icon.
      if (size > MAX_THUMB_BYTES) {
        await forgetUpload(ctx, key);
        await dropFile(ctx, key);
      }
      return;
    }
    const filed = await ctx.db
      .query("driveFiles")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    if (size > MAX_DRIVE_FILE_BYTES) {
      await forgetUpload(ctx, key);
      await (filed ? deleteDriveFile(ctx, filed) : dropFile(ctx, key));
      return;
    }
    if (filed && filed.size !== size) {
      await ctx.db.patch(filed._id, { size });
    }
  },
});

// ———————————————————————————————————————— Folders

/** Starts a folder, under the name given or "New folder", numbered if it's taken. */
export const createFolder = mutation({
  args: {
    color: v.optional(vColor),
    icon: v.optional(v.string()),
    name: v.optional(v.string()),
    parentId: v.optional(v.id("driveFolders")),
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    const { user } = await requireProject(ctx, args.projectId, "edit");
    await requireTarget(ctx, args.projectId, args.parentId);
    const name = await freeName(
      ctx,
      args.projectId,
      args.parentId,
      cleanName(args.name ?? "") || DEFAULT_FOLDER
    );
    const folderId = await ctx.db.insert("driveFolders", {
      color: args.color,
      createdBy: user._id,
      icon: cleanIcon(args.icon),
      name,
      nameKey: nameKey(name),
      parentId: args.parentId,
      projectId: args.projectId,
      updatedAt: Date.now(),
    });
    return { folderId, name };
  },
});

/**
 * Makes the folders of a folder dropped from the computer, each path a list of
 * names from the top of what was dropped down. Resolves with each path's
 * folder, in the same order: what's dropped keeps its shape.
 */
export const createFolders = mutation({
  args: {
    parentId: v.optional(v.id("driveFolders")),
    paths: v.array(v.array(v.string())),
    projectId: v.id("projects"),
  },
  handler: async (ctx, { parentId, paths, projectId }) => {
    const { user } = await requireProject(ctx, projectId, "edit");
    await requireTarget(ctx, projectId, parentId);
    if (paths.length > MAX_NEW_FOLDERS) {
      throw new ConvexError(
        `A dropped folder can hold up to ${MAX_NEW_FOLDERS} folders.`
      );
    }
    const made = new Map<string, FolderId>();
    const now = Date.now();
    const make = async (path: string[]): Promise<FolderId | undefined> => {
      if (path.length === 0) {
        return parentId;
      }
      const joined = path.join("/");
      const known = made.get(joined);
      if (known) {
        return known;
      }
      const parent = await make(path.slice(0, -1));
      const name = await freeName(
        ctx,
        projectId,
        parent,
        path.at(-1) ?? DEFAULT_FOLDER
      );
      const folderId = await ctx.db.insert("driveFolders", {
        createdBy: user._id,
        name,
        nameKey: nameKey(name),
        parentId: parent,
        projectId,
        updatedAt: now,
      });
      made.set(joined, folderId);
      return folderId;
    };
    const folders: (FolderId | null)[] = [];
    for (const path of paths) {
      const names = path
        .slice(0, MAX_DEPTH)
        .map((name) => cleanName(name) || DEFAULT_FOLDER);
      folders.push((await make(names)) ?? null);
    }
    return folders;
  },
});

/** Renames a folder, or changes its color or emoji; null takes either away. */
export const updateFolder = mutation({
  args: {
    color: v.optional(v.union(vColor, v.null())),
    folderId: v.id("driveFolders"),
    icon: v.optional(v.union(v.string(), v.null())),
    name: v.optional(v.string()),
  },
  handler: async (ctx, { folderId, name, color, icon }) => {
    const { folder } = await requireDriveFolder(ctx, folderId, "edit");
    const patch: Partial<Doc<"driveFolders">> = { updatedAt: Date.now() };
    if (name !== undefined) {
      const next = cleanName(name);
      if (!next) {
        throw new ConvexError("Give the folder a name.");
      }
      if (
        await nameTaken(ctx, folder.projectId, folder.parentId, next, folderId)
      ) {
        throw new ConvexError(
          `There’s already something called “${next}” here.`
        );
      }
      patch.name = next;
      patch.nameKey = nameKey(next);
    }
    if (color !== undefined) {
      patch.color = color ?? undefined;
    }
    if (icon !== undefined) {
      patch.icon = cleanIcon(icon ?? undefined);
    }
    await ctx.db.patch(folderId, patch);
  },
});

// ———————————————————————————————————————— Files and folders

export const renameFile = mutation({
  args: { fileId: v.id("driveFiles"), name: v.string() },
  handler: async (ctx, { fileId, name }) => {
    const { file: item, user } = await requireDriveFile(ctx, fileId, "edit");
    const next = cleanName(name);
    if (!next) {
      throw new ConvexError("Give the file a name.");
    }
    if (next === item.name) {
      return;
    }
    if (await nameTaken(ctx, item.projectId, item.folderId, next, fileId)) {
      throw new ConvexError(`There’s already something called “${next}” here.`);
    }
    await ctx.db.patch(fileId, {
      name: next,
      nameKey: nameKey(next),
      updatedAt: Date.now(),
    });
    await record(ctx, fileId, user._id, {
      from: item.name,
      kind: "renamed",
      to: next,
    });
  },
});

const vItems = {
  fileIds: v.array(v.id("driveFiles")),
  folderIds: v.array(v.id("driveFolders")),
  projectId: v.id("projects"),
};

function checkBatch(fileIds: unknown[], folderIds: unknown[]): void {
  if (fileIds.length + folderIds.length > MAX_DRIVE_BATCH) {
    throw new ConvexError(`Up to ${MAX_DRIVE_BATCH} at a time.`);
  }
}

/**
 * Moves files and folders into a folder, or to the top of the Drive. Any
 * whose name is taken there gets the first numbered one free.
 */
export const move = mutation({
  args: { ...vItems, to: v.union(v.id("driveFolders"), v.null()) },
  handler: async (ctx, { fileIds, folderIds, projectId, to }) => {
    checkBatch(fileIds, folderIds);
    const { user } = await requireProject(ctx, projectId, "edit");
    const target = await requireTarget(ctx, projectId, to ?? undefined);
    const targetId = target?._id;
    const now = Date.now();
    for (const folderId of folderIds) {
      if (await isWithin(ctx, targetId, folderId)) {
        throw new ConvexError("A folder can’t go inside itself.");
      }
      const folder = await ctx.db.get(folderId);
      if (
        folder?.projectId !== projectId ||
        isGone(folder) ||
        folder.parentId === targetId
      ) {
        continue;
      }
      const name = await freeName(
        ctx,
        projectId,
        targetId,
        folder.name,
        folderId
      );
      await ctx.db.patch(folderId, {
        name,
        nameKey: nameKey(name),
        parentId: targetId,
        updatedAt: now,
      });
    }
    for (const fileId of fileIds) {
      const item = await ctx.db.get(fileId);
      if (
        item?.projectId !== projectId ||
        item.trashedAt !== undefined ||
        item.folderId === targetId
      ) {
        continue;
      }
      const from = item.folderId ? await ctx.db.get(item.folderId) : null;
      const name = await freeName(ctx, projectId, targetId, item.name, fileId);
      await ctx.db.patch(fileId, {
        folderId: targetId,
        name,
        nameKey: nameKey(name),
        updatedAt: now,
      });
      await record(ctx, fileId, user._id, {
        from: from?.name,
        kind: "moved",
        to: target?.name,
      });
    }
  },
});

/**
 * Puts files and folders in the trash, for 30 days. Owners can trash
 * anything; others only what they added, and folders holding nothing else.
 */
export const trash = mutation({
  args: vItems,
  handler: async (ctx, { fileIds, folderIds, projectId }) => {
    checkBatch(fileIds, folderIds);
    const access = await requireProject(ctx, projectId, "edit");
    const { user } = access;
    const now = Date.now();
    for (const folderId of folderIds) {
      const folder = await ctx.db.get(folderId);
      if (folder?.projectId !== projectId || isGone(folder)) {
        continue;
      }
      if (!(isOwner(access) || (await allAddedBy(ctx, folder, user._id)))) {
        throw new ConvexError(
          "Only the project’s owners can delete folders with others’ files."
        );
      }
      await ctx.db.patch(folderId, { trashedAt: now, trashedBy: user._id });
    }
    for (const fileId of fileIds) {
      const item = await ctx.db.get(fileId);
      if (item?.projectId !== projectId || item.trashedAt !== undefined) {
        continue;
      }
      if (!mayTrash(access, item.uploadedBy)) {
        throw new ConvexError(
          "Only the project’s owners can delete files others uploaded."
        );
      }
      await ctx.db.patch(fileId, { trashedAt: now, trashedBy: user._id });
      await record(ctx, fileId, user._id, { kind: "trashed" });
    }
  },
});

/**
 * Takes files and folders out of the trash, back where they were or, if that
 * folder is in the trash too, the nearest one above it that isn't.
 */
export const restore = mutation({
  args: vItems,
  handler: async (ctx, { fileIds, folderIds, projectId }) => {
    checkBatch(fileIds, folderIds);
    const access = await requireProject(ctx, projectId, "edit");
    const { user } = access;
    const now = Date.now();
    for (const folderId of folderIds) {
      const folder = await ctx.db.get(folderId);
      if (
        folder?.projectId !== projectId ||
        folder.deleting ||
        folder.trashedAt === undefined
      ) {
        continue;
      }
      if (!(isOwner(access) || folder.trashedBy === user._id)) {
        throw refuseRestore();
      }
      const home = await nearestLive(ctx, folder.parentId);
      const name = await freeName(ctx, projectId, home, folder.name, folderId);
      await ctx.db.patch(folderId, {
        name,
        nameKey: nameKey(name),
        parentId: home,
        trashedAt: undefined,
        trashedBy: undefined,
        updatedAt: now,
      });
    }
    for (const fileId of fileIds) {
      const item = await ctx.db.get(fileId);
      if (item?.projectId !== projectId || item.trashedAt === undefined) {
        continue;
      }
      if (!(isOwner(access) || item.trashedBy === user._id)) {
        throw refuseRestore();
      }
      const home = await nearestLive(ctx, item.folderId);
      const name = await freeName(ctx, projectId, home, item.name, fileId);
      await ctx.db.patch(fileId, {
        folderId: home,
        name,
        nameKey: nameKey(name),
        trashedAt: undefined,
        trashedBy: undefined,
        updatedAt: now,
      });
      await record(ctx, fileId, user._id, { kind: "restored" });
    }
  },
});

/** Starts deleting a trashed folder for good, a batch at a time. */
async function purgeFolder(
  ctx: MutationCtx,
  folder: Doc<"driveFolders">
): Promise<void> {
  await ctx.db.patch(folder._id, { deleting: true, trashedAt: undefined });
  await ctx.scheduler.runAfter(0, internal.cleanup.driveFolder, {
    folderId: folder._id,
  });
}

/** Deletes trashed files and folders for good, before the 30 days are up. Only owners can. */
export const purge = mutation({
  args: vItems,
  handler: async (ctx, { fileIds, folderIds, projectId }) => {
    checkBatch(fileIds, folderIds);
    await requireProject(ctx, projectId, "manage");
    for (const folderId of folderIds) {
      const folder = await ctx.db.get(folderId);
      if (
        folder?.projectId === projectId &&
        folder.trashedAt !== undefined &&
        !folder.deleting
      ) {
        await purgeFolder(ctx, folder);
      }
    }
    for (const fileId of fileIds) {
      const item = await ctx.db.get(fileId);
      if (item?.projectId === projectId && item.trashedAt !== undefined) {
        await deleteDriveFile(ctx, item);
      }
    }
  },
});

/**
 * Deletes a batch of what was trashed before `before`, in one project or in
 * all of them. Resolves with whether there's more.
 */
async function purgeTrashed(
  ctx: MutationCtx,
  before: number,
  projectId?: Id<"projects">
): Promise<boolean> {
  const files = await (
    projectId
      ? ctx.db
          .query("driveFiles")
          .withIndex("by_project_and_trashed", (q) =>
            q
              .eq("projectId", projectId)
              .gte("trashedAt", 0)
              .lt("trashedAt", before)
          )
      : ctx.db
          .query("driveFiles")
          .withIndex("by_trashed_at", (q) =>
            q.gte("trashedAt", 0).lt("trashedAt", before)
          )
  ).take(FILE_BATCH);
  for (const item of files) {
    await deleteDriveFile(ctx, item);
  }
  const folders = await (
    projectId
      ? ctx.db
          .query("driveFolders")
          .withIndex("by_project_and_trashed", (q) =>
            q
              .eq("projectId", projectId)
              .gte("trashedAt", 0)
              .lt("trashedAt", before)
          )
      : ctx.db
          .query("driveFolders")
          .withIndex("by_trashed_at", (q) =>
            q.gte("trashedAt", 0).lt("trashedAt", before)
          )
  ).take(BATCH);
  for (const folder of folders) {
    await purgeFolder(ctx, folder);
  }
  return files.length === FILE_BATCH || folders.length === BATCH;
}

/** Deletes everything in the Drive's trash for good. Only owners can. */
export const emptyTrash = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    await requireProject(ctx, projectId, "manage");
    const before = Date.now() + 1;
    if (await purgeTrashed(ctx, before, projectId)) {
      await ctx.scheduler.runAfter(0, internal.drive.emptyTrashBatch, {
        before,
        projectId,
      });
    }
  },
});

export const emptyTrashBatch = internalMutation({
  args: { before: v.number(), projectId: v.id("projects") },
  handler: async (ctx, { before, projectId }) => {
    if (await purgeTrashed(ctx, before, projectId)) {
      await ctx.scheduler.runAfter(0, internal.drive.emptyTrashBatch, {
        before,
        projectId,
      });
    }
  },
});

/**
 * Run every day: deletes what's been in any trash for 30 days, and uploads
 * left behind without being filed.
 */
export const purgeExpired = internalMutation({
  args: {},
  handler: async (ctx) => {
    const more = await purgeTrashed(ctx, Date.now() - TRASH_MS);
    const left = await ctx.db
      .query("driveUploads")
      .withIndex("by_creation_time", (q) =>
        q.lt("_creationTime", Date.now() - LEFT_BEHIND_MS)
      )
      .take(BATCH);
    for (const row of left) {
      await ctx.db.delete(row._id);
      const filed = await ctx.db
        .query("driveFiles")
        .withIndex("by_key", (q) => q.eq("key", row.key))
        .first();
      if (!filed) {
        await dropFile(ctx, row.key);
      }
    }
    if (more || left.length === BATCH) {
      await ctx.scheduler.runAfter(0, internal.drive.purgeExpired, {});
    }
  },
});

// ———————————————————————————————————————— Per person

/** Stars a file or folder for the signed-in person, or takes the star off. */
export const star = mutation({
  args: {
    fileId: v.optional(v.id("driveFiles")),
    folderId: v.optional(v.id("driveFolders")),
    starred: v.boolean(),
  },
  handler: async (ctx, { fileId, folderId, starred }) => {
    let access: ProjectAccess;
    if (fileId) {
      access = await requireDriveFile(ctx, fileId, "view");
    } else if (folderId) {
      access = await requireDriveFolder(ctx, folderId, "view");
    } else {
      return;
    }
    const { project, user } = access;
    const rows = await ctx.db
      .query("driveStars")
      .withIndex("by_user_and_project", (q) =>
        q.eq("userId", user._id).eq("projectId", project._id)
      )
      .collect();
    const mine = rows.filter((row) =>
      fileId ? row.fileId === fileId : row.folderId === folderId
    );
    if (starred && mine.length === 0) {
      await ctx.db.insert("driveStars", {
        fileId,
        folderId: fileId ? undefined : folderId,
        projectId: project._id,
        userId: user._id,
      });
    } else if (!starred) {
      for (const row of mine) {
        await ctx.db.delete(row._id);
      }
    }
  },
});

/** Notes that the signed-in person opened a file, for their recent files. */
export const opened = mutation({
  args: { fileId: v.id("driveFiles") },
  handler: async (ctx, { fileId }) => {
    const access = await ifVisible(requireDriveFile(ctx, fileId, "view"));
    if (!access) {
      return;
    }
    const { file: item, user } = access;
    const now = Date.now();
    const previous = await ctx.db
      .query("driveOpens")
      .withIndex("by_user_and_file", (q) =>
        q.eq("userId", user._id).eq("fileId", fileId)
      )
      .first();
    if (previous) {
      if (now - previous.at > REOPEN_MS) {
        await ctx.db.patch(previous._id, { at: now });
      }
      return;
    }
    await ctx.db.insert("driveOpens", {
      at: now,
      fileId,
      projectId: item.projectId,
      userId: user._id,
    });
    const opens = await ctx.db
      .query("driveOpens")
      .withIndex("by_user_and_project_and_at", (q) =>
        q.eq("userId", user._id).eq("projectId", item.projectId)
      )
      .order("desc")
      .take(KEEP_OPENS + 10);
    for (const old of opens.slice(KEEP_OPENS)) {
      await ctx.db.delete(old._id);
    }
  },
});

/**
 * A short-lived link to the file under the name it has now: to save it, or
 * to read it in the app, like the text of a CSV. Checks the person is still
 * on the project, unlike the file's own link.
 */
export const link = mutation({
  args: { download: v.boolean(), fileId: v.id("driveFiles") },
  handler: async (ctx, { download, fileId }) => {
    const { file: item } = await requireDriveFile(ctx, fileId, "view");
    return await signedLink(item, download);
  },
});

// ———————————————————————————————————————— Comments

/** Comments on a file. Everyone it mentions who can see the project gets a notification. */
export const comment = mutation({
  args: { content: v.string(), fileId: v.id("driveFiles") },
  handler: async (ctx, { content, fileId }) => {
    const { file: item, user } = await requireDriveFile(ctx, fileId, "edit");
    const text = content.trim().slice(0, MAX_COMMENT);
    if (!text) {
      throw new ConvexError("Write something first.");
    }
    const driveCommentId = await ctx.db.insert("driveComments", {
      authorId: user._id,
      content: text,
      fileId,
    });
    for (const mentioned of mentionedUsers(text)) {
      const userId = ctx.db.normalizeId("users", mentioned);
      if (
        userId &&
        userId !== user._id &&
        (await canSee(ctx, userId, item.projectId))
      ) {
        await ctx.db.insert("notifications", {
          actorId: user._id,
          archived: false,
          content: text,
          driveCommentId,
          fileId,
          read: false,
          userId,
        });
      }
    }
    return driveCommentId;
  },
});

/** Deletes your comment, and the notifications it sent. */
export const removeComment = mutation({
  args: { commentId: v.id("driveComments") },
  handler: async (ctx, { commentId }) => {
    const found = await ctx.db.get(commentId);
    if (!found) {
      return;
    }
    const { user } = await requireDriveFile(ctx, found.fileId, "edit");
    if (found.authorId !== user._id) {
      throw new ConvexError("You can only delete your own comments.");
    }
    const notifications = await ctx.db
      .query("notifications")
      .withIndex("by_drive_comment", (q) => q.eq("driveCommentId", commentId))
      .collect();
    for (const notification of notifications) {
      await ctx.db.delete(notification._id);
    }
    await ctx.db.delete(commentId);
  },
});
