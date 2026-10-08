import { cn } from "cn";
import type { KeyboardEvent, PointerEvent, RefObject } from "react";
import { useId, useLayoutEffect, useRef, useState } from "react";

export interface SparkPoint {
  /** When, in ms. */
  t: number;
  value: number;
}

export const SPARKLINE_HEIGHT = 76;
/** Room above the highest point and below the lowest, so the line clears the edges. */
const PAD_TOP = 12;
const PAD_BOTTOM = 14;
/** Room after the last point, so its dot and the pulse around it aren't cut off. */
const PAD_RIGHT = 16;
/** Page Up and Page Down move this share of the points at a time. */
const PAGE = 0.1;

interface Coord {
  x: number;
  y: number;
}

interface Plot {
  coords: Coord[];
  line: string;
  area: string;
}

/** Where each point sits in a chart `width` wide: time across, value up. */
function plot(points: SparkPoint[], width: number): Plot | undefined {
  const start = points[0]?.t;
  const end = points.at(-1)?.t;
  if (start === undefined || end === undefined || points.length < 2) {
    return undefined;
  }
  const values = points.map((point) => point.value);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const right = width - PAD_RIGHT;
  const bottom = SPARKLINE_HEIGHT - PAD_BOTTOM;
  const coords = points.map((point) => ({
    x: end > start ? ((point.t - start) / (end - start)) * right : right,
    // A flat line runs through the middle.
    y:
      high > low
        ? PAD_TOP + ((high - point.value) / (high - low)) * (bottom - PAD_TOP)
        : SPARKLINE_HEIGHT / 2,
  }));
  const line = coords
    .map(({ x, y }, index) => `${index === 0 ? "M" : "L"}${x},${y}`)
    .join("");
  return {
    area: `${line}L${right},${SPARKLINE_HEIGHT}L0,${SPARKLINE_HEIGHT}Z`,
    coords,
    line,
  };
}

/** The point closest across to `x`; the points run left to right. */
function nearest(coords: Coord[], x: number): number {
  const after = coords.findIndex((coord) => coord.x >= x);
  if (after === -1) {
    return coords.length - 1;
  }
  const before = coords[after - 1];
  const next = coords[after];
  return before && next && x - before.x < next.x - x ? after - 1 : after;
}

/** The element's width, kept current as it resizes. */
function useWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    const measure = () => setWidth(element.clientWidth);
    // Measured before the first paint, so the line never flashes in late.
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

/** A dot on the line, ringed in the card's color so it stands off the line. */
function Dot({
  at,
  live = false,
  className,
}: {
  at: Coord;
  /** Pulses, for the latest point while it's coming in live. */
  live?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "pointer-events-none absolute size-2 -translate-x-1/2 -translate-y-1/2",
        className
      )}
      style={{ left: at.x, top: at.y }}
    >
      {live && (
        // Without motion, a still halo says the same.
        <span className="bg-primary/50 absolute inset-0 rounded-full motion-safe:animate-ping motion-reduce:scale-200 motion-reduce:opacity-40" />
      )}
      <span className="bg-primary ring-card relative block size-2 rounded-full ring-2" />
    </span>
  );
}

interface SparklineProps {
  points: SparkPoint[];
  /** What the line is of, like "Bitcoin price". */
  label: string;
  /** How a point reads out, like "Oct 8, 2:05 PM: $97,412.18". */
  describe: (point: SparkPoint) => string;
  /** The point being looked at, by pointer or keys. */
  active?: number;
  onActiveChange: (index?: number) => void;
  /** The last point is coming in live. */
  live?: boolean;
  /** The line stands in for one still on its way, so it's dimmed. */
  stale?: boolean;
}

/**
 * A line of values over time, filling the width it's given. Pointing at it,
 * or moving along it with the arrow keys, picks out the closest point.
 */
export function Sparkline({
  points,
  label,
  describe,
  active,
  onActiveChange,
  live = false,
  stale = false,
}: SparklineProps) {
  const box = useRef<HTMLDivElement>(null);
  const width = useWidth(box);
  const id = useId();
  const washId = `${id}wash`;
  const clipId = `${id}clip`;
  const chart = plot(points, width);
  const last = points.length - 1;
  const current = active === undefined ? undefined : chart?.coords[active];
  const end = chart?.coords.at(-1);
  const shown = points[active ?? last];

  const pick = (event: PointerEvent<HTMLDivElement>) => {
    if (chart) {
      const { left } = event.currentTarget.getBoundingClientRect();
      onActiveChange(nearest(chart.coords, event.clientX - left));
    }
  };

  const step = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" && active !== undefined) {
      onActiveChange();
      return;
    }
    const from = active ?? last;
    const page = Math.max(1, Math.round(points.length * PAGE));
    const targets: Partial<Record<string, number>> = {
      ArrowDown: from - 1,
      ArrowLeft: from - 1,
      ArrowRight: from + 1,
      ArrowUp: from + 1,
      End: last,
      Home: 0,
      PageDown: from - page,
      PageUp: from + page,
    };
    const target = targets[event.key];
    if (target !== undefined) {
      event.preventDefault();
      onActiveChange(Math.min(Math.max(target, 0), last));
    }
  };

  return (
    <div
      aria-label={label}
      aria-valuemax={last}
      aria-valuemin={0}
      aria-valuenow={active ?? last}
      aria-valuetext={shown && describe(shown)}
      className="focus-visible:outline-ring/60 relative w-full touch-pan-y outline-none focus-visible:outline-2 focus-visible:-outline-offset-2"
      onBlur={() => onActiveChange()}
      onKeyDown={step}
      onPointerDown={pick}
      onPointerLeave={() => onActiveChange()}
      onPointerMove={pick}
      ref={box}
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a chart, stepped through point by point
      role="slider"
      style={{ height: SPARKLINE_HEIGHT }}
      tabIndex={0}
    >
      {chart && end && (
        <div
          aria-hidden
          className={cn(
            "absolute inset-0 transition-opacity duration-200 ease-out",
            stale && "opacity-40"
          )}
        >
          <svg
            className="absolute inset-0 overflow-visible"
            height={SPARKLINE_HEIGHT}
            width={width}
          >
            <defs>
              <linearGradient id={washId} x1="0" x2="0" y1="0" y2="1">
                <stop
                  offset="0"
                  style={{ stopColor: "var(--primary)", stopOpacity: 0.16 }}
                />
                <stop
                  offset="1"
                  style={{ stopColor: "var(--primary)", stopOpacity: 0 }}
                />
              </linearGradient>
              {current && (
                <clipPath id={clipId}>
                  <rect height={SPARKLINE_HEIGHT} width={current.x} />
                </clipPath>
              )}
            </defs>
            {/* Past the point being looked at, the line steps back. */}
            {current && (
              <path
                className="stroke-primary fill-none opacity-30"
                d={chart.line}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
              />
            )}
            <g clipPath={current && `url(#${clipId})`}>
              <path d={chart.area} fill={`url(#${washId})`} />
              <path
                className="stroke-primary fill-none"
                d={chart.line}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
              />
            </g>
            {current && (
              <line
                className="stroke-muted-foreground/40"
                strokeWidth={1}
                // On the half pixel, so the hairline stays crisp.
                x1={Math.round(current.x) + 0.5}
                x2={Math.round(current.x) + 0.5}
                y1={0}
                y2={SPARKLINE_HEIGHT}
              />
            )}
          </svg>
          <Dot
            at={end}
            className={cn(current && "opacity-30")}
            live={live && !current}
          />
          {current && <Dot at={current} />}
        </div>
      )}
    </div>
  );
}
