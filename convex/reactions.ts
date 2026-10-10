import { ConvexError, v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { ifVisible, requireCard } from "./lib/access";

/** Different emoji one card or comment can be reacted with. */
const MAX_KINDS = 20;
/** Longer than any emoji, family and flag sequences included. */
const MAX_EMOJI = 32;
/** What emoji are made of: pictures, joiners, skin tones and the like. */
const EMOJI_PARTS = /^[\p{Extended_Pictographic}\p{Emoji_Component}]+$/u;
/** What makes them a picture, not a digit or a letter on its own. */
const PICTURE = /[\p{Extended_Pictographic}\p{Regional_Indicator}⃣]/u;

function isEmoji(text: string): boolean {
  return (
    text.length <= MAX_EMOJI && EMOJI_PARTS.test(text) && PICTURE.test(text)
  );
}

/** Deletes the reactions to a comment. */
export async function dropCommentReactions(
  ctx: MutationCtx,
  comment: Doc<"comments">
): Promise<void> {
  const reactions = await ctx.db
    .query("reactions")
    .withIndex("by_card_and_comment", (q) =>
      q.eq("cardId", comment.cardId).eq("commentId", comment._id)
    )
    .collect();
  for (const reaction of reactions) {
    await ctx.db.delete(reaction._id);
  }
}

export interface ReactionGroup {
  /** The comment reacted to; missing for the card itself. */
  commentId?: Id<"comments">;
  emoji: string;
  /** Who reacted with it, first first. */
  users: Id<"users">[];
}

/**
 * Reactions on a card and its comments, each emoji once per card or comment
 * with who reacted with it, in the order they were first used.
 */
export const list = query({
  args: { cardId: v.id("cards") },
  handler: async (ctx, { cardId }): Promise<ReactionGroup[]> => {
    if (!(await ifVisible(requireCard(ctx, cardId, "view")))) {
      return [];
    }
    const reactions = await ctx.db
      .query("reactions")
      .withIndex("by_card_and_comment", (q) => q.eq("cardId", cardId))
      .collect();
    const groups = new Map<string, ReactionGroup>();
    for (const { commentId, emoji, userId } of reactions) {
      const key = `${commentId ?? ""}:${emoji}`;
      const group = groups.get(key);
      if (group) {
        group.users.push(userId);
      } else {
        groups.set(key, { commentId, emoji, users: [userId] });
      }
    }
    return [...groups.values()];
  },
});

/** Reacts to a card, or to a comment on it, with an emoji, or takes that back. */
export const set = mutation({
  args: {
    cardId: v.id("cards"),
    commentId: v.optional(v.id("comments")),
    emoji: v.string(),
    reacted: v.boolean(),
  },
  handler: async (ctx, { cardId, commentId, emoji, reacted }) => {
    const { user } = await requireCard(ctx, cardId, "edit");
    if (commentId) {
      const comment = await ctx.db.get(commentId);
      if (comment?.cardId !== cardId || comment.deleted) {
        throw new ConvexError("That comment is gone.");
      }
    }
    const reactions = await ctx.db
      .query("reactions")
      .withIndex("by_card_and_comment", (q) =>
        q.eq("cardId", cardId).eq("commentId", commentId)
      )
      .collect();
    const mine = reactions.find(
      (reaction) => reaction.userId === user._id && reaction.emoji === emoji
    );
    if (!reacted) {
      if (mine) {
        await ctx.db.delete(mine._id);
      }
      return;
    }
    if (mine) {
      return;
    }
    if (!isEmoji(emoji)) {
      throw new ConvexError("Only emoji can be reactions.");
    }
    const kinds = new Set(reactions.map((reaction) => reaction.emoji));
    if (!kinds.has(emoji) && kinds.size >= MAX_KINDS) {
      throw new ConvexError(
        `Up to ${MAX_KINDS} different emoji can be reactions here.`
      );
    }
    await ctx.db.insert("reactions", {
      cardId,
      commentId,
      emoji,
      userId: user._id,
    });
  },
});
