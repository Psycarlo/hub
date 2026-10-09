import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

/** Lets go of a bitcoin buy that's gone or no longer a buy: the debits that paid for it stay. */
export async function releaseBuy(
  ctx: MutationCtx,
  projectId: Id<"projects">,
  buyId: Id<"portfolioTransactions">
): Promise<void> {
  const entries = await ctx.db
    .query("financeEntries")
    .withIndex("by_project_and_buy", (q) =>
      q.eq("projectId", projectId).eq("buyId", buyId)
    )
    .collect();
  for (const entry of entries) {
    await ctx.db.patch(entry._id, { buyId: undefined });
  }
}
