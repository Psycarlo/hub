import { areaY, defineChart, lineY } from "@tanstack/charts";
import { crosshair } from "@tanstack/charts/crosshair";
import { motion } from "@tanstack/charts/motion";
import type { ChartPoint } from "@tanstack/charts/react/tooltip";
import { RendererChart } from "@tanstack/charts/react/tooltip";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { tooltip } from "@tanstack/charts/tooltip";
import { scaleTime } from "d3-scale";
import { format } from "date-fns";
import { useMemo } from "react";

import type { ChartMode, SeriesPoint } from "@/features/portfolios/series";
import type { Fiat } from "@/lib/portfolio";
import {
  SATS_PER_BTC,
  fiatValue,
  formatBtc,
  formatFiat,
} from "@/lib/portfolio";

const DAY = 86_400_000;
const FILL = "portfolio-chart-fill";
const LINE = "var(--primary)";
/** Room above the plot where the tooltip rides, so it never covers the line. */
const TOOLTIP_BAND = 52;
const Y_TICKS = 4;

/** What the chart draws at one moment: `value` in the chart's mode. */
interface Datum extends SeriesPoint {
  value: number;
}

// Module scope keeps the renderer, so a new definition animates instead of
// starting over. Springs settle quickly, and reduced motion turns them off.
const renderer = motion<Datum, Date, number>({
  respectReducedMotion: true,
  transition: { damping: 34, mass: 1, stiffness: 240, type: "spring" },
});

/** The values' range with some air around it, never dipping below zero for positive values. */
function yDomain(points: Datum[]): [number, number] {
  let lo = Number.POSITIVE_INFINITY;
  let hi = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    lo = Math.min(lo, point.value);
    hi = Math.max(hi, point.value);
  }
  if (!(Number.isFinite(lo) && Number.isFinite(hi)) || hi <= 0) {
    return [0, 1];
  }
  const span = hi - lo;
  const pad = span > 0 ? span * 0.12 : hi * 0.05;
  return [lo >= 0 ? Math.max(0, lo - pad) : lo - pad, hi + pad];
}

/**
 * Axis money, short like `$1.2M`, with the digits it takes to tell the ticks
 * apart: a quiet day around $1.2M reads `$1.195M`, `$1.2M`, `$1.205M`.
 */
function fiatTickFormat(
  ticks: number[],
  fiat: Fiat
): (value: number) => string {
  const [first, second] = ticks;
  if (first === undefined || second === undefined) {
    return (value) => formatFiat(value, fiat, { compact: true });
  }
  const top = Math.max(...ticks.map(Math.abs));
  const digits =
    Math.floor(Math.log10(top)) - Math.floor(Math.log10(second - first)) + 1;
  const money = new Intl.NumberFormat(undefined, {
    currency: fiat,
    maximumSignificantDigits: Math.min(21, Math.max(1, digits)),
    notation: "compact",
    style: "currency",
  });
  return (value) => money.format(value);
}

/** Axis dates: hours for a day, days for months, months beyond. */
function tickFormat(span: number): string {
  if (span <= 2 * DAY) {
    return "HH:mm";
  }
  return span <= 200 * DAY ? "MMM d" : "MMM yyyy";
}

function TooltipBody({
  point,
  fiat,
  mode,
  withTime,
}: {
  point: Datum;
  fiat: Fiat;
  mode: ChartMode;
  withTime: boolean;
}) {
  // Without prices, only the bitcoin is known.
  const fiatText =
    point.price > 0
      ? formatFiat(fiatValue(point.sats, point.price), fiat)
      : undefined;
  const btcText = formatBtc(point.sats);
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-muted-foreground">
        {format(point.t, withTime ? "MMM d, HH:mm" : "MMM d, yyyy")}
      </span>
      <span className="flex items-baseline gap-2 tabular-nums">
        <span className="text-foreground text-[0.8125rem] font-semibold">
          {mode === "fiat" ? fiatText : btcText}
        </span>
        <span className="text-muted-foreground">
          {mode === "fiat" ? btcText : fiatText}
        </span>
      </span>
    </div>
  );
}

interface ValueChartProps {
  /** In time order. */
  points: SeriesPoint[];
  fiat: Fiat;
  mode: ChartMode;
  ariaLabel: string;
  height?: number;
}

/**
 * The holdings over time as a line with a soft fill below it. Hovering
 * follows the nearest moment; its tooltip stays at the top of the plot.
 */
export function ValueChart({
  points,
  fiat,
  mode,
  ariaLabel,
  height = 260,
}: ValueChartProps) {
  const span = (points.at(-1)?.t ?? 0) - (points[0]?.t ?? 0);
  // Candles of a day or longer have no meaningful time of day.
  const withTime = span <= 120 * DAY;

  const definition = useMemo(() => {
    const rows: Datum[] = points.map((point) => ({
      ...point,
      value:
        mode === "fiat"
          ? fiatValue(point.sats, point.price)
          : point.sats / SATS_PER_BTC,
    }));
    const [lo, hi] = yDomain(rows);
    const y = scaleLinear().domain([lo, hi]);
    const pattern = tickFormat(span);
    const formatFiatTick = fiatTickFormat(y.ticks(Y_TICKS), fiat);
    const formatY = (value: number) =>
      mode === "fiat"
        ? formatFiatTick(value)
        : formatBtc(Math.round(value * SATS_PER_BTC));
    const x = (datum: Datum) => new Date(datum.t);

    return defineChart({
      clip: true,
      focus: "nearest-x",
      // The crosshair's marker stands in for the ring, so it can skip the spring.
      focusRing: false,
      gradients: [
        {
          id: FILL,
          stops: [
            { color: LINE, offset: 0, opacity: 0.22 },
            { color: LINE, offset: 1, opacity: 0 },
          ],
          type: "linear",
          x1: 0,
          x2: 0,
          y1: 0,
          y2: 1,
        },
      ],
      margin: { top: TOOLTIP_BAND },
      marks: [
        // The fill rests on the plot's floor, not on zero.
        areaY(rows, {
          fill: `url(#${FILL})`,
          fillOpacity: 1,
          key: "t",
          x,
          y: "value",
          y1: lo,
        }),
        lineY(rows, { key: "t", stroke: LINE, strokeWidth: 2, x, y: "value" }),
        // Pinned to the pointer: a spring here trails behind it.
        crosshair({
          marker: {
            fill: "var(--card)",
            radius: 4,
            stroke: LINE,
            strokeWidth: 2,
          },
          motion: false,
          stroke: "var(--muted-foreground)",
          strokeDasharray: "3 3",
          strokeOpacity: 0.5,
          x: true,
          y: false,
        }),
      ],
      maxFocusDistance: Number.POSITIVE_INFINITY,
      scales: {
        x: {
          axis: {
            line: false,
            tickLabels: { thin: { minGap: 16 } },
            ticks: {
              count: 5,
              format: (value: Date) => format(value, pattern),
              size: 0,
            },
          },
          grid: false,
          scale: scaleTime,
        },
        y: {
          axis: {
            line: false,
            ticks: { count: Y_TICKS, format: formatY, size: 0 },
          },
          grid: { stroke: "var(--border)", strokeWidth: 1 },
          scale: y,
        },
      },
      theme: { grid: "var(--border)", muted: "var(--muted-foreground)" },
      tooltip: {
        anchor: { x: "value", y: "plot-top" },
        motion: false,
        offset: 6,
        placement: ["top", "top-left", "top-right"],
        sticky: false,
        use: tooltip,
      },
    });
  }, [points, fiat, mode, span]);

  return (
    <RendererChart
      ariaLabel={ariaLabel}
      className="text-xs [--ts-chart-tooltip-background:var(--popover)] [--ts-chart-tooltip-border-radius:0.75rem] [--ts-chart-tooltip-border:none] [--ts-chart-tooltip-color:var(--popover-foreground)] [--ts-chart-tooltip-font:500_0.75rem/1.35_var(--font-sans)] [--ts-chart-tooltip-padding:0.375rem_0.625rem] [--ts-chart-tooltip-shadow:var(--shadow-raised)]"
      definition={definition}
      height={height}
      renderTooltipBody={({ primaryPoint, points: focused }) => {
        const point: ChartPoint<Datum, Date, number> | undefined =
          primaryPoint ?? focused[0];
        return point ? (
          <TooltipBody
            fiat={fiat}
            mode={mode}
            point={point.datum}
            withTime={withTime}
          />
        ) : null;
      }}
      renderer={renderer}
    />
  );
}
