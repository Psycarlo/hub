import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { requireUser, roleIn } from "./lib/access";

/** Newest notifications shown. */
const LIMIT = 200;

export interface InboxItem {
  _id: Id<"notifications">;
  _creationTime: number;
  actorId: Id<"users">;
  content: string;
  read: boolean;
  card: { _id: Id<"cards">; number: number; title: string };
  board: { _id: Id<"boards">; code: string; title: string };
  /** Where the board sits, which its links go through. */
  project: { slug: string };
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
    const items = await Promise.all(
      notifications.map(async (notification): Promise<InboxItem | null> => {
        const card = await ctx.db.get(notification.cardId);
        const board = card ? await ctx.db.get(card.boardId) : null;
        const project = board ? await ctx.db.get(board.projectId) : null;
        // Cards on projects the person has since left drop out.
        if (!(card && board && project && (await roleIn(ctx, user, project)))) {
          return null;
        }
        return {
          _creationTime: notification._creationTime,
          _id: notification._id,
          actorId: notification.actorId,
          board: { _id: board._id, code: board.code, title: board.title },
          card: { _id: card._id, number: card.number, title: card.title },
          content: notification.content,
          project: { slug: project.slug },
          read: notification.read,
        };
      })
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
