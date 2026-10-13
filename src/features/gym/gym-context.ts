import { useLocation, useSearchParams } from "wouter";

import { useToday } from "@/hooks/use-today";
import type { Routine, Workout } from "@/lib/gym";
import { defaultTitle } from "@/lib/gym";
import { startWorkout } from "@/lib/gym-actions";
import type { Project } from "@/lib/project";
import { projectPath } from "@/lib/project";

/** Where a personal project's gym lives, after its tables: `/p/:project/gym`. */
export const GYM_SEGMENT = "gym";

export const GYM_TABS = ["overview", "workouts", "exercises", "body"] as const;

export type GymTab = (typeof GYM_TABS)[number];

const WORKOUT_ID = /^[0-9a-z]{16,40}$/u;

/** The project's gym, on the overview or another tab. */
export function gymPath(
  project: Pick<Project, "slug">,
  tab: GymTab = "overview"
): string {
  const path = `${projectPath(project)}/${GYM_SEGMENT}`;
  return tab === "overview" ? path : `${path}?tab=${tab}`;
}

/** A workout's page, the one under way or one in the history. */
export function workoutPath(
  project: Pick<Project, "slug">,
  workout: Pick<Workout, "_id">
): string {
  return `${projectPath(project)}/${GYM_SEGMENT}/${workout._id}`;
}

/** The workout id in a workout link. */
export function parseWorkoutParam(param: string): string | undefined {
  const id = param.toLowerCase();
  return WORKOUT_ID.test(id) ? id : undefined;
}

/**
 * The exercise open in its sheet, from `?exercise=` on any gym page, and ways
 * to open another or close it.
 */
export function useOpenExercise(): {
  exerciseId: string | null;
  open: (exerciseId: string) => void;
  close: () => void;
} {
  const [params, setParams] = useSearchParams();
  const change = (exerciseId: string | null) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (exerciseId) {
          next.set("exercise", exerciseId);
        } else {
          next.delete("exercise");
        }
        return next;
      },
      { replace: true }
    );
  return {
    close: () => change(null),
    exerciseId: params.get("exercise"),
    open: change,
  };
}

/**
 * Starts a workout in the project now, and opens it: empty, from a routine,
 * or again from one done before.
 */
export function useStartWorkout(
  project: Pick<Project, "_id" | "slug">
): (from?: { routine?: Routine; repeat?: Workout }) => Promise<void> {
  const [, navigate] = useLocation();
  const today = useToday();
  return async ({ routine, repeat } = {}) => {
    const workoutId = await startWorkout(project._id, {
      date: today,
      repeatId: repeat?._id,
      routineId: routine?._id,
      title: routine?.title ?? repeat?.title ?? defaultTitle(),
    });
    if (workoutId) {
      navigate(workoutPath(project, { _id: workoutId }));
    }
  };
}
