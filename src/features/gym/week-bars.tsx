import { cn } from "cn";
import { format, parseISO } from "date-fns";

import { FluidTooltip } from "@/components/ui/fluid-tooltip";
import type { Color } from "@/lib/palette";
import { SWATCH_COLORS } from "@/lib/palette";

export interface WeekBar {
  /** The week's Monday, `YYYY-MM-DD`. */
  week: string;
  value: number;
  /** What its tooltip says, past the week itself. */
  detail: string;
}

const HEIGHT = 128;
/** Weeks named under the bars: one in this many, counting back from this week. */
const LABEL_EVERY = 3;

/**
 * Weeks side by side as bars, oldest first, each as tall as its value. A
 * bar's tooltip says what it holds; the axis stays out of the way.
 */
export function WeekBars({
  bars,
  color,
  label,
}: {
  bars: readonly WeekBar[];
  color: Color;
  /** What the bars are of, for screen readers. */
  label: string;
}) {
  const top = Math.max(...bars.map((bar) => bar.value), 0);
  return (
    <figure aria-label={label} className="flex flex-col gap-2">
      <ul
        className="flex items-end gap-1 sm:gap-1.5"
        style={{ height: HEIGHT }}
      >
        <FluidTooltip.Group>
          {bars.map((bar, index) => {
            const share = top > 0 ? bar.value / top : 0;
            const current = index === bars.length - 1;
            return (
              <FluidTooltip.Root key={bar.week}>
                <FluidTooltip.Trigger>
                  <li
                    aria-label={`${format(parseISO(bar.week), "MMM d")}: ${bar.detail}`}
                    className="group/bar flex h-full min-w-0 flex-1 items-end"
                  >
                    <span
                      className={cn(
                        "w-full rounded-t-md rounded-b-xs transition-[height,opacity] duration-500 ease-out group-hover/bar:opacity-80",
                        bar.value > 0
                          ? SWATCH_COLORS[color]
                          : "bg-foreground/6",
                        current && bar.value > 0 && "opacity-70"
                      )}
                      style={{
                        height:
                          bar.value > 0 ? `${Math.max(4, share * 100)}%` : 4,
                      }}
                    />
                  </li>
                </FluidTooltip.Trigger>
                <FluidTooltip.Content>
                  <span className="text-muted-foreground">
                    {current
                      ? "This week"
                      : `Week of ${format(parseISO(bar.week), "MMM d")}`}
                  </span>{" "}
                  <span className="tabular-nums">{bar.detail}</span>
                </FluidTooltip.Content>
              </FluidTooltip.Root>
            );
          })}
        </FluidTooltip.Group>
      </ul>
      <div aria-hidden className="flex gap-1 sm:gap-1.5">
        {bars.map((bar, index) => (
          <span
            className="text-muted-foreground min-w-0 flex-1 overflow-visible text-center text-[10px] whitespace-nowrap"
            key={bar.week}
          >
            {(bars.length - 1 - index) % LABEL_EVERY === 0
              ? format(parseISO(bar.week), "MMM d")
              : ""}
          </span>
        ))}
      </div>
    </figure>
  );
}
