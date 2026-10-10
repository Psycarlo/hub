import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { requireUser, roleIn } from "./lib/access";
import type { ProjectRole } from "./shared/model";

/** Newest notifications shown. */
const LIMIT = 200;

interface Notification {
  _id: Id<"notifications">;
  _creationTime: number;
  actorId: Id<"users">;
  content: string;
  read: boolean;
  /** Where the card, page or file sits, which its links go through. */
  project: { slug: string };
}

/** A mention in a card comment. */
export interface CommentMention extends Notification {
  kind: "comment";
  card: { _id: Id<"cards">; number: number; title: string };
  board: { _id: Id<"boards">; code: string; title: string };
}

/** A mention on a doc page. */
export interface PageMention extends Notification {
  kind: "page";
  page: {
    _id: Id<"docPages">;
    title: string;
    icon: string;
    hasContent: boolean;
  };
}

/** A mention in a comment on a Drive file. */
export interface FileMention extends Notification {
  kind: "file";
  file: {
    _id: Id<"driveFiles">;
    name: string;
    type: string;
    folderId?: Id<"driveFolders">;
  };
}

export type InboxItem = CommentMention | PageMention | FileMention;

/** The person's role on a project, or null when they can't see it. */
type RoleOf = (project: Doc<"projects">) => Promise<ProjectRole | null>;

/** The card, page or file a notification points at, or null once it's gone or out of sight. */
async function itemOf(
  ctx: QueryCtx,
  roleOf: RoleOf,
  notification: Doc<"notifications">
): Promise<InboxItem | null> {
  const common = {
    _creationTime: notification._creationTime,
    _id: notification._id,
    actorId: notification.actorId,
    content: notification.content,
    read: notification.read,
  };
  if ("pageId" in notification) {
    const page = await ctx.db.get(notification.pageId);
    const project = page ? await ctx.db.get(page.projectId) : null;
    // Pages on projects the person has since left drop out.
    if (!(page && project && (await roleOf(project)))) {
      return null;
    }
    return {
      ...common,
      kind: "page",
      page: {
        _id: page._id,
        hasContent: page.content.trim() !== "",
        icon: page.icon,
        title: page.title,
      },
      project: { slug: project.slug },
    };
  }
  if ("fileId" in notification) {
    const file = await ctx.db.get(notification.fileId);
    const project = file ? await ctx.db.get(file.projectId) : null;
    // Trashed files, and files on projects the person has since left, drop out.
    if (
      !(file && project && (await roleOf(project))) ||
      file.trashedAt !== undefined
    ) {
      return null;
    }
    return {
      ...common,
      file: {
        _id: file._id,
        folderId: file.folderId,
        name: file.name,
        type: file.type,
      },
      kind: "file",
      project: { slug: project.slug },
    };
  }
  const card = await ctx.db.get(notification.cardId);
  const board = card ? await ctx.db.get(card.boardId) : null;
  const project = board ? await ctx.db.get(board.projectId) : null;
  // Cards on projects the person has since left drop out.
  if (!(card && board && project && (await roleOf(project)))) {
    return null;
  }
  return {
    ...common,
    board: { _id: board._id, code: board.code, title: board.title },
    card: { _id: card._id, number: card.number, title: card.title },
    kind: "comment",
    project: { slug: project.slug },
  };
}

/** The signed-in person's notifications that aren't archived, newest first. */
export const list = query({
  args: {},
  handler: async (ctx): Promise<InboxItem[]> => {
    const user = await requireUser(ctx);
    const notifications = await ctx.db
      .query("notifications")
      .withIndex("by_user_and_archived", (q) =>
        q.eq("userId", user._id).eq("archived", false)
      )
      .order("desc")
      .take(LIMIT);
    // Most notifications share a few projects: each role is looked up once.
    const roles = new Map<Id<"projects">, Promise<ProjectRole | null>>();
    const roleOf: RoleOf = (project) => {
      const known = roles.get(project._id);
      if (known) {
        return known;
      }
      const role = roleIn(ctx, user, project);
      roles.set(project._id, role);
      return role;
    };
    const items = await Promise.all(
      notifications.map((notification) => itemOf(ctx, roleOf, notification))
    );
    return items.filter((item) => item !== null);
  },
});

export const setRead = mutation({
  args: { ids: v.array(v.id("notifications")), read: v.boolean() },
  handler: async (ctx, { ids, read }) => {
    const user = await requireUser(ctx);
    for (const id of ids) {
      const notification = await ctx.db.get(id);
      if (notification?.userId === user._id && notification.read !== read) {
        await ctx.db.patch(id, { read });
      }
    }
  },
});

export const archive = mutation({
  args: { ids: v.array(v.id("notifications")) },
  handler: async (ctx, { ids }) => {
    const user = await requireUser(ctx);
    for (const id of ids) {
      const notification = await ctx.db.get(id);
      if (notification?.userId === user._id) {
        await ctx.db.patch(id, { archived: true, read: true });
      }
    }
  },
});

/** Opening a card reads the mentions of you in it. */
export const readCard = mutation({
  args: { cardId: v.id("cards") },
  handler: async (ctx, { cardId }) => {
    const user = await requireUser(ctx);
    const notifications = await ctx.db
      .query("notifications")
      .withIndex("by_card", (q) => q.eq("cardId", cardId))
      .collect();
    for (const notification of notifications) {
      if (notification.userId === user._id && !notification.read) {
        await ctx.db.patch(notification._id, { read: true });
      }
    }
  },
});

/** Opening a page reads the mentions of you on it. */
export const readPage = mutation({
  args: { pageId: v.id("docPages") },
  handler: async (ctx, { pageId }) => {
    const user = await requireUser(ctx);
    const notifications = await ctx.db
      .query("notifications")
      .withIndex("by_page_and_user", (q) =>
        q.eq("pageId", pageId).eq("userId", user._id)
      )
      .collect();
    for (const notification of notifications) {
      if (!notification.read) {
        await ctx.db.patch(notification._id, { read: true });
      }
    }
  },
});

/** Opening a Drive file reads the mentions of you in its comments. */
export const readFile = mutation({
  args: { fileId: v.id("driveFiles") },
  handler: async (ctx, { fileId }) => {
    const user = await requireUser(ctx);
    const notifications = await ctx.db
      .query("notifications")
      .withIndex("by_file_and_user", (q) =>
        q.eq("fileId", fileId).eq("userId", user._id)
      )
      .collect();
    for (const notification of notifications) {
      if (!notification.read) {
        await ctx.db.patch(notification._id, { read: true });
      }
    }
  },
});
