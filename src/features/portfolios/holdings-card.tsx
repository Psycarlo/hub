import { useEffect, useMemo, useState } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ChartMode, Range } from "@/features/portfolios/series";
import {
  RANGES,
  buildSeries,
  rangeInterval,
  rangeStart,
} from "@/features/portfolios/series";
import { ValueChart } from "@/features/portfolios/value-chart";
import { useMe } from "@/hooks/use-users";
import { useBtcHistory, useBtcPrices } from "@/lib/bitcoin-price";
import type { Transaction } from "@/lib/portfolio";
import { fiatValue, formatBtc, formatFiat } from "@/lib/portfolio";
import { readStorage, writeStorage } from "@/lib/utils";

const RANGE_KEY = "portfolio:range";
const MODE_KEY = "portfolio:mode";
const TICK = 30_000;
const CHART_HEIGHT = 260;

function currentTime(): number {
  return Date.now();
}

/** The time, moving on every half minute so the chart's right edge keeps up. */
function useNow(): number {
  const [now, setNow] = useState(currentTime);
  useEffect(() => {
    const timer = setInterval(() => setNow(currentTime()), TICK);
    return () => clearInterval(timer);
  }, []);
  return now;
}

function storedRange(): Range {
  const stored = readStorage(RANGE_KEY);
  return RANGES.find((item) => item.value === stored)?.value ?? "30d";
}

function storedMode(): ChartMode {
  return readStorage(MODE_KEY) === "btc" ? "btc" : "fiat";
}

function ChartNote({ children }: { children: string }) {
  return (
    <div
      className="bg-muted/60 text-muted-foreground flex items-center justify-center rounded-xl px-6 text-center text-sm"
      style={{ height: CHART_HEIGHT }}
    >
      {children}
    </div>
  );
}

interface HoldingsCardProps {
  /** What the card totals, like a portfolio's name. */
  label: string;
  sats: number;
  /** Everything that made up `sats`, in the order it happened; undefined while loading. */
  transactions?: Transaction[];
}

/** What the holdings are worth now, and a chart of them over time. */
export function HoldingsCard({ label, sats, transactions }: HoldingsCardProps) {
  const { currency: fiat } = useMe();
  const [range, setRange] = useState(storedRange);
  const [mode, setMode] = useState(storedMode);
  const prices = useBtcPrices();
  const clock = useNow();
  const now = Math.max(clock, prices.data?.at ?? 0);
  const start = rangeStart(range, now, transactions ?? []);
  const history = useBtcHistory(fiat, rangeInterval(start, now));
  const live = prices.data?.[fiat];

  const points = useMemo(
    () =>
      buildSeries({
        candles: history.data ?? [],
        end: now,
        live,
        start,
        transactions: transactions ?? [],
      }),
    [history.data, live, now, start, transactions]
  );

  let chart = (
    <ValueChart
      ariaLabel={`${label} over time`}
      fiat={fiat}
      height={CHART_HEIGHT}
      mode={mode}
      points={points}
    />
  );
  if (!(transactions && (history.data || history.failed))) {
    chart = (
      <Skeleton className="rounded-xl" style={{ height: CHART_HEIGHT }} />
    );
  } else if (transactions.length === 0) {
    chart = <ChartNote>Add a transaction to see it grow here.</ChartNote>;
  } else if (!history.data && mode === "fiat") {
    chart = (
      <ChartNote>
        Bitcoin prices didn’t load. Trying again in a moment.
      </ChartNote>
    );
  }

  let value = <Skeleton className="h-9 w-48 rounded-lg" />;
  if (live !== undefined) {
    value = <span>{formatFiat(fiatValue(sats, live), fiat)}</span>;
  } else if (prices.failed) {
    value = <span className="text-muted-foreground">Price unavailable</span>;
  }

  return (
    <section
      aria-label={label}
      className="bg-card shadow-surface flex flex-col gap-4 rounded-2xl p-5 sm:p-6"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 className="text-muted-foreground text-sm">{label}</h2>
          <div className="text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl">
            {value}
          </div>
          <p className="text-muted-foreground flex flex-col text-sm tabular-nums sm:flex-row sm:gap-2">
            <span className="text-foreground font-medium">
              {formatBtc(sats)}
            </span>
            {live !== undefined && (
              <>
                <span aria-hidden className="max-sm:hidden">
                  ·
                </span>
                <span>1 BTC = {formatFiat(live, fiat)}</span>
              </>
            )}
          </p>
        </div>
        <Tabs
          className="shrink-0"
          onValueChange={(next: ChartMode) => {
            setMode(next);
            writeStorage(MODE_KEY, next);
          }}
          value={mode}
        >
          <TabsList aria-label="Chart in">
            <TabsTrigger value="fiat">{fiat}</TabsTrigger>
            <TabsTrigger value="btc">BTC</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      {chart}
      <Tabs
        onValueChange={(next: Range) => {
          setRange(next);
          writeStorage(RANGE_KEY, next);
        }}
        value={range}
      >
        <TabsList aria-label="Time range">
          {RANGES.map((item) => (
            <TabsTrigger key={item.value} value={item.value}>
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </section>
  );
}
