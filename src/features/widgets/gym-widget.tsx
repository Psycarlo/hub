import "@kitlangton/rolling-number/styles.css";
import { RollingNumber } from "@kitlangton/rolling-number/react";
import { cn } from "cn";
import { format, parseISO } from "date-fns";
import {
  ChevronRightIcon,
  DumbbellIcon,
  FlameIcon,
  PlayIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "wouter";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  gymPath,
  useStartWorkout,
  workoutPath,
} from "@/features/gym/gym-context";
import { LiveDot } from "@/features/gym/gym-parts";
import { gridStart } from "@/features/habits/heatmap";
import type { WidgetKind } from "@/features/widgets/widget-kind";
import { WidgetBleed } from "@/features/widgets/widget-parts";
import {
  useActiveWorkout,
  useOwnGym,
  useSecond,
  useWorkouts,
} from "@/hooks/use-gym";
import { useToday } from "@/hooks/use-today";
import type { Workout } from "@/lib/gym";
import {
  GYM_COLOR,
  addDays,
  formatClock,
  formatDuration,
  formatVolume,
  weekOf,
  weekStreak,
  workoutSeconds,
} from "@/lib/gym";
import { dayLabel } from "@/lib/log";
import { CHIP_COLORS, SWATCH_COLORS } from "@/lib/palette";
import type { Project } from "@/lib/project";
import { canEdit } from "@/lib/project";
import { plural } from "@/lib/utils";
import type { SettingsOf } from "@/lib/widgets";
import { GYM_DEFAULTS } from "@/lib/widgets";

type Settings = SettingsOf<"gym">;

const ROW_HEIGHT = 48;
const DAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"];

function Note({ children }: { children: ReactNode }) {
  return (
    <p className="text-muted-foreground flex h-full items-center justify-center px-4 text-center text-xs">
      {children}
    </p>
  );
}

/** A gym widget's body before the gym is set up: a way there. */
export function GymSetupNote({
  personal,
  height,
}: {
  personal: Project;
  height: number;
}) {
  return (
    <WidgetBleed className="border-t">
      <div style={{ height }}>
        <Note>
          <Link
            className="hover:text-foreground underline-offset-4 transition-colors duration-150 hover:underline"
            draggable={false}
            href={gymPath(personal)}
          >
            Set up your gym in {personal.title}
          </Link>
        </Note>
      </div>
    </WidgetBleed>
  );
}

/** This week a day at a time, filled where there was a workout. */
function WeekStrip({
  workouts,
  today,
}: {
  workouts: readonly Workout[];
  today: string;
}) {
  const monday = weekOf(today);
  const trained = new Set(workouts.map((workout) => workout.date));
  return (
    <ol aria-label="This week" className="grid grid-cols-7 gap-1.5">
      {DAY_LETTERS.map((letter, index) => {
        const date = addDays(monday, index);
        const done = trained.has(date);
        return (
          <li
            aria-label={`${format(parseISO(date), "EEEE")}: ${done ? "trained" : "rest"}`}
            className="flex flex-col items-center gap-1"
            key={date}
          >
            <span
              className={cn(
                "flex aspect-square w-full max-w-7 items-center justify-center rounded-full transition-colors duration-200 ease-out",
                done ? SWATCH_COLORS[GYM_COLOR] : "bg-foreground/6",
                date === today &&
                  "outline-foreground/35 outline-1 outline-offset-1"
              )}
            >
              {done && (
                <DumbbellIcon aria-hidden className="size-3 text-white" />
              )}
            </span>
            <span
              className={cn(
                "text-[10px]",
                date === today
                  ? "text-foreground font-medium"
                  : "text-muted-foreground"
              )}
            >
              {letter}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** The workout under way, its time ticking, to go back to. */
function UnderWay({
  personal,
  workout,
}: {
  personal: Project;
  workout: Workout;
}) {
  const now = useSecond();
  return (
    <>
      <div className="flex flex-col gap-2">
        <span className="text-3xl font-semibold tracking-tight tabular-nums">
          {formatClock(workoutSeconds(workout, now))}
        </span>
        <span className="flex h-6 min-w-0 items-center gap-2 text-xs">
          <span className="flex shrink-0 items-center gap-1.5 font-medium text-orange-700 dark:text-orange-300">
            <LiveDot className="size-1.5" />
            Under way
          </span>
          <span className="text-muted-foreground truncate">
            {workout.title}
          </span>
        </span>
      </div>
      <WidgetBleed className="border-t">
        <Link
          className="hover:bg-foreground/5 focus-visible:bg-foreground/5 flex items-center gap-3 px-5 text-sm font-medium outline-none"
          draggable={false}
          href={workoutPath(personal, workout)}
          style={{ height: ROW_HEIGHT }}
        >
          <span className="min-w-0 flex-1 truncate">
            {plural(workout.summary.sets, "set")} done ·{" "}
            {plural(workout.summary.exercises.length, "exercise")}
          </span>
          <span className="text-primary shrink-0">Resume</span>
          <ChevronRightIcon
            aria-hidden
            className="text-muted-foreground size-4"
          />
        </Link>
      </WidgetBleed>
    </>
  );
}

/** Starts an empty workout and opens it. */
function StartButton({ project }: { project: Project }) {
  const start = useStartWorkout(project);
  return (
    <Button onClick={() => start()} size="sm">
      <PlayIcon />
      Start
    </Button>
  );
}

function GymBody() {
  const today = useToday();
  const { personal, gym, loaded } = useOwnGym();
  const project = gym ? personal : undefined;
  const active = useActiveWorkout(project);
  const { workouts, loaded: workoutsLoaded } = useWorkouts(
    project,
    gridStart(today, 53)
  );

  if (loaded && personal && !gym) {
    return <GymSetupNote height={160} personal={personal} />;
  }
  if (!(personal && gym && workoutsLoaded && active !== undefined)) {
    return (
      <div aria-busy className="flex flex-col gap-3">
        <Skeleton className="h-9 w-20 rounded-lg" />
        <Skeleton className="h-6 w-32 rounded-full" />
        <Skeleton className="h-10 rounded-xl" />
      </div>
    );
  }
  if (active) {
    return <UnderWay personal={personal} workout={active} />;
  }

  const week = weekOf(today);
  const thisWeek = workouts.filter((workout) => weekOf(workout.date) === week);
  const streak = weekStreak(workouts, today);
  const last = workouts.find((workout) => workout.endedAt !== undefined);

  return (
    <>
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline gap-1.5 text-3xl font-semibold tracking-tight tabular-nums">
          <RollingNumber duration={600} value={thisWeek.length} />
          <span className="text-muted-foreground text-sm font-medium tracking-normal">
            {thisWeek.length === 1 ? "workout" : "workouts"} this week
          </span>
        </div>
        <div className="flex h-6 items-center gap-2">
          <span
            className={cn(
              "inline-flex h-6 shrink-0 items-center gap-1 rounded-full pr-2 pl-1.5 text-xs font-medium tabular-nums",
              streak > 0
                ? CHIP_COLORS[GYM_COLOR]
                : "bg-foreground/6 text-muted-foreground"
            )}
          >
            <FlameIcon aria-hidden className="size-3.5" />
            {streak > 0 ? plural(streak, "week") : "No streak yet"}
          </span>
        </div>
      </div>
      <WeekStrip today={today} workouts={thisWeek} />
      <WidgetBleed className="border-t">
        <div
          className="flex items-center gap-3 px-5"
          style={{ height: ROW_HEIGHT }}
        >
          {last ? (
            <Link
              className="hover:text-foreground flex min-w-0 flex-1 flex-col transition-colors duration-150"
              draggable={false}
              href={workoutPath(personal, last)}
            >
              <span className="truncate text-sm font-medium">{last.title}</span>
              <span className="text-muted-foreground truncate text-xs tabular-nums">
                {dayLabel(last.date, today)} ·{" "}
                {formatDuration(workoutSeconds(last, 0))} ·{" "}
                {formatVolume(last.summary.volume, gym.units)}
              </span>
            </Link>
          ) : (
            <span className="text-muted-foreground min-w-0 flex-1 truncate text-xs">
              Your first workout starts here.
            </span>
          )}
          {canEdit(personal) && <StartButton project={personal} />}
        </div>
      </WidgetBleed>
    </>
  );
}

function GymSettings() {
  const { personal } = useOwnGym();
  return (
    <p className="text-muted-foreground text-xs">
      Shows your week, or the workout under way. Routines, records and history
      are in{" "}
      {personal ? (
        <Link
          className="text-foreground underline-offset-4 hover:underline"
          href={gymPath(personal)}
        >
          your gym
        </Link>
      ) : (
        "your gym"
      )}
      .
    </p>
  );
}

/** The gym's week from the home, with the workout under way front and center. */
export const GYM: WidgetKind<Settings> = {
  Body: GymBody,
  Settings: GymSettings,
  color: GYM_COLOR,
  defaults: GYM_DEFAULTS,
  description: "Your week at the gym, and the workout under way",
  icon: DumbbellIcon,
  name: "Gym",
};
