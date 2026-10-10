/** Finance accounts: what both the server and the app know about them. */

import type { BoardLabel } from "./model";
import type { Fiat } from "./portfolio";

/** Money going out of an account, or coming in. */
export const ENTRY_KINDS = ["debit", "credit"] as const;

export type EntryKind = (typeof ENTRY_KINDS)[number];

/** A category an entry is filed under; shaped like a board's labels. */
export type Category = BoardLabel;

export const MAX_ACCOUNT_TITLE = 80;
export const MAX_ENTRY_NAME = 80;
export const MAX_ENTRY_NOTE = 1000;
export const MAX_CATEGORY_NAME = 40;
export const MAX_CATEGORIES = 100;
/** A trillion, in cents: far past any one entry, to catch a slipped finger. */
export const MAX_CENTS = 100_000_000_000_000;
/** Files an entry keeps, like its invoice, a receipt and the proof it was paid. */
export const MAX_ENTRY_FILES = 5;

/** What a model read off an invoice or receipt; whatever it couldn't is left out. */
export interface InvoiceReading {
  /** Who it's from: the shop, company or person it pays. */
  name?: string;
  /** The total to pay, in cents of `currency`. */
  cents?: number;
  /** ISO 4217, like EUR. */
  currency?: string;
  /** `YYYY-MM-DD` it was issued. */
  issued?: string;
  /** `YYYY-MM-DD` it's due, when it says. */
  due?: string;
  /** Its number, like FT 2026/142. */
  number?: string;
  /** Whether it says it's paid already, as a receipt does. */
  paid?: boolean;
  /** Id of the project's category it fits best, if any does. */
  category?: string;
}

/**
 * Why an invoice wasn't read: reading is off, the file isn't one a model can
 * read, it isn't an invoice, the person read too many lately, or it failed.
 */
export type InvoiceFailure =
  | "off"
  | "unsupported"
  | "not-invoice"
  | "limit"
  | "failed";

export type InvoiceResult =
  | { ok: true; reading: InvoiceReading }
  | { ok: false; reason: InvoiceFailure };

/** Card networks whose logo an account's wallet can show on its card. */
export const CARD_NETWORKS = ["visa", "mastercard"] as const;

export type CardNetwork = (typeof CARD_NETWORKS)[number];

/** `YYYY-MM-DD`, the way entries are dated. */
const DATE = /^(?<month>\d{4}-(?:0[1-9]|1[0-2]))-(?<day>0[1-9]|[12]\d|3[01])$/u;
/** `YYYY-MM`, the way months are named. */
const MONTH = /^\d{4}-(?:0[1-9]|1[0-2])$/u;

/** What a project's categories start as, with its first account. */
export const STARTER_CATEGORIES: readonly Omit<Category, "id">[] = [
  { color: "blue", name: "Housing" },
  { color: "gray", name: "Bills" },
  { color: "green", name: "Groceries" },
  { color: "yellow", name: "Dining" },
  { color: "teal", name: "Transport" },
  { color: "red", name: "Health" },
  { color: "pink", name: "Shopping" },
  { color: "purple", name: "Subscriptions" },
  { color: "orange", name: "Bitcoin" },
  { color: "green", name: "Income" },
];

export function isMonth(value: string): boolean {
  return MONTH.test(value);
}

function daysIn(month: string): number {
  const [year = 0, index = 1] = month.split("-").map(Number);
  return new Date(Date.UTC(year, index, 0)).getUTCDate();
}

/** Whether the value is a real day, February 30th not included. */
export function isDate(value: string): boolean {
  const groups = DATE.exec(value)?.groups;
  return (
    groups?.month !== undefined && Number(groups.day) <= daysIn(groups.month)
  );
}

/** The month a `YYYY-MM-DD` day falls in. */
export function monthOf(date: string): string {
  return date.slice(0, 7);
}

/** The month after, so a month's days run from its name up to the next one's. */
export function nextMonth(month: string): string {
  const [year = 0, index = 1] = month.split("-").map(Number);
  const next = index === 12 ? [year + 1, 1] : [year, index + 1];
  return `${next[0]}-${String(next[1]).padStart(2, "0")}`;
}

/**
 * The day a monthly entry falls on in `month`: its own day, or the month's
 * last when the month is shorter, so the 31st lands on February's end.
 */
export function dayIn(month: string, day: number): string {
  const clamped = Math.min(Math.max(1, day), daysIn(month));
  return `${month}-${String(clamped).padStart(2, "0")}`;
}

/** What an entry adds to the month: positive for credits, negative for debits. */
export function signedCents(entry: { kind: EntryKind; cents: number }): number {
  return entry.kind === "credit" ? entry.cents : -entry.cents;
}

/**
 * Whether an entry in `currency` is one side of a transfer to or from
 * another account in `counted`, by id, in the same currency. A total across
 * them leaves it out: the money only moved between them.
 */
export function isInternalTransfer(
  entry: { transfer?: { accountId: string } },
  currency: Fiat,
  counted: ReadonlyMap<string, Fiat>
): boolean {
  return (
    entry.transfer !== undefined &&
    counted.get(entry.transfer.accountId) === currency
  );
}
