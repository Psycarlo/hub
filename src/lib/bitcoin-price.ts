/**
 * Bitcoin prices from Kraken's public API, straight from the browser. Pages
 * that show a price subscribe; while any does, the price is asked for again
 * every half minute, and not at all while the tab is hidden.
 */
import { useEffect, useSyncExternalStore } from "react";

import type { Fiat } from "@/lib/portfolio";

const API = "https://api.kraken.com/0/public";
const PAIRS: Record<Fiat, string> = { EUR: "XBTEUR", USD: "XBTUSD" };
const REFRESH = 30_000;
const MINUTE = 60_000;
/** Kraken answers with at most this many of the latest candles. */
const MAX_CANDLES = 720;
/** Candle sizes Kraken offers, in minutes; the ones charts pick from. */
const INTERVALS = [5, 30, 240, 1440, 10_080, 21_600] as const;
/** Candles of up to this size are fetched again this often. */
const MAX_STALE = 15 * MINUTE;

export type Interval = (typeof INTERVALS)[number];

export interface Prices extends Record<Fiat, number> {
  /** When Kraken gave them. */
  at: number;
}

export interface Candle {
  /** When the candle closed, in ms; the latest one is still open. */
  t: number;
  /** The last trade's price in it. */
  price: number;
}

interface Feed<T> {
  data?: T;
  /** The last attempt failed; `data` is from an earlier one, if any. */
  failed: boolean;
  fetchedAt: number;
}

interface KrakenResponse {
  error: string[];
  result: Record<string, unknown>;
}

async function kraken(
  path: string,
  params: Record<string, string>
): Promise<Record<string, unknown>> {
  const response = await fetch(`${API}/${path}?${new URLSearchParams(params)}`);
  if (!response.ok) {
    throw new Error(`Kraken answered ${response.status}.`);
  }
  const body = (await response.json()) as KrakenResponse;
  if (body.error.length > 0) {
    throw new Error(body.error.join(" "));
  }
  return body.result;
}

/** Kraken names pairs its own way, like `XXBTZEUR`; they end in the currency. */
function pairResult(result: Record<string, unknown>, fiat: Fiat): unknown {
  return Object.entries(result).find(([key]) => key.endsWith(fiat))?.[1];
}

const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

let ticker: Feed<Prices> = { failed: false, fetchedAt: 0 };
let tickerLoading = false;

function lastPrice(result: Record<string, unknown>, fiat: Fiat): number {
  const pair = pairResult(result, fiat) as { c?: string[] } | undefined;
  const price = Number(pair?.c?.[0]);
  if (!(price > 0)) {
    throw new Error(`Kraken sent no ${fiat} price.`);
  }
  return price;
}

async function loadTicker(): Promise<void> {
  if (
    tickerLoading ||
    document.hidden ||
    Date.now() - ticker.fetchedAt < REFRESH / 2
  ) {
    return;
  }
  tickerLoading = true;
  try {
    const result = await kraken("Ticker", {
      pair: `${PAIRS.USD},${PAIRS.EUR}`,
    });
    const at = Date.now();
    ticker = {
      data: {
        EUR: lastPrice(result, "EUR"),
        USD: lastPrice(result, "USD"),
        at,
      },
      failed: false,
      fetchedAt: at,
    };
  } catch {
    // The last price stays up; the next round tries again.
    ticker = { ...ticker, failed: true, fetchedAt: 0 };
  } finally {
    tickerLoading = false;
    notify();
  }
}

/** The latest price in both currencies, kept current while the page is open. */
export function useBtcPrices(): Feed<Prices> {
  const snapshot = useSyncExternalStore(subscribe, () => ticker);
  useEffect(() => {
    loadTicker();
    const timer = setInterval(loadTicker, REFRESH);
    const onVisible = () => {
      if (!document.hidden) {
        loadTicker();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  return snapshot;
}

const histories = new Map<string, Feed<Candle[]>>();
const historyLoading = new Set<string>();

function staleAfter(interval: Interval): number {
  return Math.min(Math.max((interval * MINUTE) / 2, MINUTE), MAX_STALE);
}

function toCandles(rows: unknown, interval: Interval): Candle[] {
  if (!Array.isArray(rows)) {
    throw new TypeError("Kraken sent no candles.");
  }
  // Each row is [open time in seconds, open, high, low, close, …].
  return rows.map((row: [number, ...string[]]) => ({
    price: Number(row[4]),
    t: (row[0] + interval * 60) * 1000,
  }));
}

async function loadHistory(fiat: Fiat, interval: Interval): Promise<void> {
  const key = `${fiat}:${interval}`;
  const current = histories.get(key);
  if (
    historyLoading.has(key) ||
    document.hidden ||
    (current && Date.now() - current.fetchedAt < staleAfter(interval))
  ) {
    return;
  }
  historyLoading.add(key);
  try {
    const result = await kraken("OHLC", {
      interval: String(interval),
      pair: PAIRS[fiat],
    });
    histories.set(key, {
      data: toCandles(pairResult(result, fiat), interval),
      failed: false,
      fetchedAt: Date.now(),
    });
  } catch {
    histories.set(key, { data: current?.data, failed: true, fetchedAt: 0 });
  } finally {
    historyLoading.delete(key);
    notify();
  }
}

const NO_HISTORY: Feed<Candle[]> = { failed: false, fetchedAt: 0 };

/** Recent candles in `fiat`, as many as Kraken gives, kept current while shown. */
export function useBtcHistory(fiat: Fiat, interval: Interval): Feed<Candle[]> {
  const snapshot = useSyncExternalStore(
    subscribe,
    () => histories.get(`${fiat}:${interval}`) ?? NO_HISTORY
  );
  useEffect(() => {
    loadHistory(fiat, interval);
    const timer = setInterval(() => loadHistory(fiat, interval), REFRESH);
    return () => clearInterval(timer);
  }, [fiat, interval]);
  return snapshot;
}

/** The finest candles whose latest `MAX_CANDLES` still reach back over `span` ms. */
export function intervalFor(span: number): Interval {
  return (
    INTERVALS.find((interval) => interval * MINUTE * MAX_CANDLES >= span) ??
    INTERVALS.at(-1) ??
    1440
  );
}
