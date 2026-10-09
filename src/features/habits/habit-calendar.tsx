import { cn } from "cn";
import {
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  parseISO,
  startOfWeek,
} from "date-fns";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  MinusIcon,
  PlusIcon,
} from "lucide-react";

import { IconButton } from "@/components/icon-button";
import { Button } from "@/components/ui/button";
import { FluidTooltip } from "@/components/ui/fluid-tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { HabitCounts } from "@/hooks/use-habits";
import { monthOf, monthStart, shiftMonth } from "@/lib/finance";
import type { Habit } from "@/lib/habits";
import { isDone, isDue } from "@/lib/habits";
import { CHIP_COLORS, SWATCH_COLORS } from "@/lib/palette";

const WEEK = { weekStartsOn: 1 } as const;

interface DayProps {
  habit: Habit;
  date: string;
  count: number;
  today: string;
  /** Sets the day's count; read-only without it. */
  onCount?: (count: number) => void;
}

/** How a day looks: done in the habit's color, part done with a bar, muted when it isn't due. */
function dayClass({ habit, date, count, today }: DayProps): string {
  let tone = "enabled:hover:bg-foreground/5";
  if (isDone(count, habit.goal)) {
    tone = cn(CHIP_COLORS[habit.color], "font-medium");
  } else if (date > today || date < habit.start) {
    tone = "text-muted-foreground/40";
  } else if (!isDue(habit, date)) {
    tone = "enabled:hover:bg-foreground/5 text-muted-foreground";
  }
  return cn(
    "focus-visible:ring-ring/50 relative flex h-11 w-full items-center justify-center rounded-xl text-sm tabular-nums transition-[background-color,color,scale] duration-150 ease-out outline-none focus-visible:ring-3 enabled:active:scale-[0.96] disabled:cursor-default sm:h-12",
    tone,
    date === today && "ring-foreground/20 font-semibold ring-1 ring-inset"
  );
}

/** A day part way to the goal, as a short bar under its number. */
function Progress({ habit, count }: Pick<DayProps, "habit" | "count">) {
  if (count === 0 || isDone(count, habit.goal)) {
    return null;
  }
  return (
    <span
      aria-hidden
      className="bg-foreground/10 absolute bottom-1.5 h-1 w-5 overflow-hidden rounded-full"
    >
      <span
        className={cn(
          "block h-full rounded-full transition-[width] duration-200 ease-out",
          SWATCH_COLORS[habit.color]
        )}
        style={{ width: `${(count / habit.goal) * 100}%` }}
      />
    </span>
  );
}

/** A day of a habit done more than once a day: its count, stepped up or down. */
function CountedDay(props: DayProps & { label: string }) {
  const { habit, date, count, onCount, label } = props;
  const clamped = Math.min(count, habit.goal);
  return (
    <Popover>
      <PopoverTrigger
        aria-label={`${label}, ${clamped} of ${habit.goal}`}
        className={dayClass(props)}
      >
        {Number(date.slice(8))}
        <Progress count={count} habit={habit} />
      </PopoverTrigger>
      <PopoverContent className="flex w-56 flex-col gap-2">
        <h3 className="text-sm font-medium">{label}</h3>
        <div className="flex items-center justify-between">
          <Button
            aria-label="One less"
            disabled={count === 0}
            onClick={() => onCount?.(clamped - 1)}
            size="icon-sm"
            variant="ghost"
          >
            <MinusIcon />
          </Button>
          <output className="text-lg font-semibold tabular-nums">
            {clamped}
            <span className="text-muted-foreground text-sm font-normal">
              {" "}
              / {habit.goal}
            </span>
          </output>
          <Button
            aria-label="One more"
            disabled={clamped >= habit.goal}
            onClick={() => onCount?.(clamped + 1)}
            size="icon-sm"
            variant="ghost"
          >
            <PlusIcon />
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function Day(props: DayProps) {
  const { habit, date, count, today, onCount } = props;
  const label = format(parseISO(date), "EEEE, MMMM d");
  const open = date <= today && date >= habit.start && onCount;
  if (open && habit.goal > 1) {
    return <CountedDay {...props} label={label} />;
  }
  const done = isDone(count, habit.goal);
  return (
    <button
      aria-label={label}
      aria-pressed={open ? done : undefined}
      className={dayClass(props)}
      disabled={!open}
      onClick={() => onCount?.(done ? 0 : 1)}
      type="button"
    >
      {Number(date.slice(8))}
      <Progress count={count} habit={habit} />
    </button>
  );
}

interface HabitCalendarProps {
  habit: Habit;
  counts: HabitCounts;
  today: string;
  month: string;
  onMonthChange: (month: string) => void;
  /** Sets a day's count; read-only without it. */
  onCount?: (date: string, count: number) => void;
}

/** The habit's month, Monday first: tap a day to mark it done, or step its count. */
export function HabitCalendar({
  habit,
  counts,
  today,
  month,
  onMonthChange,
  onCount,
}: HabitCalendarProps) {
  const current = monthOf(today);
  const start = monthStart(month);
  const days = eachDayOfInterval({
    end: endOfWeek(endOfMonth(start), WEEK),
    start: startOfWeek(start, WEEK),
  }).map((day) => format(day, "yyyy-MM-dd"));
  return (
    <section
      aria-label="Month"
      className="bg-card shadow-surface flex flex-col gap-4 rounded-2xl p-4 sm:p-5"
    >
      <div className="flex items-center gap-2 pl-1">
        <h2 className="min-w-0 flex-1 truncate text-lg font-semibold tracking-tight">
          {format(start, "MMMM")}{" "}
          <span className="text-muted-foreground font-normal">
            {start.getFullYear()}
          </span>
        </h2>
        {month !== current && (
          <Button
            onClick={() => onMonthChange(current)}
            size="sm"
            variant="ghost"
          >
            This month
          </Button>
        )}
        <FluidTooltip.Group>
          <div className="flex items-center">
            <IconButton
              label="Previous month"
              onClick={() => onMonthChange(shiftMonth(month, -1))}
            >
              <ChevronLeftIcon />
            </IconButton>
            <IconButton
              label="Next month"
              onClick={() => onMonthChange(shiftMonth(month, 1))}
            >
              <ChevronRightIcon />
            </IconButton>
          </div>
        </FluidTooltip.Group>
      </div>
      <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
        {days.slice(0, 7).map((day) => (
          <span
            aria-hidden
            className="text-muted-foreground text-center text-xs font-medium"
            key={day}
          >
            {format(parseISO(day), "EEE")}
          </span>
        ))}
        {days.map((day) =>
          monthOf(day) === month ? (
            <Day
              count={counts.get(habit._id, day)}
              date={day}
              habit={habit}
              key={day}
              onCount={onCount && ((count) => onCount(day, count))}
              today={today}
            />
          ) : (
            <span aria-hidden key={day} />
          )
        )}
      </div>
    </section>
  );
}
