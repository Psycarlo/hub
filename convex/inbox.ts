import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { allows, requireUser, roleIn } from "./lib/access";
import { hasText } from "./lib/docs";
import { remindsOf } from "./lib/finance";
import type { Followable } from "./lib/notify";
import { follows } from "./lib/notify";
import type { CardChange } from "./lib/validators";
import type { EntryKind } from "./shared/finance";
import type { ProjectRole } from "./shared/model";
import type { CardNews, EntryNews, FileNews } from "./shared/notifications";

/** Newest notifications shown. */
const LIMIT = 200;

interface Notification {
  _id: Id<"notifications">;
  _creationTime: number;
  read: boolean;
  /** Where the card, page or file sits, which its links go through. */
  project: { slug: string; title: string };
}

/** News about a card: a mention, a comment, a change, or it coming due. */
export interface CardNotification extends Notification {
  kind: "card";
  /** Missing on reminders, which nobody sent. */
  actorId?: Id<"users">;
  reason: CardNews;
  /** What changed, on a change. */
  changes?: CardChange[];
  /** The comment, on a mention or comment. */
  content?: string;
  /** The day it was due when reminded, `YYYY-MM-DD`. */
  due?: string;
  /** Whether they still follow the card, so they can unsubscribe from here. */
  following: boolean;
  card: { _id: Id<"cards">; number: number; title: string };
  board: { _id: Id<"boards">; code: string; title: string };
}

/** A mention on a doc page. */
export interface PageNotification extends Notification {
  kind: "page";
  actorId: Id<"users">;
  content: string;
  page: {
    _id: Id<"docPages">;
    title: string;
    icon: string;
    hasContent: boolean;
  };
}

/** A mention in, or a comment on, a Drive file. */
export interface FileNotification extends Notification {
  kind: "file";
  actorId: Id<"users">;
  reason: FileNews;
  content: string;
  /** Whether they still follow the file, so they can unsubscribe from here. */
  following: boolean;
  file: {
    _id: Id<"driveFiles">;
    name: string;
    type: string;
    folderId?: Id<"driveFolders">;
  };
}

/** Being added to a project. */
export interface ProjectNotification extends Notification {
  kind: "project";
  actorId: Id<"users">;
  project: {
    _id: Id<"projects">;
    color: Doc<"projects">["color"];
    personalFor?: Id<"users">;
    slug: string;
    title: string;
  };
}

/** A finance entry still to pay or receive, coming due. */
export interface EntryNotification extends Notification {
  kind: "entry";
  /** Nobody sends a reminder. */
  actorId?: undefined;
  reason: EntryNews;
  /** The day it was due when reminded, `YYYY-MM-DD`. */
  due: string;
  /** Whether they can tick it paid from here. */
  editable: boolean;
  /** Whether they still hear of the account's bills, so they can turn that off from here. */
  following: boolean;
  entry: {
    _id: Id<"financeEntries">;
    cents: number;
    /** The day it falls on, which its month is opened at. */
    date: string;
    kind: EntryKind;
    name: string;
  };
  account: {
    _id: Id<"financeAccounts">;
    currency: Doc<"financeAccounts">["currency"];
    title: string;
  };
}

export type InboxItem =
  | CardNotification
  | PageNotification
  | FileNotification
  | ProjectNotification
  | EntryNotification;

/** The person's role on a project, or null when they can't see it. */
type RoleOf = (project: Doc<"projects">) => Promise<ProjectRole | null>;

/** Whether they follow a card or file, each looked up once. */
type FollowingOf = (item: Followable) => Promise<boolean>;

/** Lookups for the person's notifications, shared across them since most are about a few things. */
export function lookupsFor(
  ctx: QueryCtx,
  user: Doc<"users">
): { followingOf: FollowingOf; roleOf: RoleOf } {
  const roles = new Map<Id<"projects">, Promise<ProjectRole | null>>();
  const following = new Map<string, Promise<boolean>>();
  return {
    followingOf: (item) => {
      const known = following.get(item._id);
      if (known) {
        return known;
      }
      const result = follows(ctx, item, user._id);
      following.set(item._id, result);
      return result;
    },
    roleOf: (project) => {
      const known = roles.get(project._id);
      if (known) {
        return known;
      }
      const role = roleIn(ctx, user, project);
      roles.set(project._id, role);
      return role;
    },
  };
}

type Lookups = ReturnType<typeof lookupsFor>;

/** The notification row about one kind of thing. */
type RowAbout<Key extends string> = Extract<
  Doc<"notifications">,
  Record<Key, unknown>
>;

function commonOf(notification: Doc<"notifications">) {
  return {
    _creationTime: notification._creationTime,
    _id: notification._id,
    read: notification.read,
  };
}

async function pageItem(
  ctx: QueryCtx,
  { roleOf }: Lookups,
  notification: RowAbout<"pageId">
): Promise<PageNotification | null> {
  const page = await ctx.db.get(notification.pageId);
  const project = page ? await ctx.db.get(page.projectId) : null;
  // Pages on projects the person has since left drop out.
  if (!(page && project && (await roleOf(project)))) {
    return null;
  }
  return {
    ...commonOf(notification),
    actorId: notification.actorId,
    content: notification.content,
    kind: "page",
    page: {
      _id: page._id,
      hasContent: hasText(page),
      icon: page.icon,
      title: page.title,
    },
    project: { slug: project.slug, title: project.title },
  };
}

async function fileItem(
  ctx: QueryCtx,
  { followingOf, roleOf }: Lookups,
  notification: RowAbout<"fileId">
): Promise<FileNotification | null> {
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
    ...commonOf(notification),
    actorId: notification.actorId,
    content: notification.content,
    file: {
      _id: file._id,
      folderId: file.folderId,
      name: file.name,
      type: file.type,
    },
    following: await followingOf(file),
    kind: "file",
    project: { slug: project.slug, title: project.title },
    reason: notification.reason ?? "mention",
  };
}

async function projectItem(
  ctx: QueryCtx,
  { roleOf }: Lookups,
  notification: RowAbout<"projectId">
): Promise<ProjectNotification | null> {
  const project = await ctx.db.get(notification.projectId);
  if (!(project && (await roleOf(project)))) {
    return null;
  }
  return {
    ...commonOf(notification),
    actorId: notification.actorId,
    kind: "project",
    project: {
      _id: project._id,
      color: project.color,
      personalFor: project.personalFor,
      slug: project.slug,
      title: project.title,
    },
  };
}

async function cardItem(
  ctx: QueryCtx,
  { followingOf, roleOf }: Lookups,
  notification: RowAbout<"cardId">
): Promise<CardNotification | null> {
  const card = await ctx.db.get(notification.cardId);
  const board = card ? await ctx.db.get(card.boardId) : null;
  const project = board ? await ctx.db.get(board.projectId) : null;
  // Cards on projects the person has since left drop out.
  if (!(card && board && project && (await roleOf(project)))) {
    return null;
  }
  return {
    ...commonOf(notification),
    actorId: notification.actorId,
    board: { _id: board._id, code: board.code, title: board.title },
    card: { _id: card._id, number: card.number, title: card.title },
    changes: notification.changes,
    content: notification.content,
    due: notification.due,
    following: await followingOf(card),
    kind: "card",
    project: { slug: project.slug, title: project.title },
    reason: notification.reason ?? "mention",
  };
}

async function entryItem(
  ctx: QueryCtx,
  { roleOf }: Lookups,
  notification: RowAbout<"entryId">
): Promise<EntryNotification | null> {
  const entry = await ctx.db.get(notification.entryId);
  const account = entry ? await ctx.db.get(entry.accountId) : null;
  const project = account ? await ctx.db.get(account.projectId) : null;
  const role = project ? await roleOf(project) : null;
  // Settled since, or on a project the person has since left, it drops out.
  if (!(entry && account && project && role) || entry.paid) {
    return null;
  }
  return {
    ...commonOf(notification),
    account: {
      _id: account._id,
      currency: account.currency,
      title: account.title,
    },
    due: notification.due,
    editable: allows(role, "edit"),
    entry: {
      _id: entry._id,
      cents: entry.cents,
      date: entry.date,
      kind: entry.kind,
      name: entry.name,
    },
    following: await remindsOf(ctx, account._id, notification.userId),
    kind: "entry",
    project: { slug: project.slug, title: project.title },
    reason: notification.reason,
  };
}

/** What a notification is about, or null once that's gone or out of sight. */
export function itemOf(
  ctx: QueryCtx,
  lookups: Lookups,
  notification: Doc<"notifications">
): Promise<InboxItem | null> {
  if ("entryId" in notification) {
    return entryItem(ctx, lookups, notification);
  }
  if ("pageId" in notification) {
    return pageItem(ctx, lookups, notification);
  }
  if ("fileId" in notification) {
    return fileItem(ctx, lookups, notification);
  }
  if ("projectId" in notification) {
    return projectItem(ctx, lookups, notification);
  }
  return cardItem(ctx, lookups, notification);
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
    const lookups = lookupsFor(ctx, user);
    const items = await Promise.all(
      notifications.map((notification) => itemOf(ctx, lookups, notification))
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

/** Archives notifications, which reads them, or brings them back as they were. */
export const setArchived = mutation({
  args: {
    archived: v.boolean(),
    ids: v.array(v.id("notifications")),
    /** Brought back unread, should they have been unread when archived. */
    unread: v.optional(v.array(v.id("notifications"))),
  },
  handler: async (ctx, { archived, ids, unread = [] }) => {
    const user = await requireUser(ctx);
    for (const id of ids) {
      const notification = await ctx.db.get(id);
      if (notification?.userId === user._id) {
        await ctx.db.patch(id, {
          archived,
          read: archived || !unread.includes(id),
        });
      }
    }
  },
});

/** Opening a card reads the news about it. */
export const readCard = mutation({
  args: { cardId: v.id("cards") },
  handler: async (ctx, { cardId }) => {
    const user = await requireUser(ctx);
    const notifications = await ctx.db
      .query("notifications")
      .withIndex("by_card_and_user", (q) =>
        q.eq("cardId", cardId).eq("userId", user._id)
      )
      .collect();
    for (const notification of notifications) {
      if (!notification.read) {
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

/** Opening a Drive file reads the news about it. */
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

/** Opening a project reads being added to it. */
export const readProject = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const user = await requireUser(ctx);
    const notifications = await ctx.db
      .query("notifications")
      .withIndex("by_project_and_user", (q) =>
        q.eq("projectId", projectId).eq("userId", user._id)
      )
      .collect();
    for (const notification of notifications) {
      if (!notification.read) {
        await ctx.db.patch(notification._id, { read: true });
      }
    }
  },
});
