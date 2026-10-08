import { ConvexError, v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { attachFile, attachmentView, dropCommentFiles } from "./attachments";
import { canSee, ifVisible, requireCard } from "./lib/access";
import { vUpload } from "./lib/validators";
import { mentionedUsers } from "./shared/mentions";
import { MAX_COMMENT_FILES } from "./shared/model";

const MAX_COMMENT = 10_000;

/** The comment a reply goes under: the one replied to, or the one starting its thread. */
async function threadOf(
  ctx: QueryCtx,
  cardId: Id<"cards">,
  parentId: Id<"comments"> | undefined
): Promise<Id<"comments"> | undefined> {
  if (!parentId) {
    return undefined;
  }
  const parent = await ctx.db.get(parentId);
  if (parent?.cardId !== cardId) {
    throw new ConvexError("The comment you’re replying to is gone.");
  }
  return parent.parentId ?? parent._id;
}

async function hasReplies(
  ctx: QueryCtx,
  commentId: Id<"comments">
): Promise<boolean> {
  const reply = await ctx.db
    .query("comments")
    .withIndex("by_parent", (q) => q.eq("parentId", commentId))
    .first();
  return reply !== null;
}

/** Comments on a card, oldest first, each with the files it came with. */
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
    const files = await ctx.db
      .query("attachments")
      .withIndex("by_card_and_comment", (q) => q.eq("cardId", cardId))
      .collect();
    return comments.map((comment) => ({
      _creationTime: comment._creationTime,
      _id: comment._id,
      attachments: files
        .filter((file) => file.commentId === comment._id)
        .map(attachmentView),
      authorId: comment.authorId,
      content: comment.content,
      deleted: comment.deleted ?? false,
      parentId: comment.parentId,
    }));
  },
});

/**
 * Adds a comment, or a reply to one, with any files uploaded for it. Everyone
 * it mentions who can see the card gets a notification.
 */
export const add = mutation({
  args: {
    cardId: v.id("cards"),
    content: v.string(),
    files: v.optional(v.array(vUpload)),
    parentId: v.optional(v.id("comments")),
  },
  handler: async (ctx, { cardId, content, files = [], parentId }) => {
    const { project, user } = await requireCard(ctx, cardId, "edit");
    const text = content.trim().slice(0, MAX_COMMENT);
    if (!text && files.length === 0) {
      throw new ConvexError("Write something first.");
    }
    if (files.length > MAX_COMMENT_FILES) {
      throw new ConvexError(
        `A comment can carry up to ${MAX_COMMENT_FILES} files.`
      );
    }
    const commentId = await ctx.db.insert("comments", {
      authorId: user._id,
      cardId,
      content: text,
      parentId: await threadOf(ctx, cardId, parentId),
    });
    for (const file of files) {
      await attachFile(ctx, user._id, cardId, file, commentId);
    }
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

/**
 * Deletes your comment and its files. One with replies stays, without its
 * text, to hold them, and goes once they do.
 */
export const remove = mutation({
  args: { commentId: v.id("comments") },
  handler: async (ctx, { commentId }) => {
    const comment = await ctx.db.get(commentId);
    if (!comment || comment.deleted) {
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
    await dropCommentFiles(ctx, comment);
    if (await hasReplies(ctx, commentId)) {
      await ctx.db.patch(commentId, { content: "", deleted: true });
      return;
    }
    await ctx.db.delete(commentId);
    const parent = comment.parentId ? await ctx.db.get(comment.parentId) : null;
    if (parent?.deleted && !(await hasReplies(ctx, parent._id))) {
      await ctx.db.delete(parent._id);
    }
  },
});
