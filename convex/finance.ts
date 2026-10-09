import { ConvexError, v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import type { ProjectAccess } from "./lib/access";
import {
  ifVisible,
  requireAccount,
  requireEntry,
  requirePortfolio,
  requireProject,
  requireRecurring,
  requireUser,
  visibleProjects,
} from "./lib/access";
import { vBoardLabel, vEntryKind, vFiat } from "./lib/validators";
import { insertBuy } from "./portfolios";
import { shortId } from "./shared/crm";
import type { Category, EntryKind } from "./shared/finance";
import {
  MAX_ACCOUNT_TITLE,
  MAX_CATEGORIES,
  MAX_CATEGORY_NAME,
  MAX_CENTS,
  MAX_ENTRY_NAME,
  MAX_ENTRY_NOTE,
  STARTER_CATEGORIES,
  dayIn,
  isDate,
  isInternalTransfer,
  isMonth,
  nextMonth,
} from "./shared/finance";
import { LABEL_ID, canManageRole, labelKey, sortLabels } from "./shared/model";
import type { Fiat } from "./shared/portfolio";
import { SATS_PER_BTC } from "./shared/portfolio";

type Entry = Doc<"financeEntries">;

const MAX_DESCRIPTION = 500;
/** Unpaid entries the home widget reads per account, oldest first. */
const MAX_UNPAID = 100;

/** Accounts in every project the signed-in person can see. */
export const accounts = query({
  args: {},
  handler: async (ctx): Promise<Doc<"financeAccounts">[]> => {
    const user = await requireUser(ctx);
    const projects = await visibleProjects(ctx, user);
    const perProject = await Promise.all(
      projects.map(({ project }) =>
        ctx.db
          .query("financeAccounts")
          .withIndex("by_project", (q) => q.eq("projectId", project._id))
          .collect()
      )
    );
    return perProject
      .flat()
      .toSorted(
        (a, b) => a.title.localeCompare(b.title) || a._id.localeCompare(b._id)
      );
  },
});

async function categoriesOf(
  ctx: QueryCtx,
  projectId: Id<"projects">
): Promise<Category[]> {
  const settings = await ctx.db
    .query("financeSettings")
    .withIndex("by_project", (q) => q.eq("projectId", projectId))
    .unique();
  return settings?.categories ?? [];
}

/** What the project's entries can be filed under, by name; null once it's out of reach. */
export const categories = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }): Promise<Category[] | null> => {
    const access = await ifVisible(requireProject(ctx, projectId, "view"));
    return access && sortLabels(await categoriesOf(ctx, projectId));
  },
});

/** Entries in order: by day, then as they were added. */
function byDate(a: Doc<"financeEntries">, b: Doc<"financeEntries">): number {
  return a.date.localeCompare(b.date) || a._creationTime - b._creationTime;
}

/**
 * Every entry in the project's accounts dated in `month`, and which accounts
 * have started it; null once the project is gone or no longer shared.
 */
export const inMonth = query({
  args: { month: v.string(), projectId: v.id("projects") },
  handler: async (
    ctx,
    { month, projectId }
  ): Promise<{
    entries: Doc<"financeEntries">[];
    months: Doc<"financeMonths">[];
  } | null> => {
    const access = await ifVisible(requireProject(ctx, projectId, "view"));
    if (!(access && isMonth(month))) {
      return null;
    }
    const entries = await ctx.db
      .query("financeEntries")
      .withIndex("by_project_and_date", (q) =>
        q
          .eq("projectId", projectId)
          .gte("date", month)
          .lt("date", nextMonth(month))
      )
      .collect();
    const months = await ctx.db
      .query("financeMonths")
      .withIndex("by_project_and_month", (q) =>
        q.eq("projectId", projectId).eq("month", month)
      )
      .collect();
    return { entries: entries.toSorted(byDate), months };
  },
});

/** What the project's accounts pay or get every month, by day; null once it's out of reach. */
export const recurring = query({
  args: { projectId: v.id("projects") },
  handler: async (
    ctx,
    { projectId }
  ): Promise<Doc<"financeRecurring">[] | null> => {
    const access = await ifVisible(requireProject(ctx, projectId, "view"));
    if (!access) {
      return null;
    }
    const rows = await ctx.db
      .query("financeRecurring")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .collect();
    return rows.toSorted(
      (a, b) =>
        a.day - b.day ||
        a.name.localeCompare(b.name) ||
        a._creationTime - b._creationTime
    );
  },
});

export interface BuyLink {
  buyId: Id<"portfolioTransactions">;
  entryId: Id<"financeEntries">;
  accountId: Id<"financeAccounts">;
  date: string;
  name: string;
}

/** Bitcoin buys in the project that a debit paid for; null once it's out of reach. */
export const buyLinks = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }): Promise<BuyLink[] | null> => {
    const access = await ifVisible(requireProject(ctx, projectId, "view"));
    if (!access) {
      return null;
    }
    // Every id sorts after the empty string, and entries without a buy before it.
    const linked = await ctx.db
      .query("financeEntries")
      .withIndex("by_project_and_buy", (q) =>
        q
          .eq("projectId", projectId)
          .gt("buyId", "" as Id<"portfolioTransactions">)
      )
      .collect();
    return linked.flatMap((entry) =>
      entry.buyId
        ? [
            {
              accountId: entry.accountId,
              buyId: entry.buyId,
              date: entry.date,
              entryId: entry._id,
              name: entry.name,
            },
          ]
        : []
    );
  },
});

export interface UnpaidEntry {
  _id: Id<"financeEntries">;
  accountId: Id<"financeAccounts">;
  accountTitle: string;
  cents: number;
  currency: Doc<"financeAccounts">["currency"];
  date: string;
  kind: EntryKind;
  name: string;
  /** The project's link name, to open the account. */
  slug: string;
}

export interface FinanceOverview {
  /** How many accounts it covers. */
  accounts: number;
  /** What came in and went out in the month, paid only, per currency. */
  totals: {
    currency: Doc<"financeAccounts">["currency"];
    credits: number;
    debits: number;
  }[];
  /** Entries up to the month's end still to pay or receive, oldest first. */
  unpaid: UnpaidEntry[];
}

/**
 * The month across the person's accounts, for the home: every account in the
 * total, or only `accountId`.
 */
export const overview = query({
  args: {
    accountId: v.optional(v.id("financeAccounts")),
    month: v.string(),
  },
  handler: async (ctx, { accountId, month }): Promise<FinanceOverview> => {
    const user = await requireUser(ctx);
    if (!isMonth(month)) {
      throw new ConvexError("That isn’t a month.");
    }
    const projects = await visibleProjects(ctx, user);
    const slugs = new Map(
      projects.map(({ project }) => [project._id, project.slug])
    );
    let followed: Doc<"financeAccounts">[] = [];
    if (accountId) {
      const account = await ctx.db.get(accountId);
      followed = account && slugs.has(account.projectId) ? [account] : [];
    } else {
      const all = await Promise.all(
        projects.map(({ project }) =>
          ctx.db
            .query("financeAccounts")
            .withIndex("by_project", (q) => q.eq("projectId", project._id))
            .collect()
        )
      );
      followed = all.flat().filter((account) => !account.excludedFromTotal);
    }
    const end = nextMonth(month);
    // Across every account, money moved between two of them in one currency only moved.
    const counted = new Map<string, Fiat>(
      accountId
        ? []
        : followed.map((account) => [account._id, account.currency])
    );
    const totals = new Map<
      Doc<"financeAccounts">["currency"],
      { credits: number; debits: number }
    >();
    const unpaid: UnpaidEntry[] = [];
    for (const account of followed) {
      const entries = await ctx.db
        .query("financeEntries")
        .withIndex("by_account_and_date", (q) =>
          q.eq("accountId", account._id).gte("date", month).lt("date", end)
        )
        .collect();
      const sum = totals.get(account.currency) ?? { credits: 0, debits: 0 };
      for (const entry of entries) {
        if (isInternalTransfer(entry, account.currency, counted)) {
          continue;
        }
        if (entry.paid && entry.kind === "credit") {
          sum.credits += entry.cents;
        } else if (entry.paid) {
          sum.debits += entry.cents;
        }
      }
      totals.set(account.currency, sum);
      const waiting = await ctx.db
        .query("financeEntries")
        .withIndex("by_account_and_paid_and_date", (q) =>
          q.eq("accountId", account._id).eq("paid", false).lt("date", end)
        )
        .take(MAX_UNPAID);
      for (const entry of waiting) {
        // Its debit still says the transfer is to make; the credit would only repeat it.
        if (
          entry.kind === "credit" &&
          isInternalTransfer(entry, account.currency, counted)
        ) {
          continue;
        }
        unpaid.push({
          _id: entry._id,
          accountId: account._id,
          accountTitle: account.title,
          cents: entry.cents,
          currency: account.currency,
          date: entry.date,
          kind: entry.kind,
          name: entry.name,
          slug: slugs.get(account.projectId) ?? "",
        });
      }
    }
    return {
      accounts: followed.length,
      totals: [...totals].map(([currency, sum]) => ({ currency, ...sum })),
      unpaid: unpaid.toSorted((a, b) => a.date.localeCompare(b.date)),
    };
  },
});

function cleanTitle(title: string): string {
  const trimmed = title.trim().slice(0, MAX_ACCOUNT_TITLE);
  if (!trimmed) {
    throw new ConvexError("Give the account a name.");
  }
  return trimmed;
}

function cleanName(name: string): string {
  const trimmed = name.trim().slice(0, MAX_ENTRY_NAME);
  if (!trimmed) {
    throw new ConvexError("Give the entry a name.");
  }
  return trimmed;
}

function cleanNote(note: string): string {
  return note.trim().slice(0, MAX_ENTRY_NOTE);
}

function cleanCents(cents: number): number {
  if (!Number.isSafeInteger(cents) || cents <= 0) {
    throw new ConvexError("Enter an amount above zero.");
  }
  if (cents > MAX_CENTS) {
    throw new ConvexError("That amount is too large.");
  }
  return cents;
}

function cleanDate(date: string): string {
  if (!isDate(date)) {
    throw new ConvexError("Pick a day.");
  }
  return date;
}

function cleanDay(day: number): number {
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    throw new ConvexError("Pick a day of the month, 1 to 31.");
  }
  return day;
}

function cleanMonth(month: string): string {
  if (!isMonth(month)) {
    throw new ConvexError("That isn’t a month.");
  }
  return month;
}

/** A category of the project's, or none. */
async function cleanCategory(
  ctx: QueryCtx,
  projectId: Id<"projects">,
  category: string | null | undefined
): Promise<string | undefined> {
  if (!category) {
    return undefined;
  }
  const known = await categoriesOf(ctx, projectId);
  if (!known.some(({ id }) => id === category)) {
    throw new ConvexError("That category doesn’t exist anymore.");
  }
  return category;
}

/** A bitcoin buy in the project that no other debit paid for yet. */
async function cleanBuy(
  ctx: QueryCtx,
  projectId: Id<"projects">,
  buyId: Id<"portfolioTransactions">,
  entryId?: Id<"financeEntries">
): Promise<Id<"portfolioTransactions">> {
  const buy = await ctx.db.get(buyId);
  if (!(buy && buy.projectId === projectId && buy.kind === "buy")) {
    throw new ConvexError("That bitcoin buy doesn’t exist anymore.");
  }
  const taken = await ctx.db
    .query("financeEntries")
    .withIndex("by_project_and_buy", (q) =>
      q.eq("projectId", projectId).eq("buyId", buyId)
    )
    .first();
  if (taken && taken._id !== entryId) {
    throw new ConvexError("Another debit already paid for that buy.");
  }
  return buyId;
}

const vNewBuy = v.object({
  /** When it was bought, in ms: the entry's day, at a time of the person's. */
  at: v.number(),
  portfolioId: v.id("portfolios"),
  /** Satoshis the debit bought; the price is what it cost for them. */
  sats: v.number(),
});

/** Records the bitcoin a debit bought, at the price the debit paid. */
async function buyFor(
  ctx: MutationCtx,
  access: ProjectAccess & { account: Doc<"financeAccounts"> },
  entry: { cents: number; name: string },
  buy: { at: number; portfolioId: Id<"portfolios">; sats: number }
): Promise<Id<"portfolioTransactions">> {
  const { portfolio } = await requirePortfolio(ctx, buy.portfolioId, "edit");
  if (portfolio.projectId !== access.account.projectId) {
    throw new ConvexError("Pick a portfolio in the same project.");
  }
  if (!Number.isSafeInteger(buy.sats) || buy.sats <= 0) {
    throw new ConvexError("Enter the bitcoin bought, at least one satoshi.");
  }
  const price = (entry.cents / 100 / buy.sats) * SATS_PER_BTC;
  return await insertBuy(ctx, {
    at: buy.at,
    currency: access.account.currency,
    note: entry.name,
    portfolio,
    price: Math.round(price * 100) / 100,
    sats: buy.sats,
    userId: access.user._id,
  });
}

/** The account a transfer goes to: another one the person can edit. */
async function requireDestination(
  ctx: QueryCtx,
  from: Doc<"financeAccounts">,
  toAccountId: Id<"financeAccounts">
): Promise<Doc<"financeAccounts">> {
  if (toAccountId === from._id) {
    throw new ConvexError("Pick another account to transfer to.");
  }
  const { account } = await requireAccount(ctx, toAccountId, "edit");
  return account;
}

/**
 * What a transfer lands as in `to`, in its own cents, when its currency
 * differs from `from`'s; undefined in the same one, as the amount carries over.
 */
function receivedIn(
  from: Doc<"financeAccounts">,
  to: Doc<"financeAccounts">,
  received: number | undefined
): number | undefined {
  if (from.currency === to.currency) {
    return undefined;
  }
  if (received === undefined) {
    throw new ConvexError(
      `Enter what arrives in ${to.title}, in ${to.currency}.`
    );
  }
  return cleanCents(received);
}

/** Records a debit arriving in `to` as a credit, and links the two. */
async function linkCredit(
  ctx: MutationCtx,
  debit: Entry,
  to: Doc<"financeAccounts">,
  { cents, userId }: { cents: number; userId: Id<"users"> }
): Promise<void> {
  const creditId = await ctx.db.insert("financeEntries", {
    accountId: to._id,
    // Categories are the project's, so only an account in the same one shares them.
    category: to.projectId === debit.projectId ? debit.category : undefined,
    cents,
    createdBy: userId,
    date: debit.date,
    kind: "credit",
    name: debit.name,
    note: debit.note,
    paid: debit.paid,
    projectId: to.projectId,
    transfer: { accountId: debit.accountId, entryId: debit._id },
    updatedAt: Date.now(),
  });
  await ctx.db.patch(debit._id, {
    transfer: { accountId: to._id, entryId: creditId },
  });
}

/**
 * Takes away the other side of a transfer. One the person can't edit is
 * only unlinked, left as money out or in for whoever can.
 */
async function dropTransfer(ctx: MutationCtx, entry: Entry): Promise<void> {
  if (!entry.transfer) {
    return;
  }
  const other = await ctx.db.get(entry.transfer.entryId);
  if (!other) {
    return;
  }
  const editable = await ifVisible(
    requireAccount(ctx, other.accountId, "edit")
  );
  await (editable
    ? ctx.db.delete(other._id)
    : ctx.db.patch(other._id, { transfer: undefined }));
}

/**
 * What the other side of a transfer comes to: the same amount in the same
 * currency; in another, `received`, or what it was.
 */
function mirroredCents(
  entry: Entry,
  other: Entry,
  sameCurrency: boolean,
  received: number | undefined
): number {
  if (sameCurrency) {
    return entry.cents;
  }
  return received === undefined ? other.cents : cleanCents(received);
}

/**
 * Keeps the other side of a transfer on the same day and paid, and on the
 * same amount in the same currency; `received` changes it in another one.
 * One the person can't edit anymore is unlinked instead.
 */
async function mirrorTransfer(
  ctx: MutationCtx,
  entry: Entry,
  received?: number
): Promise<void> {
  if (!entry.transfer) {
    return;
  }
  const other = await ctx.db.get(entry.transfer.entryId);
  const theirs = other && (await ctx.db.get(other.accountId));
  if (!(other && theirs)) {
    await ctx.db.patch(entry._id, { transfer: undefined });
    return;
  }
  const mine = await ctx.db.get(entry.accountId);
  const cents = mirroredCents(
    entry,
    other,
    mine?.currency === theirs.currency,
    received
  );
  const { date, paid } = entry;
  if (other.cents === cents && other.date === date && other.paid === paid) {
    return;
  }
  // One the person can't edit anymore goes its own way, as a delete leaves it.
  if (!(await ifVisible(requireAccount(ctx, other.accountId, "edit")))) {
    await ctx.db.patch(entry._id, { transfer: undefined });
    await ctx.db.patch(other._id, { transfer: undefined });
    return;
  }
  await ctx.db.patch(other._id, { cents, date, paid, updatedAt: Date.now() });
}

interface TransferSync {
  /** The entry as it is now, changes and all. */
  entry: Entry;
  account: Doc<"financeAccounts">;
  /** Where a debit now transfers: an account, null for none, or undefined to keep where it went. */
  to: Id<"financeAccounts"> | null | undefined;
  /** What arrives there in another currency, in its cents. */
  received: number | undefined;
  userId: Id<"users">;
}

/**
 * Brings a changed debit's other side in line: its credit moves with it,
 * follows it to another account, or goes once it no longer transfers.
 */
async function syncDebit(
  ctx: MutationCtx,
  { entry, account, to, received, userId }: TransferSync
): Promise<void> {
  const linked = entry.transfer?.accountId;
  let wanted: Id<"financeAccounts"> | undefined;
  if (entry.kind === "debit") {
    wanted = to === undefined ? linked : (to ?? undefined);
  }
  if (wanted && entry.buyId) {
    throw new ConvexError("A transfer can’t pay for bitcoin.");
  }
  if (linked && linked === wanted) {
    await mirrorTransfer(ctx, entry, received);
    return;
  }
  if (linked) {
    await dropTransfer(ctx, entry);
    await ctx.db.patch(entry._id, { transfer: undefined });
  }
  if (wanted) {
    const destination = await requireDestination(ctx, account, wanted);
    await linkCredit(ctx, entry, destination, {
      cents: receivedIn(account, destination, received) ?? entry.cents,
      userId,
    });
  }
}

/**
 * Brings a changed entry's transfer in line. A credit from another account
 * follows its debit, so stays a credit, and moves it along.
 */
async function syncTransfer(
  ctx: MutationCtx,
  before: Entry,
  sync: TransferSync
): Promise<void> {
  if (!(before.transfer && before.kind === "credit")) {
    await syncDebit(ctx, sync);
    return;
  }
  if (sync.entry.kind !== "credit") {
    throw new ConvexError(
      "This came from another account. Change it on the transfer there."
    );
  }
  await mirrorTransfer(ctx, sync.entry);
}

const vRecurringTransfer = v.object({
  accountId: v.id("financeAccounts"),
  /** What arrives there in its own cents, when its currency differs. */
  cents: v.optional(v.number()),
});

/** Where a monthly debit transfers to, checked: another account the person can edit. */
async function cleanRecurringTransfer(
  ctx: QueryCtx,
  account: Doc<"financeAccounts">,
  kind: EntryKind,
  transfer: { accountId: Id<"financeAccounts">; cents?: number } | null
): Promise<Doc<"financeRecurring">["transfer"]> {
  if (!transfer) {
    return undefined;
  }
  if (kind !== "debit") {
    throw new ConvexError("Only a debit moves money to another account.");
  }
  const destination = await requireDestination(
    ctx,
    account,
    transfer.accountId
  );
  return {
    accountId: destination._id,
    cents: receivedIn(account, destination, transfer.cents),
  };
}

/** Whoever made the account and the project's owners can rename or delete it. */
function canManageAccount(
  access: ProjectAccess & { account: Doc<"financeAccounts"> }
): boolean {
  return (
    canManageRole(access.role) || access.account.createdBy === access.user._id
  );
}

export const createAccount = mutation({
  args: {
    currency: vFiat,
    description: v.string(),
    excludedFromTotal: v.boolean(),
    projectId: v.id("projects"),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    const { user } = await requireProject(ctx, args.projectId, "edit");
    const settings = await ctx.db
      .query("financeSettings")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .unique();
    // The project's first account brings categories to start from.
    if (!settings) {
      await ctx.db.insert("financeSettings", {
        categories: STARTER_CATEGORIES.map((category) => ({
          ...category,
          id: shortId(),
        })),
        projectId: args.projectId,
      });
    }
    return await ctx.db.insert("financeAccounts", {
      createdBy: user._id,
      currency: args.currency,
      description: args.description.trim().slice(0, MAX_DESCRIPTION),
      excludedFromTotal: args.excludedFromTotal,
      projectId: args.projectId,
      title: cleanTitle(args.title),
    });
  },
});

export const updateAccount = mutation({
  args: {
    accountId: v.id("financeAccounts"),
    currency: v.optional(vFiat),
    description: v.optional(v.string()),
    excludedFromTotal: v.optional(v.boolean()),
    title: v.optional(v.string()),
  },
  handler: async (ctx, { accountId, ...changes }) => {
    const access = await requireAccount(ctx, accountId, "edit");
    if (!canManageAccount(access)) {
      throw new ConvexError(
        "Only whoever made the account and the project’s owners can change it."
      );
    }
    const patch: Partial<Doc<"financeAccounts">> = {};
    if (changes.title !== undefined) {
      patch.title = cleanTitle(changes.title);
    }
    if (changes.description !== undefined) {
      patch.description = changes.description.trim().slice(0, MAX_DESCRIPTION);
    }
    if (changes.currency !== undefined) {
      patch.currency = changes.currency;
    }
    if (changes.excludedFromTotal !== undefined) {
      patch.excludedFromTotal = changes.excludedFromTotal;
    }
    await ctx.db.patch(accountId, patch);
  },
});

/** Deletes the account for everyone, with its entries and months. */
export const removeAccount = mutation({
  args: { accountId: v.id("financeAccounts") },
  handler: async (ctx, { accountId }) => {
    const access = await requireAccount(ctx, accountId, "edit");
    if (!canManageAccount(access)) {
      throw new ConvexError(
        "Only whoever made the account and the project’s owners can delete it."
      );
    }
    await ctx.db.delete(accountId);
    await ctx.scheduler.runAfter(0, internal.cleanup.financeAccount, {
      accountId,
    });
  },
});

/** The categories with `removed` gone and `changed` renamed, recolored or added. */
function mergeCategories(
  current: Category[],
  changed: Category[],
  removed: string[]
): Category[] {
  const gone = new Set(removed);
  const merged = current.filter(({ id }) => !gone.has(id));
  for (const { color, id, name: raw } of changed) {
    if (gone.has(id)) {
      continue;
    }
    const name = raw.trim().slice(0, MAX_CATEGORY_NAME);
    if (!name) {
      throw new ConvexError("Give every category a name.");
    }
    const category = { color, id, name };
    const index = merged.findIndex((existing) => existing.id === id);
    if (index !== -1) {
      merged[index] = category;
    } else if (LABEL_ID.test(id)) {
      merged.push(category);
    } else {
      throw new ConvexError("That category can’t be added.");
    }
  }
  const names = new Set<string>();
  for (const { name } of merged) {
    if (names.has(labelKey(name))) {
      throw new ConvexError(`There’s already a category named “${name}”.`);
    }
    names.add(labelKey(name));
  }
  if (merged.length > MAX_CATEGORIES) {
    throw new ConvexError(
      `A project can have up to ${MAX_CATEGORIES} categories.`
    );
  }
  return merged;
}

async function saveCategories(
  ctx: MutationCtx,
  projectId: Id<"projects">,
  changed: Category[],
  removed: string[]
): Promise<void> {
  await requireProject(ctx, projectId, "edit");
  const settings = await ctx.db
    .query("financeSettings")
    .withIndex("by_project", (q) => q.eq("projectId", projectId))
    .unique();
  const merged = mergeCategories(settings?.categories ?? [], changed, removed);
  await (settings
    ? ctx.db.patch(settings._id, { categories: merged })
    : ctx.db.insert("financeSettings", { categories: merged, projectId }));
}

/** Adds one category, as picking a name no category has yet does. */
export const addCategory = mutation({
  args: { category: vBoardLabel, projectId: v.id("projects") },
  handler: async (ctx, { category, projectId }) => {
    await saveCategories(ctx, projectId, [category], []);
  },
});

/**
 * Only what changed, so categories added meanwhile stay. Entries keep the id
 * of a deleted one, which reads as none.
 */
export const updateCategories = mutation({
  args: {
    changed: v.array(vBoardLabel),
    projectId: v.id("projects"),
    removed: v.array(v.string()),
  },
  handler: async (ctx, { changed, projectId, removed }) => {
    await saveCategories(ctx, projectId, changed, removed);
  },
});

/**
 * Lands a monthly transfer's credit in the account it goes to. One gone, or
 * no longer the person's to edit, leaves the debit on its own.
 */
async function transferMonthly(
  ctx: MutationCtx,
  {
    account,
    item,
    entryId,
    userId,
  }: {
    account: Doc<"financeAccounts">;
    item: Doc<"financeRecurring">;
    entryId: Id<"financeEntries">;
    userId: Id<"users">;
  }
): Promise<void> {
  if (!item.transfer || item.kind !== "debit") {
    return;
  }
  const access = await ifVisible(
    requireAccount(ctx, item.transfer.accountId, "edit")
  );
  const debit = await ctx.db.get(entryId);
  if (!(access && debit) || access.account._id === account._id) {
    return;
  }
  // A currency changed since keeps the amount, to be fixed on the entry.
  const cents =
    access.account.currency === account.currency
      ? item.cents
      : (item.transfer.cents ?? item.cents);
  await linkCredit(ctx, debit, access.account, { cents, userId });
}

/** Each monthly entry as it lands in `month`, not paid yet. */
async function addRecurring(
  ctx: MutationCtx,
  { account, user }: { account: Doc<"financeAccounts">; user: Doc<"users"> },
  month: string,
  items: Doc<"financeRecurring">[]
): Promise<void> {
  const owned = await categoriesOf(ctx, account.projectId);
  const known = new Set(owned.map(({ id }) => id));
  const now = Date.now();
  for (const item of items) {
    const entryId = await ctx.db.insert("financeEntries", {
      accountId: item.accountId,
      category:
        item.category && known.has(item.category) ? item.category : undefined,
      cents: item.cents,
      createdBy: user._id,
      date: dayIn(month, item.day),
      kind: item.kind,
      name: item.name,
      note: item.note,
      paid: false,
      projectId: item.projectId,
      recurringId: item._id,
      updatedAt: now,
    });
    await transferMonthly(ctx, { account, entryId, item, userId: user._id });
  }
}

/** Starts the month on the account, bringing in what it pays or gets every month. */
export const startMonth = mutation({
  args: { accountId: v.id("financeAccounts"), month: v.string() },
  handler: async (ctx, args) => {
    const { account, user } = await requireAccount(ctx, args.accountId, "edit");
    const month = cleanMonth(args.month);
    const started = await ctx.db
      .query("financeMonths")
      .withIndex("by_account_and_month", (q) =>
        q.eq("accountId", account._id).eq("month", month)
      )
      .unique();
    // Started already, by someone else at the same moment.
    if (started) {
      return;
    }
    const items = await ctx.db
      .query("financeRecurring")
      .withIndex("by_account", (q) => q.eq("accountId", account._id))
      .collect();
    await addRecurring(ctx, { account, user }, month, items);
    await ctx.db.insert("financeMonths", {
      accountId: account._id,
      month,
      projectId: account.projectId,
      recurring: items.map((item) => item._id),
      startedBy: user._id,
    });
  },
});

/** Brings monthly entries made since the month started into it. */
export const addToMonth = mutation({
  args: {
    accountId: v.id("financeAccounts"),
    month: v.string(),
    recurringIds: v.array(v.id("financeRecurring")),
  },
  handler: async (ctx, args) => {
    const { account, user } = await requireAccount(ctx, args.accountId, "edit");
    const month = cleanMonth(args.month);
    const started = await ctx.db
      .query("financeMonths")
      .withIndex("by_account_and_month", (q) =>
        q.eq("accountId", account._id).eq("month", month)
      )
      .unique();
    if (!started) {
      throw new ConvexError("Start the month first.");
    }
    const added = new Set(started.recurring);
    const items: Doc<"financeRecurring">[] = [];
    for (const id of new Set(args.recurringIds)) {
      const item = await ctx.db.get(id);
      if (item?.accountId === account._id && !added.has(id)) {
        items.push(item);
      }
    }
    await addRecurring(ctx, { account, user }, month, items);
    await ctx.db.patch(started._id, {
      recurring: [...started.recurring, ...items.map((item) => item._id)],
    });
  },
});

export const addEntry = mutation({
  args: {
    accountId: v.id("financeAccounts"),
    /** The bitcoin the debit bought, recorded in a portfolio with it. */
    buy: v.optional(vNewBuy),
    /** A bitcoin buy already in a portfolio that the debit paid for. */
    buyId: v.optional(v.id("portfolioTransactions")),
    category: v.optional(v.string()),
    cents: v.number(),
    date: v.string(),
    kind: vEntryKind,
    name: v.string(),
    note: v.string(),
    paid: v.boolean(),
    /** What arrives in the account it transfers to, in its cents, when its currency differs. */
    receivedCents: v.optional(v.number()),
    /** Where a debit transfers to: another account, which gets it as a credit. */
    toAccountId: v.optional(v.id("financeAccounts")),
  },
  handler: async (ctx, args) => {
    const access = await requireAccount(ctx, args.accountId, "edit");
    const { account, user } = access;
    const entry = {
      cents: cleanCents(args.cents),
      name: cleanName(args.name),
    };
    let buyId: Id<"portfolioTransactions"> | undefined;
    if ((args.buyId || args.buy) && args.kind !== "debit") {
      throw new ConvexError("Only a debit can pay for bitcoin.");
    }
    if (args.toAccountId && args.kind !== "debit") {
      throw new ConvexError("Only a debit moves money to another account.");
    }
    if (args.toAccountId && (args.buyId || args.buy)) {
      throw new ConvexError("A transfer can’t pay for bitcoin.");
    }
    if (args.buyId) {
      buyId = await cleanBuy(ctx, account.projectId, args.buyId);
    } else if (args.buy) {
      buyId = await buyFor(ctx, access, entry, args.buy);
    }
    const entryId = await ctx.db.insert("financeEntries", {
      accountId: account._id,
      buyId,
      category: await cleanCategory(ctx, account.projectId, args.category),
      createdBy: user._id,
      date: cleanDate(args.date),
      kind: args.kind,
      note: cleanNote(args.note),
      paid: args.paid,
      projectId: account.projectId,
      updatedAt: Date.now(),
      ...entry,
    });
    const debit = args.toAccountId && (await ctx.db.get(entryId));
    if (args.toAccountId && debit) {
      const destination = await requireDestination(
        ctx,
        account,
        args.toAccountId
      );
      await linkCredit(ctx, debit, destination, {
        cents:
          receivedIn(account, destination, args.receivedCents) ?? entry.cents,
        userId: user._id,
      });
    }
    return entryId;
  },
});

export const updateEntry = mutation({
  args: {
    buy: v.optional(vNewBuy),
    /** Null lets go of the buy it paid for; the buy stays in its portfolio. */
    buyId: v.optional(v.union(v.id("portfolioTransactions"), v.null())),
    /** Null files it under no category. */
    category: v.optional(v.union(v.string(), v.null())),
    cents: v.optional(v.number()),
    date: v.optional(v.string()),
    entryId: v.id("financeEntries"),
    kind: v.optional(vEntryKind),
    name: v.optional(v.string()),
    note: v.optional(v.string()),
    paid: v.optional(v.boolean()),
    /** What arrives where it transfers to, in its cents, when its currency differs. */
    receivedCents: v.optional(v.number()),
    /** Where a debit transfers to: another account, null for none, or left out to keep it. */
    toAccountId: v.optional(v.union(v.id("financeAccounts"), v.null())),
  },
  handler: async (ctx, { entryId, receivedCents, toAccountId, ...changes }) => {
    const access = await requireEntry(ctx, entryId, "edit");
    const { account, entry, user } = access;
    const patch: Partial<Doc<"financeEntries">> = { updatedAt: Date.now() };
    if (changes.name !== undefined) {
      patch.name = cleanName(changes.name);
    }
    if (changes.cents !== undefined) {
      patch.cents = cleanCents(changes.cents);
    }
    if (changes.date !== undefined) {
      patch.date = cleanDate(changes.date);
    }
    if (changes.kind !== undefined) {
      patch.kind = changes.kind;
    }
    if (changes.note !== undefined) {
      patch.note = cleanNote(changes.note);
    }
    if (changes.paid !== undefined) {
      patch.paid = changes.paid;
    }
    if (changes.category !== undefined) {
      patch.category = await cleanCategory(
        ctx,
        account.projectId,
        changes.category
      );
    }
    if (changes.buyId === null) {
      patch.buyId = undefined;
    } else if (changes.buyId !== undefined) {
      patch.buyId = await cleanBuy(
        ctx,
        account.projectId,
        changes.buyId,
        entryId
      );
    } else if (changes.buy) {
      patch.buyId = await buyFor(
        ctx,
        access,
        {
          cents: patch.cents ?? entry.cents,
          name: patch.name ?? entry.name,
        },
        changes.buy
      );
    }
    const kind = patch.kind ?? entry.kind;
    const buyId = "buyId" in patch ? patch.buyId : entry.buyId;
    if (buyId && kind !== "debit") {
      throw new ConvexError("Only a debit can pay for bitcoin.");
    }
    await ctx.db.patch(entryId, patch);
    await syncTransfer(ctx, entry, {
      account,
      entry: { ...entry, ...patch },
      received: receivedCents,
      to: toAccountId,
      userId: user._id,
    });
  },
});

/**
 * Deletes the entry, and a transfer from both accounts it moved between; a
 * bitcoin buy it paid for stays in its portfolio.
 */
export const removeEntry = mutation({
  args: { entryId: v.id("financeEntries") },
  handler: async (ctx, { entryId }) => {
    const { entry } = await requireEntry(ctx, entryId, "edit");
    await ctx.db.delete(entryId);
    await dropTransfer(ctx, entry);
  },
});

/** The other side of a transfer, while the person can see it; null otherwise. */
export const counterpart = query({
  args: { entryId: v.id("financeEntries") },
  handler: async (ctx, { entryId }): Promise<Entry | null> => {
    const access = await ifVisible(requireEntry(ctx, entryId, "view"));
    const transfer = access?.entry.transfer;
    if (!transfer) {
      return null;
    }
    const other = await ifVisible(requireEntry(ctx, transfer.entryId, "view"));
    return other?.entry ?? null;
  },
});

export const createRecurring = mutation({
  args: {
    accountId: v.id("financeAccounts"),
    category: v.optional(v.string()),
    cents: v.number(),
    day: v.number(),
    kind: vEntryKind,
    name: v.string(),
    note: v.string(),
    /** On a debit, the account it moves to every month. */
    transfer: v.optional(vRecurringTransfer),
  },
  handler: async (ctx, args) => {
    const { account, user } = await requireAccount(ctx, args.accountId, "edit");
    return await ctx.db.insert("financeRecurring", {
      accountId: account._id,
      category: await cleanCategory(ctx, account.projectId, args.category),
      cents: cleanCents(args.cents),
      createdBy: user._id,
      day: cleanDay(args.day),
      kind: args.kind,
      name: cleanName(args.name),
      note: cleanNote(args.note),
      projectId: account.projectId,
      transfer: await cleanRecurringTransfer(
        ctx,
        account,
        args.kind,
        args.transfer ?? null
      ),
    });
  },
});

/** Changes what's added to months started from now on; ones started keep theirs. */
export const updateRecurring = mutation({
  args: {
    category: v.optional(v.union(v.string(), v.null())),
    cents: v.optional(v.number()),
    day: v.optional(v.number()),
    kind: v.optional(vEntryKind),
    name: v.optional(v.string()),
    note: v.optional(v.string()),
    recurringId: v.id("financeRecurring"),
    /** Where a debit moves every month: another account, null for none, or left out to keep it. */
    transfer: v.optional(v.union(vRecurringTransfer, v.null())),
  },
  handler: async (ctx, { recurringId, ...changes }) => {
    const { account, recurring: item } = await requireRecurring(
      ctx,
      recurringId,
      "edit"
    );
    const patch: Partial<Doc<"financeRecurring">> = {};
    const kind = changes.kind ?? item.kind;
    if (changes.transfer !== undefined) {
      patch.transfer = await cleanRecurringTransfer(
        ctx,
        account,
        kind,
        changes.transfer
      );
    } else if (kind !== "debit" && item.transfer) {
      // A credit has nothing to move.
      patch.transfer = undefined;
    }
    if (changes.name !== undefined) {
      patch.name = cleanName(changes.name);
    }
    if (changes.cents !== undefined) {
      patch.cents = cleanCents(changes.cents);
    }
    if (changes.day !== undefined) {
      patch.day = cleanDay(changes.day);
    }
    if (changes.kind !== undefined) {
      patch.kind = changes.kind;
    }
    if (changes.note !== undefined) {
      patch.note = cleanNote(changes.note);
    }
    if (changes.category !== undefined) {
      patch.category = await cleanCategory(
        ctx,
        account.projectId,
        changes.category
      );
    }
    await ctx.db.patch(recurringId, patch);
  },
});

/** Stops it coming with new months; entries it brought into months stay. */
export const removeRecurring = mutation({
  args: { recurringId: v.id("financeRecurring") },
  handler: async (ctx, { recurringId }) => {
    await requireRecurring(ctx, recurringId, "edit");
    await ctx.db.delete(recurringId);
  },
});
