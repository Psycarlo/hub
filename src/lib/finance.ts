import type { Doc } from "@convex/_generated/dataModel";
import type { Category, EntryKind } from "@convex/shared/finance";
import { isMonth } from "@convex/shared/finance";
import { addMonths, format, parseISO } from "date-fns";

import type { Fiat } from "@/lib/portfolio";
import { formatFiat, parsePrice } from "@/lib/portfolio";

export {
  ENTRY_KINDS,
  MAX_ACCOUNT_TITLE,
  MAX_CATEGORIES,
  MAX_CATEGORY_NAME,
  MAX_ENTRY_NAME,
  dayIn,
  isInternalTransfer,
  isMonth,
  monthOf,
  nextMonth,
  signedCents,
} from "@convex/shared/finance";
export type { Category, EntryKind } from "@convex/shared/finance";
export type { BuyLink, FinanceOverview, UnpaidEntry } from "@convex/finance";

export type Account = Doc<"financeAccounts">;
export type Entry = Doc<"financeEntries">;
export type Recurring = Doc<"financeRecurring">;
export type FinanceMonth = Doc<"financeMonths">;

/** What an entry form makes: a debit, a credit, or a debit moving money to another account. */
export type EntryType = EntryKind | "transfer";

/** The kind an entry of the type is stored as: a transfer goes out, as a debit. */
export function entryKind(type: EntryType): EntryKind {
  return type === "transfer" ? "debit" : type;
}

/** Whether an entry is settled yet, the way filters ask it. */
export type EntryStatus = "paid" | "unpaid";

const ordinals = new Intl.PluralRules("en", { type: "ordinal" });
const SUFFIXES: Record<Intl.LDMLPluralRule, string> = {
  few: "rd",
  many: "th",
  one: "st",
  other: "th",
  two: "nd",
  zero: "th",
};

/** A day of the month as it's said: 1st, 2nd, 23rd. */
export function ordinal(day: number): string {
  return `${day}${SUFFIXES[ordinals.select(day)]}`;
}

/**
 * Cents as money, like `€1,250.00`; `signed` puts a plus before what comes
 * in and a minus before what goes out.
 */
export function formatMoney(
  cents: number,
  currency: Fiat,
  { signed = false, compact = false } = {}
): string {
  const text = formatFiat(Math.abs(cents) / 100, currency, { compact });
  if (cents < 0) {
    return `−${text}`;
  }
  return signed && cents > 0 ? `+${text}` : text;
}

/** Money typed as text, in cents, or undefined when it isn't an amount above zero. */
export function parseMoney(text: string): number | undefined {
  const value = parsePrice(text);
  return value === undefined ? undefined : Math.round(value * 100);
}

/** Cents as they'd be typed into an amount field. */
export function moneyText(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** What the kind is called once settled, or while it waits. */
export function statusLabel(kind: EntryKind, paid: boolean): string {
  if (kind === "debit") {
    return paid ? "Paid" : "To pay";
  }
  return paid ? "Received" : "To receive";
}

export function currentMonth(): string {
  return format(new Date(), "yyyy-MM");
}

/** The first day of a `YYYY-MM` month, as a date. */
export function monthStart(month: string): Date {
  return parseISO(`${month}-01`);
}

export function shiftMonth(month: string, by: number): string {
  return format(addMonths(monthStart(month), by), "yyyy-MM");
}

/** The month's name, like "October"; with the year once it isn't this year's. */
export function monthName(month: string, { year = false } = {}): string {
  const start = monthStart(month);
  return format(
    start,
    year || start.getFullYear() !== new Date().getFullYear()
      ? "MMMM yyyy"
      : "MMMM"
  );
}

/** A month from a link, or undefined when it doesn't name one. */
export function parseMonth(value: string | null): string | undefined {
  return value && isMonth(value) ? value : undefined;
}

export interface MonthTotals {
  /** What came in, received only. */
  credits: number;
  /** What went out, paid only. */
  debits: number;
  net: number;
  /** Debits still to pay. */
  toPay: number;
  /** Credits still to come in. */
  toReceive: number;
  /** Entries still waiting whose day has passed. */
  overdue: number;
}

/** What the entries add up to: only settled ones count toward the sums. */
export function monthTotals(entries: Entry[], today: string): MonthTotals {
  const totals: MonthTotals = {
    credits: 0,
    debits: 0,
    net: 0,
    overdue: 0,
    toPay: 0,
    toReceive: 0,
  };
  for (const entry of entries) {
    const credit = entry.kind === "credit";
    if (entry.paid && credit) {
      totals.credits += entry.cents;
    } else if (entry.paid) {
      totals.debits += entry.cents;
    } else {
      totals[credit ? "toReceive" : "toPay"] += entry.cents;
      if (entry.date < today) {
        totals.overdue += 1;
      }
    }
  }
  totals.net = totals.credits - totals.debits;
  return totals;
}

/** Whether an entry waits past its day. */
export function isOverdue(entry: Pick<Entry, "paid" | "date">, today: string) {
  return !entry.paid && entry.date < today;
}

/** The category an entry is filed under, unless it's none or was deleted. */
export function categoryOf(
  categories: readonly Category[],
  id: string | undefined
): Category | undefined {
  return id === undefined
    ? undefined
    : categories.find((category) => category.id === id);
}

/** Stands for no category among the categories filtered by; ids never read like it. */
export const NO_CATEGORY = "none";

/** Narrows a month's entries to what's searched and filtered. */
export interface EntryFilters {
  search: string;
  kinds: EntryKind[];
  statuses: EntryStatus[];
  /** Category ids, and `NO_CATEGORY` for none. */
  categories: string[];
}

export const NO_FILTERS: EntryFilters = {
  categories: [],
  kinds: [],
  search: "",
  statuses: [],
};

/** How many filters narrow the entries, the search aside. */
export function filterCount(filters: EntryFilters): number {
  return (
    filters.kinds.length + filters.statuses.length + filters.categories.length
  );
}

export function matchesFilters(
  entry: Entry,
  filters: EntryFilters,
  categories: readonly Category[]
): boolean {
  const category = categoryOf(categories, entry.category);
  if (filters.kinds.length > 0 && !filters.kinds.includes(entry.kind)) {
    return false;
  }
  if (
    filters.statuses.length > 0 &&
    !filters.statuses.includes(entry.paid ? "paid" : "unpaid")
  ) {
    return false;
  }
  if (
    filters.categories.length > 0 &&
    !filters.categories.includes(category?.id ?? NO_CATEGORY)
  ) {
    return false;
  }
  const needle = filters.search.trim().toLowerCase();
  if (!needle) {
    return true;
  }
  return [entry.name, entry.note, category?.name ?? ""].some((text) =>
    text.toLowerCase().includes(needle)
  );
}
