import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { internalMutation } from "./_generated/server";

const BATCH = 100;

/** When the card's history last saw it move to done, or its last change should it never have. */
async function lastDone(ctx: QueryCtx, card: Doc<"cards">): Promise<number> {
  const events = ctx.db
    .query("cardEvents")
    .withIndex("by_card", (q) => q.eq("cardId", card._id))
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
