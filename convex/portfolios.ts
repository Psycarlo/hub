import { ConvexError, v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import type { ProjectAccess } from "./lib/access";
import {
  ifVisible,
  requirePortfolio,
  requireProject,
  requireTransaction,
  requireUser,
  visibleProjects,
} from "./lib/access";
import { releaseBuy } from "./lib/finance";
import { vFiat, vTransactionKind } from "./lib/validators";
import { canManageRole } from "./shared/model";
import type { TransactionKind } from "./shared/portfolio";
import { MAX_SATS, byTime, signedSats } from "./shared/portfolio";

type Transaction = Doc<"portfolioTransactions">;

const MAX_TITLE = 80;
const MAX_DESCRIPTION = 500;
const MAX_NOTE = 1000;
/** Far above anything a bitcoin has cost, to catch a slipped finger. */
const MAX_PRICE = 1_000_000_000;
/** The genesis block, 3 January 2009: nothing was bought before it. */
const GENESIS = Date.UTC(2009, 0, 3);
/** Room for a device clock that runs a little ahead. */
const CLOCK_SKEW = 10 * 60 * 1000;

/** Portfolios in every project the signed-in person can see. */
export const list = query({
  args: {},
  handler: async (ctx): Promise<Doc<"portfolios">[]> => {
    const user = await requireUser(ctx);
    const projects = await visibleProjects(ctx, user);
    const portfolios = await Promise.all(
      projects.map(({ project }) =>
        ctx.db
          .query("portfolios")
          .withIndex("by_project", (q) => q.eq("projectId", project._id))
          .collect()
      )
    );
    return portfolios
      .flat()
      .toSorted(
        (a, b) => a.title.localeCompare(b.title) || a._id.localeCompare(b._id)
      );
  },
});

/**
 * Every transaction in the project's portfolios, oldest first, or null once
 * the project is gone or no longer shared.
 */
export const transactions = query({
  args: { projectId: v.id("projects") },
  handler: async (
    ctx,
    { projectId }
  ): Promise<Doc<"portfolioTransactions">[] | null> => {
    const access = await ifVisible(requireProject(ctx, projectId, "view"));
    if (!access) {
      return null;
    }
    const rows = await ctx.db
      .query("portfolioTransactions")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .collect();
    return rows.toSorted(byTime);
  },
});

function cleanTitle(title: string): string {
  const trimmed = title.trim().slice(0, MAX_TITLE);
  if (!trimmed) {
    throw new ConvexError("Give the portfolio a name.");
  }
  return trimmed;
}

function cleanSats(sats: number): number {
  if (!Number.isSafeInteger(sats) || sats <= 0) {
    throw new ConvexError("Enter an amount of at least one satoshi.");
  }
  if (sats > MAX_SATS) {
    throw new ConvexError("That’s more bitcoin than there will ever be.");
  }
  return sats;
}

function cleanPrice(price: number): number {
  if (!Number.isFinite(price) || price <= 0 || price > MAX_PRICE) {
    throw new ConvexError("Enter what one bitcoin cost.");
  }
  return price;
}

/** An exchange's fee in fiat, rounded to cents; none when zero. */
function cleanFee(fee: number | undefined): number | undefined {
  if (fee === undefined || fee === 0) {
    return undefined;
  }
  if (!Number.isFinite(fee) || fee < 0 || fee > MAX_PRICE) {
    throw new ConvexError("Enter a fee of zero or more.");
  }
  return Math.round(fee * 100) / 100;
}

/** A network fee in satoshis; none when zero. */
function cleanFeeSats(feeSats: number | undefined): number | undefined {
  if (feeSats === undefined || feeSats === 0) {
    return undefined;
  }
  if (!Number.isSafeInteger(feeSats) || feeSats < 0) {
    throw new ConvexError("Enter the fee in whole satoshis.");
  }
  if (feeSats > MAX_SATS) {
    throw new ConvexError("That fee is more bitcoin than there will ever be.");
  }
  return feeSats;
}

/** The fees the kind takes: fiat on trades, satoshis on sends, none on receives. */
function feesFor(
  kind: TransactionKind,
  fees: { fee?: number; feeSats?: number }
): Pick<Transaction, "fee" | "feeSats"> {
  return {
    fee: kind === "buy" || kind === "sell" ? cleanFee(fees.fee) : undefined,
    feeSats: kind === "send" ? cleanFeeSats(fees.feeSats) : undefined,
  };
}

function cleanAt(at: number): number {
  if (!Number.isFinite(at) || at < GENESIS) {
    throw new ConvexError("Pick a date from 2009 on, when bitcoin began.");
  }
  if (at > Date.now() + CLOCK_SKEW) {
    throw new ConvexError("The date can’t be in the future.");
  }
  return Math.round(at);
}

/** Whoever made the portfolio and the project's owners can rename or delete it. */
function canManagePortfolio(
  access: ProjectAccess & { portfolio: Doc<"portfolios"> }
): boolean {
  return (
    canManageRole(access.role) || access.portfolio.createdBy === access.user._id
  );
}

/**
 * Checks the portfolio never sells or sends more than it holds at that
 * moment, and keeps its total current. Runs after every change to its
 * transactions, so a failed check undoes the change.
 */
async function settle(
  ctx: MutationCtx,
  portfolioId: Id<"portfolios">
): Promise<void> {
  // The index keeps them in the order they happened, ties by when they were added.
  const rows = await ctx.db
    .query("portfolioTransactions")
    .withIndex("by_portfolio_and_at", (q) => q.eq("portfolioId", portfolioId))
    .collect();
  let sats = 0;
  for (const row of rows) {
    sats += signedSats(row);
    if (sats < 0) {
      const portfolio = await ctx.db.get(portfolioId);
      throw new ConvexError(
        `That takes more bitcoin out of ${portfolio?.title ?? "the portfolio"} than it held at the time.`
      );
    }
  }
  await ctx.db.patch(portfolioId, { sats });
}

/** The portfolio a send goes to: another one the person can edit. */
async function requireDestination(
  ctx: MutationCtx,
  from: Doc<"portfolios">,
  toPortfolioId: Id<"portfolios">
): Promise<Doc<"portfolios">> {
  if (toPortfolioId === from._id) {
    throw new ConvexError("Pick another portfolio to send to.");
  }
  const { portfolio } = await requirePortfolio(ctx, toPortfolioId, "edit");
  return portfolio;
}

/** Records the send arriving in `to` as a receive, and links the two. */
async function linkReceive(
  ctx: MutationCtx,
  send: Transaction,
  to: Doc<"portfolios">,
  userId: Id<"users">
): Promise<void> {
  const receiveId = await ctx.db.insert("portfolioTransactions", {
    at: send.at,
    createdBy: userId,
    currency: send.currency,
    kind: "receive",
    note: send.note,
    portfolioId: to._id,
    price: send.price,
    projectId: to.projectId,
    sats: send.sats,
    transfer: { portfolioId: send.portfolioId, transactionId: send._id },
    updatedAt: Date.now(),
  });
  await ctx.db.patch(send._id, {
    transfer: { portfolioId: to._id, transactionId: receiveId },
  });
  await settle(ctx, to._id);
}

/**
 * Takes away the other side of a send between portfolios. One the person
 * can't edit is only unlinked, left as bitcoin sent out or come in from
 * outside for whoever can.
 */
async function dropTransfer(
  ctx: MutationCtx,
  transaction: Transaction
): Promise<void> {
  if (!transaction.transfer) {
    return;
  }
  const other = await ctx.db.get(transaction.transfer.transactionId);
  if (!other) {
    return;
  }
  if (await ifVisible(requirePortfolio(ctx, other.portfolioId, "edit"))) {
    await ctx.db.delete(other._id);
    await settle(ctx, other.portfolioId);
  } else {
    await ctx.db.patch(other._id, { transfer: undefined });
  }
}

/** Keeps the other side of a send between portfolios on the same moment, amount and price. */
async function mirrorTransfer(
  ctx: MutationCtx,
  transaction: Transaction
): Promise<void> {
  if (!transaction.transfer) {
    return;
  }
  const other = await ctx.db.get(transaction.transfer.transactionId);
  if (!other) {
    await ctx.db.patch(transaction._id, { transfer: undefined });
    return;
  }
  const { at, currency, price, sats } = transaction;
  if (
    other.at === at &&
    other.currency === currency &&
    other.price === price &&
    other.sats === sats
  ) {
    return;
  }
  await requirePortfolio(ctx, other.portfolioId, "edit");
  await ctx.db.patch(other._id, {
    at,
    currency,
    price,
    sats,
    updatedAt: Date.now(),
  });
  await settle(ctx, other.portfolioId);
}

/**
 * Brings a changed transaction's other side in line: a send's receive moves
 * with it, follows it to another portfolio, or goes once it no longer sends
 * to one. `to` is where a send now goes: a portfolio, null for outside, or
 * undefined to keep where it went.
 */
async function syncTransfer(
  ctx: MutationCtx,
  {
    transaction,
    portfolio,
    to,
    userId,
  }: {
    transaction: Transaction;
    portfolio: Doc<"portfolios">;
    to: Id<"portfolios"> | null | undefined;
    userId: Id<"users">;
  }
): Promise<void> {
  const linked = transaction.transfer?.portfolioId;
  if (transaction.kind === "receive") {
    await mirrorTransfer(ctx, transaction);
    return;
  }
  let wanted: Id<"portfolios"> | undefined;
  if (transaction.kind === "send") {
    wanted = to === undefined ? linked : (to ?? undefined);
  }
  if (linked && linked === wanted) {
    await mirrorTransfer(ctx, transaction);
    return;
  }
  if (linked) {
    await dropTransfer(ctx, transaction);
    await ctx.db.patch(transaction._id, { transfer: undefined });
  }
  if (wanted) {
    const destination = await requireDestination(ctx, portfolio, wanted);
    await linkReceive(ctx, transaction, destination, userId);
  }
}

/** A buy recorded from elsewhere, like a debit that paid for it; resolves with its id. */
export async function insertBuy(
  ctx: MutationCtx,
  {
    portfolio,
    userId,
    ...buy
  }: {
    portfolio: Doc<"portfolios">;
    userId: Id<"users">;
    at: number;
    currency: Doc<"portfolioTransactions">["currency"];
    note: string;
    price: number;
    sats: number;
  }
): Promise<Id<"portfolioTransactions">> {
  const transactionId = await ctx.db.insert("portfolioTransactions", {
    at: cleanAt(buy.at),
    createdBy: userId,
    currency: buy.currency,
    kind: "buy",
    note: buy.note.trim().slice(0, MAX_NOTE),
    portfolioId: portfolio._id,
    price: cleanPrice(buy.price),
    projectId: portfolio.projectId,
    sats: cleanSats(buy.sats),
    updatedAt: Date.now(),
  });
  await settle(ctx, portfolio._id);
  return transactionId;
}

export const create = mutation({
  args: {
    description: v.string(),
    excludedFromTotal: v.boolean(),
    projectId: v.id("projects"),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    const { user } = await requireProject(ctx, args.projectId, "edit");
    return await ctx.db.insert("portfolios", {
      createdBy: user._id,
      description: args.description.trim().slice(0, MAX_DESCRIPTION),
      excludedFromTotal: args.excludedFromTotal,
      projectId: args.projectId,
      sats: 0,
      title: cleanTitle(args.title),
    });
  },
});

export const update = mutation({
  args: {
    description: v.optional(v.string()),
    excludedFromTotal: v.optional(v.boolean()),
    portfolioId: v.id("portfolios"),
    title: v.optional(v.string()),
  },
  handler: async (ctx, { portfolioId, ...changes }) => {
    const access = await requirePortfolio(ctx, portfolioId, "edit");
    if (!canManagePortfolio(access)) {
      throw new ConvexError(
        "Only whoever made the portfolio and the project’s owners can change it."
      );
    }
    const patch: Partial<Doc<"portfolios">> = {};
    if (changes.title !== undefined) {
      patch.title = cleanTitle(changes.title);
    }
    if (changes.description !== undefined) {
      patch.description = changes.description.trim().slice(0, MAX_DESCRIPTION);
    }
    if (changes.excludedFromTotal !== undefined) {
      patch.excludedFromTotal = changes.excludedFromTotal;
    }
    await ctx.db.patch(portfolioId, patch);
  },
});

/** Deletes the portfolio for everyone, with its transactions. */
export const remove = mutation({
  args: { portfolioId: v.id("portfolios") },
  handler: async (ctx, { portfolioId }) => {
    const access = await requirePortfolio(ctx, portfolioId, "edit");
    if (!canManagePortfolio(access)) {
      throw new ConvexError(
        "Only whoever made the portfolio and the project’s owners can delete it."
      );
    }
    await ctx.db.delete(portfolioId);
    await ctx.scheduler.runAfter(0, internal.cleanup.portfolio, {
      portfolioId,
    });
  },
});

export const addTransaction = mutation({
  args: {
    at: v.number(),
    currency: vFiat,
    fee: v.optional(v.number()),
    feeSats: v.optional(v.number()),
    kind: vTransactionKind,
    note: v.string(),
    portfolioId: v.id("portfolios"),
    price: v.number(),
    sats: v.number(),
    /** Where a send goes: another portfolio, or outside when left out. */
    toPortfolioId: v.optional(v.union(v.id("portfolios"), v.null())),
  },
  handler: async (ctx, args) => {
    const { portfolio, user } = await requirePortfolio(
      ctx,
      args.portfolioId,
      "edit"
    );
    const transactionId = await ctx.db.insert("portfolioTransactions", {
      at: cleanAt(args.at),
      createdBy: user._id,
      currency: args.currency,
      kind: args.kind,
      note: args.note.trim().slice(0, MAX_NOTE),
      portfolioId: portfolio._id,
      price: cleanPrice(args.price),
      projectId: portfolio.projectId,
      sats: cleanSats(args.sats),
      updatedAt: Date.now(),
      ...feesFor(args.kind, args),
    });
    if (args.kind === "send" && args.toPortfolioId) {
      const destination = await requireDestination(
        ctx,
        portfolio,
        args.toPortfolioId
      );
      const send = await ctx.db.get(transactionId);
      if (send) {
        await linkReceive(ctx, send, destination, user._id);
      }
    }
    await settle(ctx, portfolio._id);
    return transactionId;
  },
});

export const updateTransaction = mutation({
  args: {
    at: v.optional(v.number()),
    currency: v.optional(vFiat),
    fee: v.optional(v.number()),
    feeSats: v.optional(v.number()),
    kind: v.optional(vTransactionKind),
    note: v.optional(v.string()),
    price: v.optional(v.number()),
    sats: v.optional(v.number()),
    /** Where a send goes: another portfolio, null for outside, or left out to keep it. */
    toPortfolioId: v.optional(v.union(v.id("portfolios"), v.null())),
    transactionId: v.id("portfolioTransactions"),
  },
  handler: async (ctx, { transactionId, toPortfolioId, ...changes }) => {
    const { portfolio, transaction, user } = await requireTransaction(
      ctx,
      transactionId,
      "edit"
    );
    const kind = changes.kind ?? transaction.kind;
    // A receive from another portfolio follows its send, so stays a receive.
    if (
      transaction.transfer &&
      transaction.kind === "receive" &&
      kind !== "receive"
    ) {
      throw new ConvexError(
        "This came from another portfolio. Change it on the send there."
      );
    }
    const patch: Partial<Transaction> = {
      updatedAt: Date.now(),
      ...feesFor(kind, {
        fee: changes.fee ?? transaction.fee,
        feeSats: changes.feeSats ?? transaction.feeSats,
      }),
    };
    if (changes.at !== undefined) {
      patch.at = cleanAt(changes.at);
    }
    if (changes.currency !== undefined) {
      patch.currency = changes.currency;
    }
    if (changes.kind !== undefined) {
      patch.kind = changes.kind;
      // A debit pays for a buy; one turned into anything else has nothing to pay for.
      if (changes.kind !== "buy" && transaction.kind === "buy") {
        await releaseBuy(ctx, transaction.projectId, transactionId);
      }
    }
    if (changes.note !== undefined) {
      patch.note = changes.note.trim().slice(0, MAX_NOTE);
    }
    if (changes.price !== undefined) {
      patch.price = cleanPrice(changes.price);
    }
    if (changes.sats !== undefined) {
      patch.sats = cleanSats(changes.sats);
    }
    await ctx.db.patch(transactionId, patch);
    await syncTransfer(ctx, {
      portfolio,
      to: toPortfolioId,
      transaction: { ...transaction, ...patch },
      userId: user._id,
    });
    await settle(ctx, portfolio._id);
  },
});

/** Deletes the transaction; a send between portfolios goes from both. */
export const removeTransaction = mutation({
  args: { transactionId: v.id("portfolioTransactions") },
  handler: async (ctx, { transactionId }) => {
    const { portfolio, transaction } = await requireTransaction(
      ctx,
      transactionId,
      "edit"
    );
    await ctx.db.delete(transactionId);
    await releaseBuy(ctx, transaction.projectId, transactionId);
    await dropTransfer(ctx, transaction);
    await settle(ctx, portfolio._id);
  },
});
