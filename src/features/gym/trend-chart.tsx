import { areaY, defineChart, dot, lineY } from "@tanstack/charts";
import { crosshair } from "@tanstack/charts/crosshair";
import { motion } from "@tanstack/charts/motion";
import type { ChartPoint } from "@tanstack/charts/react/tooltip";
import { RendererChart } from "@tanstack/charts/react/tooltip";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { tooltip } from "@tanstack/charts/tooltip";
import { scaleTime } from "d3-scale";
import { format } from "date-fns";
import { useId, useMemo } from "react";

const DAY = 86_400_000;
/** Room above the plot where the tooltip rides, so it never covers the line. */
const TOOLTIP_BAND = 48;
const Y_TICKS = 4;
/** Past this many points, dots crowd the line and are left off. */
const MAX_DOTS = 40;

export interface TrendPoint {
  /** When, in ms. */
  t: number;
  value: number;
  /** The smoothed value there, drawn as a second, quieter line. */
  trend?: number;
}

// Module scope keeps the renderer, so a new definition animates instead of
// starting over. Springs settle quickly, and reduced motion turns them off.
const renderer = motion<TrendPoint, Date, number>({
  respectReducedMotion: true,
  transition: { damping: 34, mass: 1, stiffness: 240, type: "spring" },
});

/** The values' range with some air around it; weights don't start at zero. */
function yDomain(points: readonly TrendPoint[]): [number, number] {
  const values = points.flatMap((point) =>
    point.trend === undefined ? [point.value] : [point.value, point.trend]
  );
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  if (!(Number.isFinite(lo) && Number.isFinite(hi))) {
    return [0, 1];
  }
  const pad = hi > lo ? (hi - lo) * 0.15 : Math.max(1, hi * 0.05);
  return [Math.max(0, lo - pad), hi + pad];
}

interface TrendChartProps {
  /** In time order; at least two. */
  points: TrendPoint[];
  /** The line's color, any CSS color. */
  color: string;
  ariaLabel: string;
  /** A value as the axis and tooltip read it. */
  formatValue: (value: number) => string;
  /** What the smoothed line is called in the tooltip. */
  trendLabel?: string;
  height?: number;
}

/**
 * Values over time as a line with a soft fill, dots on the points while
 * they're few, and maybe a smoothed line over it. Hovering follows the
 * nearest point; its tooltip stays at the top of the plot.
 */
export function TrendChart({
  points,
  color,
  ariaLabel,
  formatValue,
  trendLabel = "Average",
  height = 220,
}: TrendChartProps) {
  const fill = `trend-fill-${useId().replaceAll(":", "")}`;
  const span = (points.at(-1)?.t ?? 0) - (points[0]?.t ?? 0);
  const pattern = span <= 200 * DAY ? "MMM d" : "MMM yyyy";

  const definition = useMemo(() => {
    const [lo, hi] = yDomain(points);
    const x = (point: TrendPoint) => new Date(point.t);
    const smoothed = points.some((point) => point.trend !== undefined);
    return defineChart({
      clip: true,
      focus: "nearest-x",
      focusRing: false,
      gradients: [
        {
          id: fill,
          stops: [
            { color, offset: 0, opacity: smoothed ? 0.1 : 0.2 },
            { color, offset: 1, opacity: 0 },
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
        areaY(points, {
          fill: `url(#${fill})`,
          fillOpacity: 1,
          key: "t",
          x,
          y: "value",
          y1: lo,
        }),
        ...(smoothed
          ? [
              lineY(points, {
                key: "t",
                stroke: color,
                strokeOpacity: 0.35,
                strokeWidth: 2,
                x,
                y: "value",
              }),
              lineY(points, {
                key: "t",
                stroke: color,
                strokeWidth: 2.5,
                x,
                y: (point: TrendPoint) => point.trend ?? point.value,
              }),
            ]
          : [
              lineY(points, {
                key: "t",
                stroke: color,
                strokeWidth: 2,
                x,
                y: "value",
              }),
            ]),
        ...(points.length <= MAX_DOTS
          ? [
              dot(points, {
                fill: "var(--card)",
                key: "t",
                r: 3,
                stroke: color,
                strokeOpacity: smoothed ? 0.5 : 1,
                strokeWidth: 2,
                x,
                y: "value",
              }),
            ]
          : []),
        crosshair({
          marker: {
            fill: "var(--card)",
            radius: 4,
            stroke: color,
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
            ticks: { count: Y_TICKS, format: formatValue, size: 0 },
          },
          grid: { stroke: "var(--border)", strokeWidth: 1 },
          scale: scaleLinear().domain([lo, hi]),
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
  }, [points, color, fill, formatValue, pattern]);

  return (
    <RendererChart
      ariaLabel={ariaLabel}
      className="text-xs [--ts-chart-tooltip-background:var(--popover)] [--ts-chart-tooltip-border-radius:0.75rem] [--ts-chart-tooltip-border:none] [--ts-chart-tooltip-color:var(--popover-foreground)] [--ts-chart-tooltip-font:500_0.75rem/1.35_var(--font-sans)] [--ts-chart-tooltip-padding:0.375rem_0.625rem] [--ts-chart-tooltip-shadow:var(--shadow-raised)]"
      definition={definition}
      height={height}
      renderTooltipBody={({ primaryPoint, points: focused }) => {
        const point: ChartPoint<TrendPoint, Date, number> | undefined =
          primaryPoint ?? focused[0];
        if (!point) {
          return null;
        }
        const { t, trend, value } = point.datum;
        return (
          <div className="flex flex-col gap-0.5">
            <span className="text-muted-foreground">
              {format(t, "EEE, MMM d, yyyy")}
            </span>
            <span className="text-foreground text-[0.8125rem] font-semibold tabular-nums">
              {formatValue(value)}
            </span>
            {trend !== undefined && (
              <span className="text-muted-foreground tabular-nums">
                {trendLabel} {formatValue(trend)}
              </span>
            )}
          </div>
        );
      }}
      renderer={renderer}
    />
  );
}
