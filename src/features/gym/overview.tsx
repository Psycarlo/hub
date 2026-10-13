import { cn } from "cn";
import { format, parseISO } from "date-fns";
import { FlameIcon, TrophyIcon } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { useState } from "react";
import { Link } from "wouter";

import { buttonVariants } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { gymPath } from "@/features/gym/gym-context";
import { PANEL, Panel, Stat } from "@/features/gym/gym-parts";
import { StartSection } from "@/features/gym/routine-cards";
import { UnderWay } from "@/features/gym/under-way";
import { WeekBars } from "@/features/gym/week-bars";
import { DAY_SQUARE, DayGrid, TODAY_RING } from "@/features/habits/heatmap";
import { Sparkline } from "@/features/widgets/sparkline";
import { useSecond } from "@/hooks/use-gym";
import type {
  BodyWeight,
  Exercise,
  Gym,
  GymRecord,
  Muscle,
  Routine,
  Workout,
} from "@/lib/gym";
import {
  BODY_COLOR,
  GYM_COLOR,
  MUSCLE_INFO,
  RECORD_LABELS,
  addDays,
  formatChange,
  formatDuration,
  formatLoad,
  formatRecord,
  formatVolume,
  toLoad,
  weekOf,
  weekStreak,
  weightChange,
  weightUnit,
  workoutSeconds,
} from "@/lib/gym";
import { dayLabel } from "@/lib/log";
import { CHIP_COLORS, HEX_COLORS, SWATCH_COLORS } from "@/lib/palette";
import type { Project } from "@/lib/project";
import { canEdit } from "@/lib/project";
import { plural } from "@/lib/utils";

/** Weeks of volume the bars show. */
const WEEKS = 12;
/** Records listed, newest first. */
const RECORDS_SHOWN = 5;
/** Muscles listed, most worked first. */
const MUSCLES_SHOWN = 8;
/** Sets a day takes to show at its deepest. */
const FULL_DAY = 25;

/** Workouts that started in the week of `week`, its Monday. */
function ofWeek(workouts: readonly Workout[], week: string): Workout[] {
  return workouts.filter((workout) => weekOf(workout.date) === week);
}

/** Sets each muscle got: a set counts whole where it trains most, half along the way. */
function muscleSets(
  workouts: readonly Workout[],
  exercises: ReadonlyMap<string, Exercise>
): [Muscle, number][] {
  const sets = new Map<Muscle, number>();
  for (const workout of workouts) {
    for (const { exerciseId, sets: count } of workout.summary.exercises) {
      const exercise = exercises.get(exerciseId);
      for (const muscle of exercise?.muscles ?? []) {
        sets.set(muscle, (sets.get(muscle) ?? 0) + count);
      }
      for (const muscle of exercise?.secondary ?? []) {
        sets.set(muscle, (sets.get(muscle) ?? 0) + count / 2);
      }
    }
  }
  return [...sets]
    .filter(([, count]) => count > 0)
    .toSorted((a, b) => b[1] - a[1]);
}

function LastWeek({ children }: { children: ReactNode }) {
  return <span className="text-muted-foreground">{children} last week</span>;
}

/** This week against the last: workouts, time, volume and sets. */
function Week({
  gym,
  workouts,
  today,
}: {
  gym: Gym;
  workouts: readonly Workout[];
  today: string;
}) {
  const now = useSecond(false);
  const week = weekOf(today);
  const current = ofWeek(workouts, week);
  const previous = ofWeek(workouts, addDays(week, -7));
  const sum = (items: Workout[]) => ({
    seconds: items.reduce(
      (total, item) => total + workoutSeconds(item, now),
      0
    ),
    sets: items.reduce((total, item) => total + item.summary.sets, 0),
    volume: items.reduce((total, item) => total + item.summary.volume, 0),
  });
  const a = sum(current);
  const b = sum(previous);
  return (
    <section
      aria-label="This week"
      className={cn(
        PANEL,
        "grid grid-cols-2 gap-x-4 gap-y-5 p-4 sm:grid-cols-4 sm:p-5"
      )}
    >
      <Stat
        label="Workouts this week"
        note={<LastWeek>{previous.length}</LastWeek>}
        value={current.length}
      />
      <Stat
        label="Time"
        note={
          <LastWeek>
            {b.seconds > 0 ? formatDuration(b.seconds) : "0m"}
          </LastWeek>
        }
        value={a.seconds > 0 ? formatDuration(a.seconds) : "0m"}
      />
      <Stat
        label="Volume"
        note={<LastWeek>{formatVolume(b.volume, gym.units)}</LastWeek>}
        value={formatVolume(a.volume, gym.units)}
      />
      <Stat label="Sets" note={<LastWeek>{b.sets}</LastWeek>} value={a.sets} />
    </section>
  );
}

/** One day's square, deeper the more was done. */
function YearDay({
  date,
  today,
  workouts,
  style,
}: {
  date: string;
  today: string;
  workouts: readonly Workout[] | undefined;
  style: CSSProperties;
}) {
  if (date > today) {
    return <span aria-hidden className={DAY_SQUARE} style={style} />;
  }
  const sets =
    workouts?.reduce((total, item) => total + item.summary.sets, 0) ?? 0;
  const trained = workouts !== undefined && workouts.length > 0;
  return (
    <span
      className={cn(
        DAY_SQUARE,
        trained ? SWATCH_COLORS[GYM_COLOR] : "bg-foreground/6",
        date === today && TODAY_RING
      )}
      style={
        trained
          ? { ...style, opacity: 0.35 + 0.65 * Math.min(1, sets / FULL_DAY) }
          : style
      }
      title={
        trained
          ? `${dayLabel(date, today)}: ${workouts.map((item) => item.title).join(", ")}`
          : undefined
      }
    />
  );
}

/** The year at a glance: a square a day, and the weeks in a row. */
function Consistency({
  workouts,
  today,
}: {
  workouts: readonly Workout[];
  today: string;
}) {
  const byDate = new Map<string, Workout[]>();
  for (const workout of workouts) {
    byDate.set(workout.date, [...(byDate.get(workout.date) ?? []), workout]);
  }
  const streak = weekStreak(workouts, today);
  const yearAgo = addDays(today, -364);
  const inYear = workouts.filter((workout) => workout.date >= yearAgo).length;
  return (
    <Panel
      action={
        <Tooltip>
          <TooltipTrigger
            render={
              <span
                className={cn(
                  "inline-flex h-6 shrink-0 items-center gap-1 rounded-full pr-2 pl-1.5 text-xs font-medium tabular-nums",
                  streak > 0
                    ? CHIP_COLORS[GYM_COLOR]
                    : "bg-foreground/6 text-muted-foreground"
                )}
              />
            }
          >
            <FlameIcon aria-hidden className="size-3.5" />
            {streak}
            <span className="sr-only"> {plural(streak, "week")} in a row</span>
          </TooltipTrigger>
          <TooltipContent>Streak · {plural(streak, "week")}</TooltipContent>
        </Tooltip>
      }
      description={`${plural(inYear, "workout")} in the last year`}
      title="Consistency"
    >
      <DayGrid
        labeled
        maxWeeks={53}
        minCell={8}
        renderDay={(date, style) => (
          <YearDay
            date={date}
            style={style}
            today={today}
            workouts={byDate.get(date)}
          />
        )}
        today={today}
      />
    </Panel>
  );
}

/** Volume week by week, this week last. */
function Volume({
  gym,
  workouts,
  today,
}: {
  gym: Gym;
  workouts: readonly Workout[];
  today: string;
}) {
  const week = weekOf(today);
  const bars = Array.from({ length: WEEKS }, (_, index) => {
    const monday = addDays(week, -7 * (WEEKS - 1 - index));
    const items = ofWeek(workouts, monday);
    const volume = items.reduce(
      (total, item) => total + item.summary.volume,
      0
    );
    return {
      detail: `${formatVolume(volume, gym.units)} · ${plural(items.length, "workout")}`,
      value: volume,
      week: monday,
    };
  });
  const top = Math.max(...bars.map((bar) => bar.value));
  return (
    <Panel
      description={
        top > 0
          ? `Best week ${formatVolume(top, gym.units)}`
          : "Weight moved, week by week"
      }
      title="Volume"
    >
      <WeekBars bars={bars} color={GYM_COLOR} label="Volume by week" />
    </Panel>
  );
}

/** Which muscles the week's sets went to, most first. */
function Muscles({
  workouts,
  exercises,
  today,
}: {
  workouts: readonly Workout[];
  exercises: ReadonlyMap<string, Exercise>;
  today: string;
}) {
  const sets = muscleSets(ofWeek(workouts, weekOf(today)), exercises);
  const top = sets[0]?.[1] ?? 0;
  return (
    <Panel
      description="Sets this week, half for muscles worked along the way"
      title="Muscles"
    >
      {sets.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {sets.slice(0, MUSCLES_SHOWN).map(([muscle, count]) => (
            <li className="flex items-center gap-3 text-sm" key={muscle}>
              <span className="w-24 shrink-0 truncate">
                {MUSCLE_INFO[muscle].label}
              </span>
              <span className="bg-foreground/5 h-2 min-w-0 flex-1 overflow-hidden rounded-full">
                <span
                  className="block h-full rounded-full bg-orange-500 transition-[width] duration-500 ease-out"
                  style={{ width: `${(count / top) * 100}%` }}
                />
              </span>
              <span className="text-muted-foreground w-8 shrink-0 text-right text-xs tabular-nums">
                {Math.round(count * 10) / 10}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground py-6 text-center text-sm">
          Train this week to see the muscles you worked.
        </p>
      )}
    </Panel>
  );
}

interface RecordGroup {
  exercise: Exercise;
  at: number;
  records: GymRecord[];
}

/** Records grouped by when they were set: an exercise's bests from one workout read as one. */
function recentRecords(exercises: readonly Exercise[]): RecordGroup[] {
  const groups = new Map<string, RecordGroup>();
  for (const exercise of exercises) {
    for (const record of exercise.records) {
      const key = `${exercise._id}:${record.workoutId}`;
      const group = groups.get(key) ?? { at: record.at, exercise, records: [] };
      group.records.push(record);
      groups.set(key, group);
    }
  }
  return [...groups.values()].toSorted((a, b) => b.at - a.at);
}

/** The latest bests, each opening its exercise. */
function Records({
  gym,
  exercises,
  today,
  onOpenExercise,
}: {
  gym: Gym;
  exercises: readonly Exercise[];
  today: string;
  onOpenExercise: (exerciseId: string) => void;
}) {
  const groups = recentRecords(exercises).slice(0, RECORDS_SHOWN);
  return (
    <Panel description="Your latest bests" title="Records">
      {groups.length > 0 ? (
        <ul className="-mx-2 flex flex-col">
          {groups.map(({ exercise, at, records }) => (
            <li key={`${exercise._id}:${at}`}>
              <button
                className="hover:bg-foreground/3 focus-visible:bg-foreground/3 flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left outline-none"
                onClick={() => onOpenExercise(exercise._id)}
                type="button"
              >
                <span
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-lg",
                    CHIP_COLORS.yellow
                  )}
                >
                  <TrophyIcon aria-hidden className="size-3.5" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">
                    {exercise.name}
                  </span>
                  <span className="text-muted-foreground truncate text-xs">
                    {records
                      .map(
                        (record) =>
                          `${RECORD_LABELS[record.kind]} ${formatRecord(record, gym.units)}`
                      )
                      .join(" · ")}
                  </span>
                </span>
                <span className="text-muted-foreground shrink-0 text-xs">
                  {dayLabel(format(at, "yyyy-MM-dd"), today)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground py-6 text-center text-sm">
          Beat what you did last time to set your first record.
        </p>
      )}
    </Panel>
  );
}

/** The last weighing's day, and how far it moved over the month before it. */
function bodyLine(
  gym: Gym,
  weights: readonly BodyWeight[],
  today: string
): string {
  const latest = weights.at(-1);
  if (!latest) {
    return "Log your weight to see how it moves";
  }
  const monthAgo = addDays(latest.date, -30);
  const before =
    weights.findLast((item) => item.date <= monthAgo) ?? weights[0];
  if (!before || before === latest) {
    return dayLabel(latest.date, today);
  }
  const change = formatChange(
    weightChange(latest.weight, before.weight, gym.units),
    gym.units
  );
  return `${dayLabel(latest.date, today)} · ${change} since ${dayLabel(before.date, today)}`;
}

/** Body weight lately: where it is, how it moved, and its line. */
function Body({
  project,
  gym,
  weights,
  today,
}: {
  project: Project;
  gym: Gym;
  weights: readonly BodyWeight[];
  today: string;
}) {
  const [active, setActive] = useState<number>();
  const latest = weights.at(-1);
  const points = weights.map((item) => ({
    t: parseISO(item.date).getTime(),
    value: toLoad(item.weight, gym.units),
  }));
  const shown = active === undefined ? undefined : points[active];
  return (
    <Panel
      action={
        <Link
          className={buttonVariants({ size: "sm", variant: "outline" })}
          href={gymPath(project, "body")}
        >
          {latest ? "Open" : "Log weight"}
        </Link>
      }
      description={
        shown ? format(shown.t, "EEE, MMM d") : bodyLine(gym, weights, today)
      }
      title="Body weight"
    >
      {latest && (
        <p className="flex items-baseline gap-1.5 text-3xl font-semibold tracking-tight tabular-nums">
          {shown ? shown.value : formatLoad(latest.weight, gym.units)}
          <span className="text-muted-foreground text-sm font-medium tracking-normal">
            {weightUnit(gym.units)}
          </span>
        </p>
      )}
      {points.length >= 2 && (
        <div
          className="-mx-4 -mb-4 sm:-mx-5 sm:-mb-5"
          // The line in body weight's color rather than the hub's.
          style={{ "--primary": HEX_COLORS[BODY_COLOR] } as CSSProperties}
        >
          <Sparkline
            active={active}
            describe={(point) =>
              `${format(point.t, "MMM d")}: ${point.value} ${weightUnit(gym.units)}`
            }
            label="Body weight"
            onActiveChange={setActive}
            points={points}
          />
        </div>
      )}
    </Panel>
  );
}

interface OverviewProps {
  project: Project;
  gym: Gym;
  exercises: readonly Exercise[];
  byId: ReadonlyMap<string, Exercise>;
  routines: readonly Routine[];
  /** Workouts since a year back, newest first. */
  workouts: readonly Workout[];
  /** Weighings lately, oldest first. */
  weights: readonly BodyWeight[];
  active?: Workout | null;
  today: string;
  onStart: (routine?: Routine) => void;
  onNewRoutine: () => void;
  onEditRoutine: (routine: Routine) => void;
  onLogPast: () => void;
  onOpenExercise: (exerciseId: string) => void;
}

/** The gym at a glance: what's under way, ways to start, and how it's going. */
export function Overview({
  project,
  gym,
  exercises,
  byId,
  routines,
  workouts,
  weights,
  active,
  today,
  onStart,
  onNewRoutine,
  onEditRoutine,
  onLogPast,
  onOpenExercise,
}: OverviewProps) {
  const editable = canEdit(project);
  return (
    <div className="flex flex-col gap-6">
      {active && <UnderWay project={project} workout={active} />}
      {!active && (
        <StartSection
          editable={editable}
          exercises={byId}
          onEditRoutine={onEditRoutine}
          onLogPast={onLogPast}
          onNewRoutine={onNewRoutine}
          onStart={onStart}
          routines={routines}
          today={today}
        />
      )}
      <Week gym={gym} today={today} workouts={workouts} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Consistency today={today} workouts={workouts} />
        <Volume gym={gym} today={today} workouts={workouts} />
        <Muscles exercises={byId} today={today} workouts={workouts} />
        <Records
          exercises={exercises}
          gym={gym}
          onOpenExercise={onOpenExercise}
          today={today}
        />
      </div>
      <Body gym={gym} project={project} today={today} weights={weights} />
    </div>
  );
}
