/** Bitcoin portfolios: what both the server and the app know about them. */

/** The currencies prices are shown and entered in. */
export const FIATS = ["USD", "EUR"] as const;
/** What people see prices in until they pick one in their settings. */
export const DEFAULT_FIAT: Fiat = "USD";

export const TRANSACTION_KINDS = ["buy", "sell", "send", "receive"] as const;

/** The most transactions one import brings in. */
export const MAX_IMPORT = 1000;

export const SATS_PER_BTC = 100_000_000;
/** Every bitcoin there will ever be, in satoshis. */
export const MAX_SATS = 21_000_000 * SATS_PER_BTC;

export type Fiat = (typeof FIATS)[number];
export type TransactionKind = (typeof TRANSACTION_KINDS)[number];

/** Whether the kind brings bitcoin in: a buy or a receive. */
export function isIncoming(kind: TransactionKind): boolean {
  return kind === "buy" || kind === "receive";
}

/**
 * What a transaction adds to the holdings: positive for buys and receives,
 * negative for sells and sends, a send's network fee included.
 */
export function signedSats(transaction: {
  kind: TransactionKind;
  sats: number;
  feeSats?: number;
}): number {
  return isIncoming(transaction.kind)
    ? transaction.sats
    : -(transaction.sats + (transaction.feeSats ?? 0));
}

/** Transactions in the order they happened; same-moment ones in the order they were added. */
export function byTime<T extends { at: number; _creationTime: number }>(
  a: T,
  b: T
): number {
  return a.at - b.at || a._creationTime - b._creationTime;
}
