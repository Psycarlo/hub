import "@kitlangton/rolling-number/styles.css";
import { RollingNumber } from "@kitlangton/rolling-number/react";
import { cn } from "cn";
import {
  ArrowDownRightIcon,
  ArrowRightIcon,
  ArrowUpRightIcon,
  BitcoinIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import type { SparkPoint } from "@/features/widgets/sparkline";
import { SPARKLINE_HEIGHT, Sparkline } from "@/features/widgets/sparkline";
import type { WidgetKind } from "@/features/widgets/widget-kind";
import { SettingTabs, WidgetBleed } from "@/features/widgets/widget-parts";
import { useMe } from "@/hooks/use-users";
import type { Candle, Interval, Prices } from "@/lib/bitcoin-price";
import { useBtcHistory, useLiveBtcPrices } from "@/lib/bitcoin-price";
import { CHIP_COLORS } from "@/lib/palette";
import type { Fiat } from "@/lib/portfolio";
import { FIATS, formatFiat } from "@/lib/portfolio";
import type { SettingsOf, Timeframe } from "@/lib/widgets";
import { TIMEFRAMES } from "@/lib/widgets";

type Settings = SettingsOf<"bitcoinPrice">;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
/** About the most points a line holds; any more, at a card's width, read as noise. */
const MOST_POINTS = 120;

interface Frame {
  /** The candles the line is drawn from, as few as still trace it. */
  interval: Interval;
  /** What the change is over, like "Past day". */
  label: string;
  span: number;
  /** Its name among the timeframes to pick from, like "24H". */
  tab: string;
  /** How a moment within it reads. */
  time: Intl.DateTimeFormat;
}

// Shortest to longest, like the timeframes they're picked from.
// oxlint-disable-next-line sort-keys
const FRAMES: Record<Timeframe, Frame> = {
  "1h": {
    interval: 1,
    label: "Past hour",
    span: HOUR,
    tab: "1H",
    time: new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
    }),
  },
  "24h": {
    interval: 15,
    label: "Past day",
    span: DAY,
    tab: "24H",
    time: new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
      weekday: "short",
    }),
  },
  "7d": {
    interval: 60,
    label: "Past week",
    span: 7 * DAY,
    tab: "7D",
    time: new Intl.DateTimeFormat(undefined, {
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      month: "short",
    }),
  },
  "30d": {
    interval: 240,
    label: "Past month",
    span: 30 * DAY,
    tab: "30D",
    time: new Intl.DateTimeFormat(undefined, {
      day: "numeric",
      hour: "numeric",
      month: "short",
    }),
  },
  "1y": {
    interval: 1440,
    label: "Past year",
    span: 365 * DAY,
    tab: "1Y",
    time: new Intl.DateTimeFormat(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    }),
  },
};

const PERCENT: Intl.NumberFormatOptions = {
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
  signDisplay: "exceptZero",
  style: "percent",
};

const UP = { color: CHIP_COLORS.green, icon: ArrowUpRightIcon };
const DOWN = { color: CHIP_COLORS.red, icon: ArrowDownRightIcon };
const FLAT = { color: CHIP_COLORS.gray, icon: ArrowRightIcon };

function trendOf(change: number) {
  if (change > 0) {
    return UP;
  }
  if (change < 0) {
    return DOWN;
  }
  return FLAT;
}

/** The change from the start of the line, signed, with an arrow for which way. */
function Change({ value }: { value: number }) {
  // Rounded as it shows, so a change too small to see reads as none.
  const shown = Math.round(value * 10_000) / 10_000;
  const { color, icon: Icon } = trendOf(shown);
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-0.5 rounded-full pr-2 pl-1.5 text-xs font-medium tabular-nums transition-colors duration-150 ease-out",
        color
      )}
    >
      <Icon aria-hidden className="size-3.5" />
      <RollingNumber duration={250} format={PERCENT} value={shown} />
    </span>
  );
}

/** The settings on show, with the candles for them once they're in. */
interface Shown {
  fiat: Fiat;
  timeframe: Timeframe;
  candles?: Candle[];
  /** When the candles came in; 0 when the last try failed. */
  fetchedAt: number;
}

/**
 * The candles for these settings. Until they're in, the last settings stay on
 * show, marked stale, so the price and the line never mix two currencies.
 */
function useShown(fiat: Fiat, timeframe: Timeframe) {
  const history = useBtcHistory(fiat, FRAMES[timeframe].interval);
  const wanted: Shown = {
    candles: history.data,
    fetchedAt: history.fetchedAt,
    fiat,
    timeframe,
  };
  const [held, setHeld] = useState(wanted);
  if (history.data && history.data !== held.candles) {
    setHeld(wanted);
  }
  const loading = !(history.data || history.failed);
  const shown = loading && held.candles ? held : wanted;
  return { failed: history.failed, shown, stale: shown !== wanted };
}

/** The price now: the latest trade, or before it's in, the last candle's. */
function latestPoint(
  prices: Prices | undefined,
  { candles, fetchedAt, fiat }: Shown
): SparkPoint | undefined {
  if (prices) {
    return { t: prices.at, value: prices[fiat] };
  }
  // The last candle is still open; it holds the latest trade as of when it came in.
  const open = candles?.at(-1);
  return (
    open && { t: Math.min(open.t, fetchedAt || open.t), value: open.price }
  );
}

/**
 * The candles closed within the frame before the latest price, then the price.
 * When the frame holds more than a line can, every few are kept, picked by
 * when they closed, so the same ones stay as new ones come in.
 */
function linePoints(
  candles: Candle[],
  latest: SparkPoint,
  { interval, span }: Frame
): SparkPoint[] {
  const size = interval * MINUTE;
  const every = Math.ceil(span / size / MOST_POINTS);
  const kept = candles.filter(
    ({ t }) =>
      t < latest.t && t > latest.t - span && Math.round(t / size) % every === 0
  );
  return [...kept.map(({ price, t }) => ({ t, value: price })), latest];
}

/** The price, rolling from one to the next. */
function Price({
  point,
  fiat,
  failed,
  quick,
}: {
  point?: SparkPoint;
  fiat: Fiat;
  /** The live price couldn't be had. */
  failed: boolean;
  /** Rolls faster, to keep up with a pointer moving along the line. */
  quick: boolean;
}) {
  if (point) {
    return (
      <RollingNumber
        duration={quick ? 250 : 600}
        format={{
          currency: fiat,
          maximumFractionDigits: 2,
          minimumFractionDigits: 2,
          style: "currency",
        }}
        motionBlur
        value={point.value}
      />
    );
  }
  if (failed) {
    return <span className="text-muted-foreground">Price unavailable</span>;
  }
  return <Skeleton className="h-9 w-40 rounded-lg" />;
}

function BitcoinPrice({ settings }: { settings: Settings }) {
  const me = useMe();
  const prices = useLiveBtcPrices();
  const { failed, shown, stale } = useShown(
    settings.currency ?? me.currency,
    settings.timeframe
  );
  const [active, setActive] = useState<number>();

  const frame = FRAMES[shown.timeframe];
  const latest = latestPoint(prices.data, shown);
  const points =
    latest && shown.candles ? linePoints(shown.candles, latest, frame) : [];
  // Moving along the line shows the price at that point, and the change up to it.
  const point = (active === undefined ? undefined : points[active]) ?? latest;
  const scrubbing = point !== latest;
  const start = points.length > 1 ? points[0] : undefined;

  let change: ReactNode = <Skeleton className="h-6 w-20 rounded-full" />;
  if (point && start) {
    change = <Change value={point.value / start.value - 1} />;
  } else if (failed) {
    change = undefined;
  }

  let chart: ReactNode = (
    <Skeleton className="rounded-none" style={{ height: SPARKLINE_HEIGHT }} />
  );
  if (points.length > 1) {
    chart = (
      <Sparkline
        active={active}
        describe={(item) =>
          `${frame.time.format(item.t)}: ${formatFiat(item.value, shown.fiat)}`
        }
        label={`Bitcoin price, ${frame.label.toLowerCase()}`}
        live={prices.live && !stale}
        onActiveChange={setActive}
        points={points}
        stale={stale}
      />
    );
  } else if (failed) {
    chart = (
      <p
        className="text-muted-foreground flex items-center justify-center text-xs"
        style={{ height: SPARKLINE_HEIGHT }}
      >
        Chart unavailable
      </p>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-2">
        <div className="text-3xl font-semibold tracking-tight tabular-nums">
          <Price
            failed={prices.failed}
            fiat={shown.fiat}
            point={point}
            quick={scrubbing}
          />
        </div>
        <div className="flex h-6 items-center gap-2">
          {change}
          <span className="text-muted-foreground min-w-0 truncate text-xs tabular-nums">
            {point && scrubbing ? (
              <time dateTime={new Date(point.t).toISOString()}>
                {frame.time.format(point.t)}
              </time>
            ) : (
              frame.label
            )}
          </span>
        </div>
      </div>
      <WidgetBleed>{chart}</WidgetBleed>
    </>
  );
}

const TIMEFRAME_OPTIONS = TIMEFRAMES.map((value) => ({
  label: FRAMES[value].tab,
  value,
}));
const CURRENCY_OPTIONS = FIATS.map((value) => ({ label: value, value }));

function BitcoinSettings({
  settings,
  onChange,
}: {
  settings: Settings;
  onChange: (settings: Settings) => void;
}) {
  const me = useMe();
  return (
    <>
      <SettingTabs
        label="Timeframe"
        onChange={(timeframe) => onChange({ ...settings, timeframe })}
        options={TIMEFRAME_OPTIONS}
        value={settings.timeframe}
      />
      <SettingTabs
        label="Currency"
        onChange={(currency) => onChange({ ...settings, currency })}
        options={CURRENCY_OPTIONS}
        value={settings.currency ?? me.currency}
      />
    </>
  );
}

/** Bitcoin's price as it trades, and a line of where it's been. */
export const BITCOIN_PRICE: WidgetKind<Settings> = {
  Body: BitcoinPrice,
  Settings: BitcoinSettings,
  color: "orange",
  // No currency, so it shows the person's own until they pick one here.
  defaults: { timeframe: "24h", type: "bitcoinPrice" },
  description: "Live price and chart",
  icon: BitcoinIcon,
  name: "Bitcoin",
};
