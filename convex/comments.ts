import { ConvexError, v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { canSee, ifVisible, requireCard } from "./lib/access";
import { mentionedUsers } from "./shared/mentions";

const MAX_COMMENT = 10_000;

/** Comments on a card, oldest first. */
export const list = query({
  args: { cardId: v.id("cards") },
  handler: async (ctx, { cardId }) => {
    if (!(await ifVisible(requireCard(ctx, cardId, "view")))) {
      return [];
    }
    const comments = await ctx.db
      .query("comments")
      .withIndex("by_card", (q) => q.eq("cardId", cardId))
      .collect();
    return comments.map((comment) => ({
      _creationTime: comment._creationTime,
      _id: comment._id,
      authorId: comment.authorId,
      content: comment.content,
    }));
  },
});

/** Adds a comment; everyone it mentions who can see the card gets a notification. */
export const add = mutation({
  args: { cardId: v.id("cards"), content: v.string() },
  handler: async (ctx, { cardId, content }) => {
    const { project, user } = await requireCard(ctx, cardId, "edit");
    const text = content.trim().slice(0, MAX_COMMENT);
    if (!text) {
      throw new ConvexError("Write something first.");
    }
    const commentId = await ctx.db.insert("comments", {
      authorId: user._id,
      cardId,
      content: text,
    });
    for (const mentioned of mentionedUsers(text)) {
      const userId = ctx.db.normalizeId("users", mentioned);
      if (
        userId &&
        userId !== user._id &&
        (await canSee(ctx, userId, project._id))
      ) {
        await ctx.db.insert("notifications", {
          actorId: user._id,
          archived: false,
          cardId,
          commentId,
          content: text,
          read: false,
          userId,
        });
      }
    }
    return commentId;
  },
});

export const remove = mutation({
  args: { commentId: v.id("comments") },
  handler: async (ctx, { commentId }) => {
    const comment = await ctx.db.get(commentId);
    if (!comment) {
      return;
    }
    const { user } = await requireCard(ctx, comment.cardId, "edit");
    if (comment.authorId !== user._id) {
      throw new ConvexError("You can only delete your own comments.");
    }
    const notifications = await ctx.db
      .query("notifications")
      .withIndex("by_comment", (q) => q.eq("commentId", commentId))
      .collect();
    for (const notification of notifications) {
      await ctx.db.delete(notification._id);
    }
    await ctx.db.delete(commentId);
  },
});
