import { cn } from "cn";
import { format, parseISO } from "date-fns";
import type { CSSProperties } from "react";
import { useRef } from "react";

import type { HabitCounts } from "@/hooks/use-habits";
import { useWidth } from "@/hooks/use-width";
import type { Habit } from "@/lib/habits";
import { addDays, isDue, weekdayOf } from "@/lib/habits";
import { SWATCH_COLORS } from "@/lib/palette";

/** Between days, in pixels. */
const GAP = 3;
/** The column of weekday names, when labeled. */
const LABEL_WIDTH = 24;
/** Rows named in the weekday column: Monday, Wednesday and Friday. */
const NAMED_ROWS = new Map([
  [0, "Mon"],
  [2, "Wed"],
  [4, "Fri"],
]);
/** Weeks a month needs before the next one's name, so the two never overlap. */
const MONTH_ROOM = 3;

function monthOf(date: string): string {
  return date.slice(0, 7);
}

/** The Monday of the week the day is in. */
function mondayOf(date: string): string {
  return addDays(date, -((weekdayOf(date) + 6) % 7));
}

/** One day's square: how much of the goal was met, and whether it was due. */
function Day({
  habit,
  date,
  count,
  today,
  style,
}: {
  habit: Habit;
  date: string;
  count: number;
  today: string;
  style: CSSProperties;
}) {
  const share = Math.min(count, habit.goal) / habit.goal;
  let tone = "bg-foreground/[0.04]";
  if (date > today) {
    tone = "";
  } else if (share > 0) {
    tone = SWATCH_COLORS[habit.color];
  } else if (date >= habit.start && isDue(habit, date)) {
    tone = "bg-foreground/[0.09]";
  }
  return (
    <span
      className={cn(
        "aspect-square rounded-[22%] transition-[background-color,opacity] duration-200 ease-out",
        tone,
        date === today && "outline-foreground/35 outline-1 outline-offset-1"
      )}
      // A day partly done shows lighter, deepening as it nears the goal.
      style={
        share > 0 && share < 1
          ? { ...style, opacity: 0.3 + share * 0.45 }
          : style
      }
    />
  );
}

interface HeatmapProps {
  habit: Habit;
  counts: HabitCounts;
  today: string;
  /** The most weeks it shows; fewer when they won't fit at `minCell`. */
  maxWeeks?: number;
  /** The smallest a day's square gets, in pixels. */
  minCell?: number;
  /** Month names above, and weekday names beside. */
  labeled?: boolean;
  className?: string;
}

/**
 * The habit's days as weeks side by side, Monday on top, up to the week of
 * today. As many weeks as fit are shown, their squares stretched to fill.
 */
export function Heatmap({
  habit,
  counts,
  today,
  maxWeeks = 53,
  minCell = 10,
  labeled = false,
  className,
}: HeatmapProps) {
  const ref = useRef<HTMLDivElement>(null);
  const width = useWidth(ref) - (labeled ? LABEL_WIDTH + GAP : 0);
  const weeks = Math.max(
    1,
    Math.min(maxWeeks, Math.floor((width + GAP) / (minCell + GAP)))
  );
  const first = addDays(mondayOf(today), -7 * (weeks - 1));
  const columns = Array.from({ length: weeks }, (_, week) =>
    addDays(first, week * 7)
  );
  // Labels take the first row and column, the days start after them.
  const offset = labeled ? 2 : 1;
  // A picture of the days; the habit's check and calendar are how they're read and changed.
  return (
    <div
      aria-hidden
      className={cn("grid w-full", className)}
      ref={ref}
      style={{
        gap: GAP,
        gridTemplateColumns: `${labeled ? `${LABEL_WIDTH}px ` : ""}repeat(${weeks}, minmax(0, 1fr))`,
      }}
    >
      {labeled &&
        columns.map((monday, week) => {
          const month = monthOf(monday);
          const starts =
            week === 0 || monthOf(columns[week - 1] ?? "") !== month;
          // The first column's month is often cut short: named only with room to spare.
          const room = monthOf(columns[week + MONTH_ROOM - 1] ?? "") === month;
          return (
            starts &&
            (week > 0 || room) && (
              <span
                className="text-muted-foreground overflow-visible text-[10px] leading-4 whitespace-nowrap"
                key={monday}
                style={{ gridColumn: week + offset, gridRow: 1 }}
              >
                {format(parseISO(monday), "MMM")}
              </span>
            )
          );
        })}
      {labeled &&
        [...NAMED_ROWS].map(([row, name]) => (
          <span
            className="text-muted-foreground self-center text-[10px] leading-none"
            key={name}
            style={{ gridColumn: 1, gridRow: row + offset }}
          >
            {name}
          </span>
        ))}
      {columns.flatMap((monday, week) =>
        Array.from({ length: 7 }, (_, row) => {
          const date = addDays(monday, row);
          return (
            <Day
              count={counts.get(habit._id, date)}
              date={date}
              habit={habit}
              key={date}
              style={{ gridColumn: week + offset, gridRow: row + offset }}
              today={today}
            />
          );
        })
      )}
    </div>
  );
}
