/**
 * Bitcoin prices from Kraken's public API, straight from the browser. Pages
 * that show a price subscribe; while any does, the price is asked for again
 * every half minute, and not at all while the tab is hidden. Pages that show
 * it live also open Kraken's socket, which sends every trade's price as it
 * happens; while it does, there's no need to ask. A past moment's price is
 * asked for once, from the trades Kraken kept.
 */
import { useEffect, useSyncExternalStore } from "react";

import type { Fiat } from "@/lib/portfolio";

const API = "https://api.kraken.com/0/public";
const SOCKET = "wss://ws.kraken.com/v2";
const PAIRS: Record<Fiat, string> = { EUR: "XBTEUR", USD: "XBTUSD" };
/** The same pairs as the socket names them. */
const SYMBOLS: Record<string, Fiat> = { "BTC/EUR": "EUR", "BTC/USD": "USD" };
const REFRESH = 30_000;
const MINUTE = 60_000;
/** Live prices reach the page at most this often. */
const TICK = 1000;
/** The socket stays open this long after the last live price leaves the page. */
const LINGER = 5000;
/** Reconnecting waits twice as long after each failure, up to this. */
const MAX_BACKOFF = 30_000;
/** Kraken answers with at most this many of the latest candles. */
const MAX_CANDLES = 720;
/** Candle sizes Kraken offers, in minutes. */
export type Interval = 1 | 5 | 15 | 30 | 60 | 240 | 1440 | 10_080 | 21_600;
/** The ones charts pick from to cover a span, finest first. */
const INTERVALS: readonly Interval[] = [5, 30, 240, 1440, 10_080, 21_600];
/** Candles of up to this size are fetched again this often. */
const MAX_STALE = 15 * MINUTE;

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

interface TickerMessage {
  channel?: string;
  data?: { last?: unknown; symbol?: string }[];
}

/** The latest trade prices in a message from the socket; none for other messages. */
function tradePrices(raw: unknown): [Fiat, number][] {
  if (typeof raw !== "string") {
    return [];
  }
  let message: TickerMessage;
  try {
    message = JSON.parse(raw) as TickerMessage;
  } catch {
    return [];
  }
  if (message.channel !== "ticker" || !Array.isArray(message.data)) {
    return [];
  }
  return message.data.flatMap(({ last, symbol }): [Fiat, number][] => {
    const fiat = symbol === undefined ? undefined : SYMBOLS[symbol];
    return fiat && typeof last === "number" && last > 0 ? [[fiat, last]] : [];
  });
}

/** How many on the page show the price live; the socket is open while any do. */
let liveUsers = 0;
let socket: WebSocket | undefined;
/** Whether prices are coming in over the socket right now. */
let streaming = false;
/** Failed connections in a row, which the next one waits longer for. */
let failures = 0;
let retry: ReturnType<typeof setTimeout> | undefined;
let linger: ReturnType<typeof setTimeout> | undefined;
/** Prices in since the last flush, held so the page updates once a tick. */
let pending: Partial<Prices> = {};
let flushTimer: ReturnType<typeof setTimeout> | undefined;
let flushedAt = 0;

function setStreaming(next: boolean): void {
  if (streaming !== next) {
    streaming = next;
    notify();
  }
}

/** Shows the prices in so far, keeping the other currency's until it trades. */
function flush(): void {
  flushTimer = undefined;
  const EUR = pending.EUR ?? ticker.data?.EUR;
  const USD = pending.USD ?? ticker.data?.USD;
  if (EUR === undefined || USD === undefined) {
    return;
  }
  pending = {};
  flushedAt = Date.now();
  // Fresh, so the half-minute asking leaves it be.
  ticker = {
    data: { EUR, USD, at: flushedAt },
    failed: false,
    fetchedAt: flushedAt,
  };
  notify();
}

function receive(fiat: Fiat, price: number): void {
  pending[fiat] = price;
  if (flushTimer !== undefined) {
    return;
  }
  const wait = flushedAt + TICK - Date.now();
  if (wait > 0) {
    flushTimer = setTimeout(flush, wait);
  } else {
    flush();
  }
}

function connect(): void {
  clearTimeout(retry);
  retry = undefined;
  if (socket || liveUsers === 0 || document.hidden) {
    return;
  }
  const next = new WebSocket(SOCKET);
  socket = next;
  next.addEventListener("open", () =>
    next.send(
      JSON.stringify({
        method: "subscribe",
        params: { channel: "ticker", symbol: Object.keys(SYMBOLS) },
      })
    )
  );
  next.addEventListener("message", ({ data }) => {
    const prices = tradePrices(data);
    if (prices.length === 0) {
      return;
    }
    failures = 0;
    setStreaming(true);
    for (const [fiat, price] of prices) {
      receive(fiat, price);
    }
  });
  next.addEventListener("close", () => {
    // A socket closed on purpose has been let go already.
    if (socket !== next) {
      return;
    }
    socket = undefined;
    setStreaming(false);
    retry = setTimeout(connect, Math.min(1000 * 2 ** failures, MAX_BACKOFF));
    failures += 1;
  });
}

function disconnect(): void {
  clearTimeout(retry);
  retry = undefined;
  const current = socket;
  socket = undefined;
  current?.close();
  setStreaming(false);
}

function onVisibility(): void {
  if (document.hidden) {
    disconnect();
  } else {
    connect();
  }
}

/** Keeps the socket open until the returned function is called. */
function openLive(): () => void {
  clearTimeout(linger);
  if (liveUsers === 0) {
    document.addEventListener("visibilitychange", onVisibility);
    globalThis.addEventListener("online", connect);
  }
  liveUsers += 1;
  connect();
  let released = false;
  return () => {
    if (released) {
      return;
    }
    released = true;
    liveUsers -= 1;
    if (liveUsers > 0) {
      return;
    }
    // Lingers, so coming straight back finds it still open.
    linger = setTimeout(() => {
      document.removeEventListener("visibilitychange", onVisibility);
      globalThis.removeEventListener("online", connect);
      disconnect();
    }, LINGER);
  };
}

function streamingNow(): boolean {
  return streaming;
}

/**
 * The latest price as each trade happens, at most once a second. `live` says
 * whether it's streaming in right now; otherwise it's asked for as usual.
 */
export function useLiveBtcPrices(): Feed<Prices> & { live: boolean } {
  useEffect(openLive, []);
  const prices = useBtcPrices();
  const live = useSyncExternalStore(subscribe, streamingNow);
  return { ...prices, live };
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

/**
 * How long after a moment the first trade may come and still stand for it.
 * Before Kraken began, in late 2013, the first trade comes years later.
 */
const MAX_TRADE_GAP = 24 * 60 * MINUTE;
/** How long to wait for the moment to stop changing, as it's typed, before asking. */
const PRICE_AT_DELAY = 300;

/** What a bitcoin cost at a past minute, by currency and minute; null when Kraken has no trade near it. */
const pricesAt = new Map<string, Feed<number | null>>();
/** Lookups under way, so a second ask for the same minute waits on the first. */
const priceAtLoading = new Map<string, Promise<void>>();

function minuteOf(at: number): number {
  return Math.floor(at / MINUTE) * MINUTE;
}

async function askPriceAt(
  fiat: Fiat,
  minute: number,
  key: string
): Promise<void> {
  try {
    // The first trade from that minute on; Kraken keeps every one.
    const result = await kraken("Trades", {
      count: "1",
      pair: PAIRS[fiat],
      since: String(minute / 1000),
    });
    const rows = pairResult(result, fiat);
    // Each row is [price, volume, time in seconds, …].
    const [row] = Array.isArray(rows)
      ? (rows as [string, string, number][])
      : [];
    const price = Number(row?.[0]);
    const near = row !== undefined && row[2] * 1000 - minute <= MAX_TRADE_GAP;
    pricesAt.set(key, {
      data: near && price > 0 ? price : null,
      failed: false,
      fetchedAt: Date.now(),
    });
  } catch {
    pricesAt.set(key, { failed: true, fetchedAt: 0 });
  } finally {
    priceAtLoading.delete(key);
    notify();
  }
}

function loadPriceAt(fiat: Fiat, minute: number): Promise<void> {
  const key = `${fiat}:${minute}`;
  const loading = priceAtLoading.get(key);
  if (loading) {
    return loading;
  }
  if (pricesAt.get(key)?.data !== undefined) {
    return Promise.resolve();
  }
  const promise = askPriceAt(fiat, minute, key);
  priceAtLoading.set(key, promise);
  return promise;
}

const NO_PRICE_AT: Feed<number | null> = { failed: false, fetchedAt: 0 };

/**
 * What a bitcoin cost in `fiat` at the minute `at` falls in: undefined while
 * it loads, null when there's no trade near it. Nothing is asked while `at`
 * is undefined.
 */
export function useBtcPriceAt(
  fiat: Fiat,
  at: number | undefined
): Feed<number | null> {
  const minute = at === undefined ? undefined : minuteOf(at);
  const snapshot = useSyncExternalStore(subscribe, () =>
    minute === undefined
      ? NO_PRICE_AT
      : (pricesAt.get(`${fiat}:${minute}`) ?? NO_PRICE_AT)
  );
  useEffect(() => {
    if (minute === undefined) {
      return;
    }
    const timer = setTimeout(() => loadPriceAt(fiat, minute), PRICE_AT_DELAY);
    return () => clearTimeout(timer);
  }, [fiat, minute]);
  return snapshot;
}

/** Kraken lets the public ask about once a second; lookups in a row keep to that. */
const LOOKUP_GAP = 1100;
/** How many times a lookup is tried before its moment counts as having no price. */
const LOOKUP_TRIES = 3;

function pause(ms: number, signal?: AbortSignal): Promise<void> {
  // oxlint-disable-next-line promise/avoid-new -- a timer has no promise of its own
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

/**
 * What a bitcoin cost in `fiat` at each moment, one lookup at a time so
 * Kraken doesn't turn them away. Resolves with prices by minute, null where
 * there's none; `onProgress` hears how many minutes are done of how many.
 */
export async function findPricesAt(
  fiat: Fiat,
  moments: number[],
  {
    onProgress,
    signal,
  }: {
    onProgress?: (done: number, total: number) => void;
    signal?: AbortSignal;
  } = {}
): Promise<Map<number, number | null>> {
  const minutes = [...new Set(moments.map(minuteOf))];
  const found = new Map<number, number | null>();
  for (const [index, minute] of minutes.entries()) {
    if (signal?.aborted) {
      break;
    }
    const key = `${fiat}:${minute}`;
    for (let tries = 0; tries < LOOKUP_TRIES; tries += 1) {
      if (pricesAt.get(key)?.data !== undefined || signal?.aborted) {
        break;
      }
      // One at a time on purpose, so Kraken doesn't turn them away.
      // oxlint-disable-next-line no-await-in-loop
      await loadPriceAt(fiat, minute);
      // oxlint-disable-next-line no-await-in-loop
      await pause(LOOKUP_GAP * (tries + 1), signal);
    }
    found.set(minute, pricesAt.get(key)?.data ?? null);
    onProgress?.(index + 1, minutes.length);
  }
  return found;
}

/** The price `findPricesAt` found for the minute `at` falls in. */
export function foundPriceAt(
  found: ReadonlyMap<number, number | null>,
  at: number
): number | null | undefined {
  return found.get(minuteOf(at));
}
