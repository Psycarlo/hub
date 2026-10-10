import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { internalMutation } from "./_generated/server";

const BATCH = 100;
/** A page and its text can each run to half a megabyte: a few per batch. */
const PAGE_BATCH = 5;

/** When the card's history last saw it move to done, or its last change should it never have. */
async function lastDone(ctx: QueryCtx, card: Doc<"cards">): Promise<number> {
  const events = ctx.db
    .query("cardEvents")
    .withIndex("by_card_and_at", (q) => q.eq("cardId", card._id))
    .order("desc");
  for await (const { at, change } of events) {
    if (change.kind === "status" && change.to === "done") {
      return at;
    }
  }
  return card.updatedAt;
}

/**
 * Stamps `doneAt` on cards done before it was kept. Run once per deployment with
 * `pnpm convex run migrations:backfillDoneAt`; it works through every card by itself.
 */
export const backfillDoneAt = internalMutation({
  args: { cursor: v.optional(v.string()) },
  handler: async (ctx, { cursor }): Promise<void> => {
    const { page, isDone, continueCursor } = await ctx.db
      .query("cards")
      .paginate({ cursor: cursor ?? null, numItems: BATCH });
    for (const card of page) {
      if (card.status === "done" && card.doneAt === undefined) {
        await ctx.db.patch(card._id, { doneAt: await lastDone(ctx, card) });
      }
    }
    if (!isDone) {
      await ctx.scheduler.runAfter(0, internal.migrations.backfillDoneAt, {
        cursor: continueCursor,
      });
    }
  },
});

/**
 * Takes each page's text off the page, leaving it in the page's newest
 * revision, where saves keep it now, so lists of pages read no text. Run once
 * per deployment with `pnpm convex run migrations:movePageText`; it works
 * through every page by itself.
 */
export const movePageText = internalMutation({
  args: { cursor: v.optional(v.string()) },
  handler: async (ctx, { cursor }): Promise<void> => {
    const {
      page: pages,
      isDone,
      continueCursor,
    } = await ctx.db
      .query("docPages")
      .paginate({ cursor: cursor ?? null, numItems: PAGE_BATCH });
    for (const page of pages) {
      const { content } = page;
      if (content === undefined) {
        continue;
      }
      const newest = await ctx.db
        .query("docRevisions")
        .withIndex("by_page_and_revision", (q) =>
          q.eq("pageId", page._id).eq("revision", page.revision)
        )
        .unique();
      // The page's own copy is what it reads now, should the two differ.
      if (!newest) {
        await ctx.db.insert("docRevisions", {
          authorId: page.updatedBy,
          content,
          pageId: page._id,
          revision: page.revision,
        });
      } else if (newest.content !== content) {
        await ctx.db.patch(newest._id, { content });
      }
      await ctx.db.patch(page._id, {
        content: undefined,
        hasContent: content.trim() !== "",
      });
    }
    if (!isDone) {
      await ctx.scheduler.runAfter(0, internal.migrations.movePageText, {
        cursor: continueCursor,
      });
    }
  },
});
