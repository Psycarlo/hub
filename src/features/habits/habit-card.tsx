import { cn } from "cn";
import { CalendarCheckIcon, FlameIcon, PlusIcon } from "lucide-react";
import { Link } from "wouter";

import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CheckButton } from "@/features/habits/check-button";
import { HabitBadge } from "@/features/habits/habit-icon";
import { habitPath } from "@/features/habits/habits-context";
import { Heatmap } from "@/features/habits/heatmap";
import type { HabitCounts } from "@/hooks/use-habits";
import { useHabitCounts, useStreaks } from "@/hooks/use-habits";
import { useToday } from "@/hooks/use-today";
import { logHabit } from "@/lib/habit-actions";
import type { Habit } from "@/lib/habits";
import { addDays, describeHabit } from "@/lib/habits";
import type { Color } from "@/lib/palette";
import { CHIP_COLORS } from "@/lib/palette";
import type { Project } from "@/lib/project";
import { canEdit } from "@/lib/project";
import { plural } from "@/lib/utils";

/** The most weeks a card shows; fewer where it's narrow. */
const CARD_WEEKS = 26;

/** Like a board's card, but opened by a link stretched over it, so the check stays its own button. */
const SURFACE =
  "bg-card shadow-surface hover:shadow-raised has-[a:focus-visible]:ring-ring/50 relative flex min-h-36 flex-col gap-3 rounded-2xl p-5 transition-[box-shadow,scale] duration-150 ease-out has-[a:active]:scale-[0.99] has-[a:focus-visible]:ring-3";

/** Days in a row the habit was done, in its color once there's a run going. */
export function StreakChip({
  days,
  color,
}: {
  /** Undefined while it loads. */
  days?: number;
  color: Color;
}) {
  if (days === undefined) {
    return <Skeleton className="h-6 w-11 rounded-full" />;
  }
  const label = plural(days, "day");
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            className={cn(
              "inline-flex h-6 shrink-0 items-center gap-1 rounded-full pr-2 pl-1.5 text-xs font-medium tabular-nums transition-colors duration-150 ease-out",
              days > 0
                ? CHIP_COLORS[color]
                : "bg-foreground/[0.06] text-muted-foreground"
            )}
          />
        }
      >
        <FlameIcon aria-hidden className="size-3.5" />
        {days}
        <span className="sr-only"> {label} in a row</span>
      </TooltipTrigger>
      <TooltipContent>Streak · {label}</TooltipContent>
    </Tooltip>
  );
}

function HabitCard({
  project,
  habit,
  counts,
  streak,
  today,
}: {
  project: Project;
  habit: Habit;
  counts: HabitCounts;
  streak?: number;
  today: string;
}) {
  return (
    <div className={SURFACE}>
      <div className="flex items-start gap-3">
        <HabitBadge habit={habit} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h3 className="truncate leading-snug font-medium">
            <Link
              className="outline-none after:absolute after:inset-0 after:rounded-2xl"
              href={habitPath(project, habit)}
            >
              {habit.title}
            </Link>
          </h3>
          {habit.description && (
            <p className="text-muted-foreground truncate text-sm">
              {habit.description}
            </p>
          )}
        </div>
        <CheckButton
          className="z-10 -mt-0.5 -mr-0.5"
          count={counts.get(habit._id, today)}
          habit={habit}
          onCount={
            canEdit(project)
              ? (count) => logHabit(habit, today, count)
              : undefined
          }
        />
      </div>
      <Heatmap
        className="mt-auto pt-1"
        counts={counts}
        habit={habit}
        maxWeeks={CARD_WEEKS}
        today={today}
      />
      <div className="flex items-center gap-2">
        <StreakChip color={habit.color} days={streak} />
        <span className="text-muted-foreground min-w-0 truncate text-xs">
          {describeHabit(habit)}
        </span>
      </div>
    </div>
  );
}

/** The project's habits as cards: each one's recent weeks, and a check for today. */
export function HabitGrid({
  project,
  habits,
}: {
  project: Project;
  habits: Habit[];
}) {
  const today = useToday();
  // Back to the Monday of the card's first week, whatever weekday today is.
  const counts = useHabitCounts(project, addDays(today, -7 * CARD_WEEKS));
  const streaks = useStreaks(project, today);
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {habits.map((habit) => (
        <HabitCard
          counts={counts}
          habit={habit}
          key={habit._id}
          project={project}
          streak={streaks?.get(habit._id)}
          today={today}
        />
      ))}
    </div>
  );
}

/** Where habits would be: a way to start one, for whoever can. */
export function NoHabits({
  editable,
  onNew,
}: {
  editable: boolean;
  onNew: () => void;
}) {
  return (
    <Empty>
      <CalendarCheckIcon
        aria-hidden
        className="text-muted-foreground size-8"
        strokeWidth={1.5}
      />
      <EmptyTitle>No habits yet</EmptyTitle>
      <EmptyDescription>
        {editable
          ? "Pick something to do every day, or on the days you choose, and keep the streak going."
          : "Habits in this project show up here."}
      </EmptyDescription>
      {editable && (
        <Button onClick={onNew}>
          <PlusIcon />
          New habit
        </Button>
      )}
    </Empty>
  );
}
