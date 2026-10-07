import type { Candle } from "@/lib/bitcoin-price";
import { intervalFor } from "@/lib/bitcoin-price";
import type { Transaction } from "@/lib/portfolio";
import { signedSats } from "@/lib/portfolio";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export const RANGES = [
  { label: "24H", span: DAY, value: "24h" },
  { label: "7D", span: 7 * DAY, value: "7d" },
  { label: "30D", span: 30 * DAY, value: "30d" },
  { label: "90D", span: 90 * DAY, value: "90d" },
  { label: "All", span: undefined, value: "all" },
] as const;

export type Range = (typeof RANGES)[number]["value"];

/** What the chart plots: fiat value, or the bitcoin itself. */
export type ChartMode = "fiat" | "btc";

/** The holdings at one moment, and what a bitcoin cost then. */
export interface SeriesPoint {
  t: number;
  sats: number;
  price: number;
}

/** How far back `range` reaches from `now`: for all, to just before the first transaction. */
export function rangeStart(
  range: Range,
  now: number,
  transactions: Pick<Transaction, "at">[]
): number {
  const span = RANGES.find((item) => item.value === range)?.span;
  if (span !== undefined) {
    return now - span;
  }
  const first = transactions[0]?.at;
  if (first === undefined || first >= now) {
    return now - 30 * DAY;
  }
  // A little room before the first buy, so the line visibly starts at zero.
  return first - Math.max((now - first) * 0.02, HOUR);
}

/** The candle size that covers `range` finely enough. */
export function rangeInterval(start: number, now: number) {
  return intervalFor((now - start) * 1.05);
}

/**
 * The holdings over [start, end], valued with the candles: a point at every
 * candle, and two at every transaction, just before and just after, so the
 * line steps instead of sloping into it. `live` is the price at `end`.
 */
export function buildSeries({
  transactions,
  candles,
  start,
  end,
  live,
}: {
  /** In the order they happened. */
  transactions: Transaction[];
  /** In time order. */
  candles: Candle[];
  start: number;
  end: number;
  live?: number;
}): SeriesPoint[] {
  const times = new Set<number>([start, end]);
  for (const candle of candles) {
    if (candle.t > start && candle.t < end) {
      times.add(candle.t);
    }
  }
  for (const transaction of transactions) {
    if (transaction.at > start && transaction.at <= end) {
      times.add(transaction.at - 1);
      times.add(transaction.at);
    }
  }
  const sorted = [...times].toSorted((a, b) => a - b);

  const points: SeriesPoint[] = [];
  let sats = 0;
  let next = 0;
  let candle = 0;
  for (const t of sorted) {
    while (next < transactions.length) {
      const transaction = transactions[next];
      if (!transaction || transaction.at > t) {
        break;
      }
      sats += signedSats(transaction);
      next += 1;
    }
    while (candle + 1 < candles.length && (candles[candle + 1]?.t ?? 0) <= t) {
      candle += 1;
    }
    // Before the first candle, its price stands in.
    const price =
      t === end && live !== undefined ? live : (candles[candle]?.price ?? 0);
    points.push({ price, sats, t });
  }
  return points;
}
