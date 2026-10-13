import { cn } from "cn";
import { format, parseISO } from "date-fns";
import { DumbbellIcon } from "lucide-react";
import { Link } from "wouter";

import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyTitle } from "@/components/ui/empty";
import { workoutPath } from "@/features/gym/gym-context";
import { LiveDot, PANEL, TrophyChip } from "@/features/gym/gym-parts";
import { useSecond } from "@/hooks/use-gym";
import type { Exercise, Gym, Workout } from "@/lib/gym";
import { formatDuration, formatVolume, workoutSeconds } from "@/lib/gym";
import type { Project } from "@/lib/project";
import { plural } from "@/lib/utils";

/** A workout in the history: its day, what it came to, and what was in it. */
function WorkoutRow({
  project,
  gym,
  workout,
  exercises,
  now,
}: {
  project: Project;
  gym: Gym;
  workout: Workout;
  exercises: ReadonlyMap<string, Exercise>;
  now: number;
}) {
  const day = parseISO(workout.date);
  const live = workout.endedAt === undefined;
  const { summary } = workout;
  const lines = summary.exercises.flatMap(({ exerciseId, sets }) => {
    const exercise = exercises.get(exerciseId);
    return exercise && sets > 0 ? [`${sets} × ${exercise.name}`] : [];
  });
  return (
    <li>
      <Link
        className={cn(
          PANEL,
          "focus-visible:ring-ring/50 hover:shadow-raised flex items-start gap-4 p-4 transition-shadow duration-150 ease-out outline-none focus-visible:ring-3"
        )}
        href={workoutPath(project, workout)}
      >
        <span className="bg-foreground/4 flex w-12 shrink-0 flex-col items-center rounded-xl py-1.5">
          <span className="text-muted-foreground text-[10px] font-medium uppercase">
            {format(day, "EEE")}
          </span>
          <span className="text-lg leading-tight font-semibold tabular-nums">
            {format(day, "d")}
          </span>
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate font-medium">{workout.title}</span>
            {live && (
              <span className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-orange-700 dark:text-orange-300">
                <LiveDot className="size-1.5" />
                Under way
              </span>
            )}
          </span>
          <span className="text-muted-foreground truncate text-xs tabular-nums">
            {formatDuration(workoutSeconds(workout, now))} ·{" "}
            {formatVolume(summary.volume, gym.units)} ·{" "}
            {plural(summary.sets, "set")}
          </span>
          {lines.length > 0 && (
            <span className="text-muted-foreground line-clamp-2 text-sm">
              {lines.join(", ")}
            </span>
          )}
        </span>
        {summary.prs > 0 && <TrophyChip count={summary.prs} />}
      </Link>
    </li>
  );
}

/** Every workout, newest first, a month at a time. */
export function WorkoutsTab({
  project,
  gym,
  workouts,
  exercises,
  loaded,
  more,
  onMore,
  onStart,
}: {
  project: Project;
  gym: Gym;
  /** Newest first. */
  workouts: readonly Workout[];
  exercises: ReadonlyMap<string, Exercise>;
  loaded: boolean;
  /** Whether older workouts can be read. */
  more: boolean;
  onMore: () => void;
  /** Starts one, for whoever may. */
  onStart?: () => void;
}) {
  const now = useSecond(
    workouts.some((workout) => workout.endedAt === undefined)
  );
  if (loaded && workouts.length === 0 && !more) {
    return (
      <Empty>
        <DumbbellIcon
          aria-hidden
          className="text-muted-foreground size-8"
          strokeWidth={1.5}
        />
        <EmptyTitle>No workouts yet</EmptyTitle>
        <EmptyDescription>
          Every workout lands here, with what you lifted and the records you
          beat.
        </EmptyDescription>
        {onStart && <Button onClick={onStart}>Start a workout</Button>}
      </Empty>
    );
  }
  const months = new Map<string, Workout[]>();
  for (const workout of workouts) {
    const month = workout.date.slice(0, 7);
    months.set(month, [...(months.get(month) ?? []), workout]);
  }
  return (
    <div className="flex flex-col gap-8">
      {[...months].map(([month, items]) => {
        const volume = items.reduce(
          (total, item) => total + item.summary.volume,
          0
        );
        return (
          <section
            aria-labelledby={`month-${month}`}
            className="flex flex-col gap-3"
            key={month}
          >
            <header className="flex items-baseline justify-between gap-3 px-1">
              <h2 className="text-sm font-medium" id={`month-${month}`}>
                {format(parseISO(`${month}-01`), "MMMM yyyy")}
              </h2>
              <span className="text-muted-foreground text-xs tabular-nums">
                {plural(items.length, "workout")} ·{" "}
                {formatVolume(volume, gym.units)}
              </span>
            </header>
            <ol className="flex flex-col gap-2">
              {items.map((workout) => (
                <WorkoutRow
                  exercises={exercises}
                  gym={gym}
                  key={workout._id}
                  now={now}
                  project={project}
                  workout={workout}
                />
              ))}
            </ol>
          </section>
        );
      })}
      {more && (
        <Button className="self-center" onClick={onMore} variant="ghost">
          Show older
        </Button>
      )}
    </div>
  );
}
