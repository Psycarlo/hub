import { cn } from "cn";
import { ChevronRightIcon } from "lucide-react";
import { Link } from "wouter";

import { workoutPath } from "@/features/gym/gym-context";
import { LiveDot, PANEL } from "@/features/gym/gym-parts";
import { useSecond } from "@/hooks/use-gym";
import type { Workout } from "@/lib/gym";
import { formatClock, workoutSeconds } from "@/lib/gym";
import type { Project } from "@/lib/project";
import { plural } from "@/lib/utils";

/** The workout under way, front and center, to go back to. */
export function UnderWay({
  project,
  workout,
}: {
  project: Project;
  workout: Workout;
}) {
  const now = useSecond();
  const { exercises, sets } = workout.summary;
  return (
    <Link
      className={cn(
        PANEL,
        "group/live focus-visible:ring-ring/50 relative flex items-center gap-4 overflow-hidden p-4 outline-none focus-visible:ring-3 sm:p-5"
      )}
      href={workoutPath(project, workout)}
    >
      <span
        aria-hidden
        className="from-primary/10 via-primary/3 absolute inset-0 bg-gradient-to-r to-transparent"
      />
      <div className="relative flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-primary flex items-center gap-2 text-xs font-medium">
          <LiveDot />
          Under way
        </span>
        <span className="truncate text-lg font-semibold tracking-tight">
          {workout.title}
        </span>
        <span className="text-muted-foreground truncate text-xs">
          {plural(exercises.length, "exercise")} · {plural(sets, "set")} done
        </span>
      </div>
      <span className="relative text-3xl font-semibold tracking-tight tabular-nums">
        {formatClock(workoutSeconds(workout, now))}
      </span>
      <ChevronRightIcon
        aria-hidden
        className="text-muted-foreground relative size-5 transition-transform duration-150 ease-out group-hover/live:translate-x-0.5"
      />
    </Link>
  );
}
