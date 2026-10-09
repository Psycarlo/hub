import "@kitlangton/rolling-number/styles.css";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { RollingNumber } from "@kitlangton/rolling-number/react";
import { cn } from "cn";
import { useQuery } from "convex/react";
import {
  CalendarCheckIcon,
  CircleCheckIcon,
  CircleDashedIcon,
  FlameIcon,
  MoonIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { useId } from "react";
import { Link } from "wouter";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckButton } from "@/features/habits/check-button";
import { HabitBadge } from "@/features/habits/habit-icon";
import { habitPath, habitsPath } from "@/features/habits/habits-context";
import { Heatmap } from "@/features/habits/heatmap";
import type { WidgetKind } from "@/features/widgets/widget-kind";
import { WidgetBleed } from "@/features/widgets/widget-parts";
import { useHabitCounts, useStreaks } from "@/hooks/use-habits";
import { useToday } from "@/hooks/use-today";
import { useMe } from "@/hooks/use-users";
import { logHabit } from "@/lib/habit-actions";
import type { Habit } from "@/lib/habits";
import { addDays, isDone, isDue } from "@/lib/habits";
import { CHIP_COLORS } from "@/lib/palette";
import type { Project } from "@/lib/project";
import { canEdit, splitPersonal } from "@/lib/project";
import type { SettingsOf } from "@/lib/widgets";
import { HABITS_DEFAULTS } from "@/lib/widgets";

type Settings = SettingsOf<"habits">;

/** Habits the list shows at once; more scroll. */
const SHOWN = 3;
const ROW_HEIGHT = 32;
/** The most weeks one habit's grid shows. */
const WEEKS = 26;
const ALL = "all";

const NO_HABITS: Habit[] = [];

/** The person's own project and its habits, as they load. */
function useOwnHabits(): { personal?: Project; habits?: Habit[] } {
  const me = useMe();
  const projects = useQuery(api.projects.list);
  const all = useQuery(api.habits.list);
  const personal = projects && splitPersonal(projects, me._id).personal;
  return {
    habits:
      all &&
      (personal
        ? all.filter((habit) => habit.projectId === personal._id)
        : NO_HABITS),
    personal,
  };
}

function Chip({
  color,
  icon: Icon,
  children,
}: {
  color: string;
  icon: typeof CircleCheckIcon;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1 rounded-full pr-2 pl-1.5 text-xs font-medium tabular-nums transition-colors duration-150 ease-out",
        color
      )}
    >
      <Icon aria-hidden className="size-3.5" />
      {children}
    </span>
  );
}

/** How today stands across the habits due, the news that matters first. */
function TodayChip({ due, done }: { due: number; done: number }) {
  if (due === 0) {
    return (
      <Chip color={CHIP_COLORS.gray} icon={MoonIcon}>
        Rest day
      </Chip>
    );
  }
  if (done >= due) {
    return (
      <Chip color={CHIP_COLORS.green} icon={CircleCheckIcon}>
        All done
      </Chip>
    );
  }
  return (
    <Chip color={CHIP_COLORS.orange} icon={CircleDashedIcon}>
      {due - done} to go
    </Chip>
  );
}

/** One habit with today's check, opening its page. */
function HabitRow({
  project,
  habit,
  count,
  streak,
  today,
}: {
  project: Project;
  habit: Habit;
  count: number;
  streak?: number;
  today: string;
}) {
  const due = isDue(habit, today);
  return (
    <li className="flex items-center gap-3 pr-3" style={{ height: ROW_HEIGHT }}>
      <Link
        className="hover:bg-foreground/5 focus-visible:bg-foreground/5 focus-visible:ring-ring/50 flex h-full min-w-0 flex-1 items-center gap-3 rounded-xl pr-2 pl-3 text-sm transition-colors duration-150 ease-out outline-none focus-visible:ring-2 focus-visible:ring-inset"
        draggable={false}
        href={habitPath(project, habit)}
      >
        <HabitBadge habit={habit} size="sm" />
        <span
          className={cn(
            "min-w-0 flex-1 truncate",
            !due && "text-muted-foreground"
          )}
        >
          {habit.title}
        </span>
        {streak !== undefined && streak > 0 && (
          <span className="text-muted-foreground flex shrink-0 items-center gap-0.5 text-xs tabular-nums">
            <FlameIcon aria-hidden className="size-3" />
            {streak}
            <span className="sr-only">
              {" "}
              {streak === 1 ? "day" : "days"} in a row
            </span>
          </span>
        )}
      </Link>
      <CheckButton
        count={count}
        habit={habit}
        onCount={
          canEdit(project) ? (next) => logHabit(habit, today, next) : undefined
        }
        size="sm"
      />
    </li>
  );
}

function RowSkeleton() {
  return (
    <div
      className="flex items-center gap-3 px-4"
      style={{ height: ROW_HEIGHT }}
    >
      <Skeleton className="size-6 rounded-md" />
      <Skeleton className="h-3 flex-1 rounded-full" />
      <Skeleton className="size-7 rounded-lg" />
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="text-muted-foreground flex h-full items-center justify-center px-4 text-center text-xs">
      {children}
    </p>
  );
}

/** Every habit, due ones first, each with today's check. */
function AllHabits({
  personal,
  habits,
  today,
}: {
  personal?: Project;
  habits?: Habit[];
  today: string;
}) {
  const counts = useHabitCounts(personal, today);
  const streaks = useStreaks(personal, today);
  const ready = personal && habits && counts.loaded;
  // Due today first; otherwise in the order they were made, so rows stay put as they're checked.
  const ordered = habits?.toSorted(
    (a, b) => Number(isDue(b, today)) - Number(isDue(a, today))
  );
  const due = ordered?.filter((habit) => isDue(habit, today)) ?? [];
  const done = due.filter((habit) =>
    isDone(counts.get(habit._id, today), habit.goal)
  ).length;

  let list: ReactNode = (
    <div aria-busy>
      {Array.from({ length: SHOWN }, (_, index) => (
        <RowSkeleton key={index} />
      ))}
    </div>
  );
  if (ready && ordered?.length === 0) {
    list = (
      <Empty>
        <Link
          className="hover:text-foreground underline-offset-4 transition-colors duration-150 hover:underline"
          draggable={false}
          href={habitsPath(personal)}
        >
          Start a habit in {personal.title}
        </Link>
      </Empty>
    );
  } else if (ready && ordered) {
    list = (
      <ul className="h-full overflow-y-auto">
        {ordered.map((habit) => (
          <HabitRow
            count={counts.get(habit._id, today)}
            habit={habit}
            key={habit._id}
            project={personal}
            streak={streaks?.get(habit._id)}
            today={today}
          />
        ))}
      </ul>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-2">
        <div className="text-3xl font-semibold tracking-tight tabular-nums">
          {ready ? (
            <>
              <RollingNumber duration={600} value={done} />
              <span className="text-muted-foreground font-medium">
                /{due.length}
              </span>
              <span className="sr-only"> done today</span>
            </>
          ) : (
            <Skeleton className="h-9 w-14 rounded-lg" />
          )}
        </div>
        <div className="flex h-6 items-center gap-2">
          {ready ? (
            <TodayChip done={done} due={due.length} />
          ) : (
            <Skeleton className="h-6 w-20 rounded-full" />
          )}
          <span className="text-muted-foreground min-w-0 truncate text-xs">
            Today
          </span>
        </div>
      </div>
      <WidgetBleed className="border-t p-1">
        <div style={{ height: SHOWN * ROW_HEIGHT }}>{list}</div>
      </WidgetBleed>
    </>
  );
}

/** How the habit stands today: done, part way, still to do, or not due. */
function DayChip({
  habit,
  count,
  today,
}: {
  habit: Habit;
  count: number;
  today: string;
}) {
  if (isDone(count, habit.goal)) {
    return (
      <Chip color={CHIP_COLORS.green} icon={CircleCheckIcon}>
        Done today
      </Chip>
    );
  }
  if (count > 0) {
    return (
      <Chip color={CHIP_COLORS.orange} icon={CircleDashedIcon}>
        {count} of {habit.goal}
      </Chip>
    );
  }
  if (!isDue(habit, today)) {
    return (
      <Chip color={CHIP_COLORS.gray} icon={MoonIcon}>
        Rest day
      </Chip>
    );
  }
  return (
    <Chip color={CHIP_COLORS.orange} icon={CircleDashedIcon}>
      To do
    </Chip>
  );
}

/** One habit: its streak, today's check, and its recent weeks. */
function OneHabit({
  personal,
  habit,
  today,
}: {
  personal: Project;
  habit: Habit;
  today: string;
}) {
  const counts = useHabitCounts(personal, addDays(today, -7 * WEEKS), habit);
  const streak = useStreaks(personal, today)?.get(habit._id);
  const count = counts.get(habit._id, today);
  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex items-baseline gap-1.5 text-3xl font-semibold tracking-tight tabular-nums">
            {streak === undefined ? (
              <Skeleton className="h-9 w-14 rounded-lg" />
            ) : (
              <>
                <RollingNumber duration={600} value={streak} />
                <span className="text-muted-foreground text-sm font-medium tracking-normal">
                  {streak === 1 ? "day" : "days"}
                </span>
              </>
            )}
          </div>
          <div className="flex h-6 min-w-0 items-center gap-2">
            {counts.loaded ? (
              <DayChip count={count} habit={habit} today={today} />
            ) : (
              <Skeleton className="h-6 w-20 rounded-full" />
            )}
            <Link
              className="text-muted-foreground hover:text-foreground min-w-0 truncate text-xs transition-colors duration-150"
              draggable={false}
              href={habitPath(personal, habit)}
            >
              {habit.title}
            </Link>
          </div>
        </div>
        <CheckButton
          count={count}
          habit={habit}
          onCount={
            canEdit(personal) && counts.loaded
              ? (next) => logHabit(habit, today, next)
              : undefined
          }
          size="lg"
        />
      </div>
      <WidgetBleed className="border-t px-5 py-4">
        <Heatmap
          counts={counts}
          habit={habit}
          maxWeeks={WEEKS}
          minCell={8}
          today={today}
        />
      </WidgetBleed>
    </>
  );
}

function HabitsBody({ settings }: { settings: Settings }) {
  const today = useToday();
  const { personal, habits } = useOwnHabits();
  if (settings.habitId) {
    const habit = habits?.find((item) => item._id === settings.habitId);
    if (personal && habit) {
      return <OneHabit habit={habit} personal={personal} today={today} />;
    }
    if (habits) {
      return (
        <div className="flex min-h-40 flex-1 items-center">
          <Empty>This habit is gone. Pick another in the settings.</Empty>
        </div>
      );
    }
  }
  return <AllHabits habits={habits} personal={personal} today={today} />;
}

function HabitsSettings({
  settings,
  onChange,
}: {
  settings: Settings;
  onChange: (settings: Settings) => void;
}) {
  const id = useId();
  const { habits = NO_HABITS } = useOwnHabits();
  const options = [
    { label: "Every habit", value: ALL },
    ...habits.map((habit) => ({ label: habit.title, value: habit._id })),
  ];
  return (
    <div className="flex flex-col gap-2">
      <span className="text-muted-foreground text-xs font-medium" id={id}>
        Habit
      </span>
      <Select
        items={options}
        onValueChange={(next: string | null) => {
          if (next === ALL) {
            onChange({ type: "habits" });
          } else if (next) {
            onChange({ habitId: next as Id<"habits">, type: "habits" });
          }
        }}
        value={settings.habitId ?? ALL}
      >
        <SelectTrigger aria-labelledby={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** The person's habits for today, checked off right from the home. */
export const HABITS: WidgetKind<Settings> = {
  Body: HabitsBody,
  Settings: HabitsSettings,
  color: "orange",
  defaults: HABITS_DEFAULTS,
  description: "Check off today’s habits",
  icon: CalendarCheckIcon,
  name: "Habits",
};
