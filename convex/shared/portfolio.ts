/** Bitcoin portfolios: what both the server and the app know about them. */

/** The currencies prices are shown and entered in. */
export const FIATS = ["USD", "EUR"] as const;
/** What people see prices in until they pick one in their settings. */
export const DEFAULT_FIAT: Fiat = "USD";

export const TRANSACTION_KINDS = ["buy", "sell"] as const;

export const SATS_PER_BTC = 100_000_000;
/** Every bitcoin there will ever be, in satoshis. */
export const MAX_SATS = 21_000_000 * SATS_PER_BTC;

export type Fiat = (typeof FIATS)[number];
export type TransactionKind = (typeof TRANSACTION_KINDS)[number];

/** What a transaction adds to the holdings: positive for buys, negative for sells. */
export function signedSats(transaction: {
  kind: TransactionKind;
  sats: number;
}): number {
  return transaction.kind === "buy" ? transaction.sats : -transaction.sats;
}

/** Transactions in the order they happened; same-moment ones in the order they were added. */
export function byTime<T extends { at: number; _creationTime: number }>(
  a: T,
  b: T
): number {
  return a.at - b.at || a._creationTime - b._creationTime;
}
