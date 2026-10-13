import { cn } from "cn";
import { FlameIcon, PlayIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useStartWorkout } from "@/features/gym/gym-context";
import { PANEL, Stat } from "@/features/gym/gym-parts";
import { UnderWay } from "@/features/gym/under-way";
import { gridStart } from "@/features/habits/heatmap";
import { useActiveWorkout, useRoutines, useWorkouts } from "@/hooks/use-gym";
import { useToday } from "@/hooks/use-today";
import type { Gym } from "@/lib/gym";
import { GYM_COLOR, formatVolume, weekOf, weekStreak } from "@/lib/gym";
import { dayLabel } from "@/lib/log";
import { CHIP_COLORS } from "@/lib/palette";
import type { Project } from "@/lib/project";
import { canEdit } from "@/lib/project";
import { plural } from "@/lib/utils";

/** Routines offered to start right from the snapshot. */
const ROUTINES_SHOWN = 3;

/** The gym in a glance on its project's page: the week so far, and a quick start. */
export function GymSnapshot({ project, gym }: { project: Project; gym: Gym }) {
  const today = useToday();
  const start = useStartWorkout(project);
  const active = useActiveWorkout(project);
  const { routines } = useRoutines(project);
  const { workouts, loaded } = useWorkouts(project, gridStart(today, 53));

  if (active) {
    return <UnderWay project={project} workout={active} />;
  }
  if (!loaded || active === undefined) {
    return <Skeleton className="h-28 rounded-2xl" />;
  }

  const week = weekOf(today);
  const thisWeek = workouts.filter((workout) => weekOf(workout.date) === week);
  const volume = thisWeek.reduce(
    (total, workout) => total + workout.summary.volume,
    0
  );
  const streak = weekStreak(workouts, today);
  const last = workouts.find((workout) => workout.endedAt !== undefined);

  return (
    <div
      className={cn(
        PANEL,
        "flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5"
      )}
    >
      <div className="grid flex-1 grid-cols-3 gap-4">
        <Stat label="This week" value={plural(thisWeek.length, "workout")} />
        <Stat label="Volume" value={formatVolume(volume, gym.units)} />
        <Stat
          label={last ? `Last · ${dayLabel(last.date, today)}` : "Last"}
          note={
            streak > 0 && (
              <span
                className={cn(
                  "inline-flex h-5 items-center gap-1 rounded-full pr-1.5 pl-1 text-[11px] font-medium",
                  CHIP_COLORS[GYM_COLOR]
                )}
              >
                <FlameIcon aria-hidden className="size-3" />
                {plural(streak, "week")}
              </span>
            )
          }
          value={
            <span className="text-base font-medium">{last?.title ?? "—"}</span>
          }
        />
      </div>
      {canEdit(project) && (
        <div className="flex flex-wrap gap-2 sm:justify-end">
          {routines.slice(0, ROUTINES_SHOWN).map((routine) => (
            <Button
              key={routine._id}
              onClick={() => start({ routine })}
              size="sm"
              variant="outline"
            >
              {routine.title}
            </Button>
          ))}
          <Button onClick={() => start()} size="sm">
            <PlayIcon />
            Start
          </Button>
        </div>
      )}
    </div>
  );
}
