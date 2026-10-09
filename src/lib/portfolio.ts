import type { Doc } from "@convex/_generated/dataModel";
import type { Fiat, TransactionKind } from "@convex/shared/portfolio";
import { SATS_PER_BTC, signedSats } from "@convex/shared/portfolio";

import { plural } from "@/lib/utils";

export {
  DEFAULT_FIAT,
  FIATS,
  MAX_IMPORT,
  MAX_SATS,
  SATS_PER_BTC,
  TRANSACTION_KINDS,
  isIncoming,
  signedSats,
} from "@convex/shared/portfolio";
export type { Fiat, TransactionKind } from "@convex/shared/portfolio";

export type Portfolio = Doc<"portfolios">;
export type Transaction = Doc<"portfolioTransactions">;

/** How an amount of bitcoin is typed: whole coins or satoshis. */
export type Unit = "btc" | "sats";

export const KIND_NAMES: Record<TransactionKind, string> = {
  buy: "Buy",
  receive: "Receive",
  sell: "Sell",
  send: "Send",
};

const BTC_DIGITS = 8;
/** How long the left-out names may run in a total's label before it counts instead. */
const MAX_EXCEPT_LENGTH = 24;
const BTC_AMOUNT = /^(?<whole>\d*)(?:\.(?<fraction>\d*))?$/u;
const SEPARATORS = /[\s,._'’]/gu;
const DIGITS = /^\d+$/u;

const btc = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: BTC_DIGITS,
  minimumFractionDigits: 2,
});
const sats = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
const fiats = new Map<string, Intl.NumberFormat>();
const names = new Intl.ListFormat("en", { type: "conjunction" });

export function formatBtc(amount: number): string {
  return `₿${btc.format(amount / SATS_PER_BTC)}`;
}

export function formatSats(amount: number): string {
  return `${sats.format(amount)} sats`;
}

/** Money with cents; `compact` shortens it for axis labels, like `$12.3K`. */
export function formatFiat(
  value: number,
  fiat: Fiat,
  { compact = false } = {}
): string {
  const key = `${fiat}:${compact}`;
  let format = fiats.get(key);
  if (!format) {
    format = new Intl.NumberFormat(undefined, {
      currency: fiat,
      maximumFractionDigits: compact ? 1 : 2,
      minimumFractionDigits: compact ? 0 : 2,
      notation: compact ? "compact" : "standard",
      style: "currency",
    });
    fiats.set(key, format);
  }
  return format.format(value);
}

/** The currency's symbol on its own, like `€`, for input prefixes. */
export function fiatSymbol(fiat: Fiat): string {
  const parts = new Intl.NumberFormat(undefined, {
    currency: fiat,
    currencyDisplay: "narrowSymbol",
    style: "currency",
  }).formatToParts(0);
  return parts.find((part) => part.type === "currency")?.value ?? fiat;
}

/** What `sats` are worth at `price` per bitcoin. */
export function fiatValue(amount: number, price: number): number {
  return (amount / SATS_PER_BTC) * price;
}

/**
 * What a transaction came to in its currency: a buy's cost with the fee on
 * top, a sell's proceeds with it taken off, or what a send or receive was
 * worth then.
 */
export function transactionTotal(
  transaction: Pick<Transaction, "fee" | "kind" | "price" | "sats">
): number {
  const value = fiatValue(transaction.sats, transaction.price);
  const fee = transaction.fee ?? 0;
  if (transaction.kind === "buy") {
    return value + fee;
  }
  return transaction.kind === "sell" ? value - fee : value;
}

/**
 * Satoshis typed as text, or undefined if it isn't an amount. Bitcoin takes
 * up to eight decimals, with a point or a comma; satoshis are whole, and any
 * thousands separators are skipped.
 */
export function parseAmount(text: string, unit: Unit): number | undefined {
  const trimmed = text.trim();
  if (unit === "sats") {
    const digits = trimmed.replaceAll(SEPARATORS, "");
    return DIGITS.test(digits) ? Number(digits) : undefined;
  }
  const match = BTC_AMOUNT.exec(trimmed.replace(",", "."));
  const { whole = "", fraction = "" } = match?.groups ?? {};
  if (!match || (whole === "" && fraction === "")) {
    return undefined;
  }
  if (fraction.length > BTC_DIGITS) {
    return undefined;
  }
  // Whole coins and the fraction apart, so no float rounding creeps in.
  return (
    Number(whole || "0") * SATS_PER_BTC +
    Number(fraction.padEnd(BTC_DIGITS, "0"))
  );
}

/** Satoshis as they'd be typed in `unit`, for the amount field. */
export function amountText(amount: number, unit: Unit): string {
  if (unit === "sats") {
    return String(amount);
  }
  const whole = Math.floor(amount / SATS_PER_BTC);
  const fraction = String(amount % SATS_PER_BTC)
    .padStart(BTC_DIGITS, "0")
    .replace(/0+$/u, "");
  return fraction ? `${whole}.${fraction}` : String(whole);
}

/**
 * A price typed as text, or undefined. The last point or comma is the
 * decimal one when cents follow it; any other is a thousands separator.
 */
export function parsePrice(text: string): number | undefined {
  const compact = text.trim().replaceAll(/[\s'’]/gu, "");
  const decimal = /[.,](?<cents>\d{1,2})$/u.exec(compact);
  const whole = decimal ? compact.slice(0, decimal.index) : compact;
  const digits = whole.replaceAll(/[.,]/gu, "");
  if (!DIGITS.test(digits)) {
    return undefined;
  }
  const price = Number(`${digits}.${decimal?.groups?.cents ?? "0"}`);
  return price > 0 ? price : undefined;
}

/**
 * The most a new sell or send at `at` can take, fees included: what's held
 * then, less whatever later sells and sends still need. Transactions are in
 * the order they happened.
 */
export function sellableAt(transactions: Transaction[], at: number): number {
  let held = 0;
  let least: number | undefined;
  for (const transaction of transactions) {
    if (transaction.at > at) {
      least ??= held;
      held += signedSats(transaction);
      least = Math.min(least, held);
    } else {
      held += signedSats(transaction);
    }
  }
  return Math.max(0, least ?? held);
}

/** The portfolios that make up the project's total, leaving out any set apart. */
export function countedPortfolios<
  T extends Pick<Portfolio, "excludedFromTotal">,
>(portfolios: T[]): T[] {
  return portfolios.filter((portfolio) => !portfolio.excludedFromTotal);
}

/** What the portfolios hold together, leaving out any set apart from the total. */
export function totalSats(
  portfolios: Pick<Portfolio, "excludedFromTotal" | "sats">[]
): number {
  return countedPortfolios(portfolios).reduce(
    (sum, portfolio) => sum + portfolio.sats,
    0
  );
}

/**
 * What a total covers, short enough for a heading: every portfolio, all but
 * one or two short names, or else a count. `note` names everything left out,
 * once anything is.
 */
export function describeTotal(
  portfolios: Pick<Portfolio, "excludedFromTotal" | "title">[]
): { label: string; note?: string } {
  const excluded = portfolios
    .filter((portfolio) => portfolio.excludedFromTotal)
    .map((portfolio) => portfolio.title);
  if (excluded.length === 0) {
    return { label: "All portfolios" };
  }
  const list = names.format(excluded);
  const note = `Left out in portfolio settings: ${list}.`;
  if (excluded.length <= 2 && list.length <= MAX_EXCEPT_LENGTH) {
    return { label: `All except ${list}`, note };
  }
  const counted = portfolios.length - excluded.length;
  return {
    label: `${counted} of ${plural(portfolios.length, "portfolio")}`,
    note,
  };
}
