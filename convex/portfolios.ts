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
import { vFiat, vTransactionKind } from "./lib/validators";
import { canManageRole } from "./shared/model";
import { MAX_SATS, byTime, signedSats } from "./shared/portfolio";

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
 * Checks the portfolio never sells more than it holds at that moment, and
 * keeps its total current. Runs after every change to its transactions, so a
 * failed check undoes the change.
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
      throw new ConvexError(
        "That sells more bitcoin than the portfolio held at the time."
      );
    }
  }
  await ctx.db.patch(portfolioId, { sats });
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
    kind: vTransactionKind,
    note: v.string(),
    portfolioId: v.id("portfolios"),
    price: v.number(),
    sats: v.number(),
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
    });
    await settle(ctx, portfolio._id);
    return transactionId;
  },
});

export const updateTransaction = mutation({
  args: {
    at: v.optional(v.number()),
    currency: v.optional(vFiat),
    kind: v.optional(vTransactionKind),
    note: v.optional(v.string()),
    price: v.optional(v.number()),
    sats: v.optional(v.number()),
    transactionId: v.id("portfolioTransactions"),
  },
  handler: async (ctx, { transactionId, ...changes }) => {
    const { portfolio } = await requireTransaction(ctx, transactionId, "edit");
    const patch: Partial<Doc<"portfolioTransactions">> = {
      updatedAt: Date.now(),
    };
    if (changes.at !== undefined) {
      patch.at = cleanAt(changes.at);
    }
    if (changes.currency !== undefined) {
      patch.currency = changes.currency;
    }
    if (changes.kind !== undefined) {
      patch.kind = changes.kind;
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
    await settle(ctx, portfolio._id);
  },
});

export const removeTransaction = mutation({
  args: { transactionId: v.id("portfolioTransactions") },
  handler: async (ctx, { transactionId }) => {
    const { portfolio } = await requireTransaction(ctx, transactionId, "edit");
    await ctx.db.delete(transactionId);
    await settle(ctx, portfolio._id);
  },
});
