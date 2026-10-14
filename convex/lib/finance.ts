import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { signedCents } from "../shared/finance";

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

function reminderChoice(
  ctx: QueryCtx,
  accountId: Id<"financeAccounts">,
  userId: Id<"users">
) {
  return ctx.db
    .query("subscriptions")
    .withIndex("by_account_and_user", (q) =>
      q.eq("accountId", accountId).eq("userId", userId)
    )
    .unique();
}

/** Whether they hear of the account's bills coming due: they do, unless they turned it off. */
export async function remindsOf(
  ctx: QueryCtx,
  accountId: Id<"financeAccounts">,
  userId: Id<"users">
): Promise<boolean> {
  const choice = await reminderChoice(ctx, accountId, userId);
  return choice?.subscribed ?? true;
}

/** Who turned the account's reminders off. */
export async function mutedOn(
  ctx: QueryCtx,
  accountId: Id<"financeAccounts">
): Promise<Set<Id<"users">>> {
  const rows = await ctx.db
    .query("subscriptions")
    .withIndex("by_account_and_user", (q) => q.eq("accountId", accountId))
    .collect();
  return new Set(rows.flatMap((row) => (row.subscribed ? [] : [row.userId])));
}

/** Turns the account's reminders on or off for someone. */
export async function setReminding(
  ctx: MutationCtx,
  accountId: Id<"financeAccounts">,
  userId: Id<"users">,
  subscribed: boolean
): Promise<void> {
  const row = await reminderChoice(ctx, accountId, userId);
  if (!row) {
    await ctx.db.insert("subscriptions", { accountId, subscribed, userId });
  } else if (row.subscribed !== subscribed) {
    await ctx.db.patch(row._id, { subscribed });
  }
}

/** Takes back the reminders an entry sent, once it's settled, gone or due another day. */
export async function dropReminders(
  ctx: MutationCtx,
  entryId: Id<"financeEntries">
): Promise<void> {
  const reminders = await ctx.db
    .query("notifications")
    .withIndex("by_entry_and_user", (q) => q.eq("entryId", entryId))
    .collect();
  for (const reminder of reminders) {
    await ctx.db.delete(reminder._id);
  }
}

/**
 * What the account's paid and received entries add up to from `from` on, a
 * date or a `YYYY-MM` month; every one without it.
 */
export async function paidSince(
  ctx: QueryCtx,
  accountId: Id<"financeAccounts">,
  from = ""
): Promise<number> {
  const entries = await ctx.db
    .query("financeEntries")
    .withIndex("by_account_and_paid_and_date", (q) =>
      q.eq("accountId", accountId).eq("paid", true).gte("date", from)
    )
    .collect();
  return entries.reduce((sum, entry) => sum + signedCents(entry), 0);
}

/** What the account holds, worked out from its entries should it never have been settled. */
export async function balanceOf(
  ctx: QueryCtx,
  account: Doc<"financeAccounts">
): Promise<number> {
  return (
    account.balanceCents ??
    (account.openingCents ?? 0) + (await paidSince(ctx, account._id))
  );
}

/**
 * Keeps the account's balance current. Runs after every change to its
 * opening or its entries' money, on each account a change reaches.
 */
export async function settle(
  ctx: MutationCtx,
  ...accountIds: (Id<"financeAccounts"> | undefined)[]
): Promise<void> {
  for (const accountId of new Set(accountIds)) {
    const account = accountId && (await ctx.db.get(accountId));
    if (!account) {
      continue;
    }
    const balanceCents =
      (account.openingCents ?? 0) + (await paidSince(ctx, account._id));
    if (balanceCents !== account.balanceCents) {
      await ctx.db.patch(account._id, { balanceCents });
    }
  }
}
