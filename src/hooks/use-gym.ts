import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useQuery } from "convex/react";
import { useMemo, useSyncExternalStore } from "react";

import { useMe } from "@/hooks/use-users";
import type {
  BodyWeight,
  Exercise,
  ExerciseTime,
  Gym,
  Routine,
  Workout,
  WorkoutView,
} from "@/lib/gym";
import type { Project } from "@/lib/project";
import { splitPersonal } from "@/lib/project";

const NO_EXERCISES: Exercise[] = [];
const NO_ROUTINES: Routine[] = [];
const NO_WORKOUTS: Workout[] = [];
const NO_WEIGHTS: BodyWeight[] = [];

/** Checked a few times a second, so a timer turns over close to the second itself. */
const TICK = 250;
const tickers = new Set<() => void>();
let ticking: ReturnType<typeof setInterval> | undefined;

/** One clock for every timer on screen. */
function subscribeSecond(onTick: () => void): () => void {
  tickers.add(onTick);
  ticking ??= setInterval(() => {
    for (const tick of tickers) {
      tick();
    }
  }, TICK);
  return () => {
    tickers.delete(onTick);
    if (tickers.size === 0) {
      clearInterval(ticking);
      ticking = undefined;
    }
  };
}

function unsubscribeNothing(): void {
  // Nothing was subscribed: a stopped clock doesn't tick.
}

function subscribeNever(): () => void {
  return unsubscribeNothing;
}

function thisSecond(): number {
  return Math.floor(Date.now() / 1000) * 1000;
}

/** The time to the second, in ms, moving on while `running`. */
export function useSecond(running = true): number {
  return useSyncExternalStore(
    running ? subscribeSecond : subscribeNever,
    thisSecond
  );
}

/** The gym's exercises, archived ones included, and each by id. */
export function useExercises(project: Pick<Project, "_id"> | undefined): {
  exercises: Exercise[];
  byId: ReadonlyMap<string, Exercise>;
  loaded: boolean;
} {
  const exercises = useQuery(
    api.gym.exercises,
    project ? { projectId: project._id } : "skip"
  );
  return useMemo(() => {
    const list = exercises ?? NO_EXERCISES;
    return {
      byId: new Map(list.map((exercise) => [exercise._id as string, exercise])),
      exercises: list,
      loaded: exercises !== undefined,
    };
  }, [exercises]);
}

export function useRoutines(project: Pick<Project, "_id"> | undefined): {
  routines: Routine[];
  loaded: boolean;
} {
  const routines = useQuery(
    api.routines.list,
    project ? { projectId: project._id } : "skip"
  );
  return { loaded: routines !== undefined, routines: routines ?? NO_ROUTINES };
}

/** Workouts that started on `from` or after, newest first. */
export function useWorkouts(
  project: Pick<Project, "_id"> | undefined,
  from: string
): { workouts: Workout[]; loaded: boolean } {
  const workouts = useQuery(
    api.workouts.list,
    project ? { from, projectId: project._id } : "skip"
  );
  return { loaded: workouts !== undefined, workouts: workouts ?? NO_WORKOUTS };
}

/** The workout under way; undefined while loading, null when there's none. */
export function useActiveWorkout(
  project: Pick<Project, "_id"> | undefined
): Workout | null | undefined {
  return useQuery(
    api.workouts.active,
    project ? { projectId: project._id } : "skip"
  );
}

/** A workout with its exercises; undefined while loading, null once it's gone. */
export function useWorkout(
  workoutId: Id<"gymWorkouts"> | undefined
): WorkoutView | null | undefined {
  return useQuery(api.workouts.get, workoutId ? { workoutId } : "skip");
}

/** Every time the exercise was done, oldest first. */
export function useExerciseHistory(
  exercise: Pick<Exercise, "_id"> | undefined
): ExerciseTime[] | null | undefined {
  return useQuery(
    api.workouts.history,
    exercise ? { exerciseId: exercise._id } : "skip"
  );
}

/** Weighings from `from` on, oldest first. */
export function useBodyWeights(
  project: Pick<Project, "_id"> | undefined,
  from: string
): { weights: BodyWeight[]; loaded: boolean } {
  const weights = useQuery(
    api.bodyweight.list,
    project ? { from, projectId: project._id } : "skip"
  );
  return { loaded: weights !== undefined, weights: weights ?? NO_WEIGHTS };
}

/** The person's own project and its gym, as they load: for widgets and the corner. */
export function useOwnGym(): {
  personal?: Project;
  gym?: Gym;
  /** False until both are in. */
  loaded: boolean;
} {
  const me = useMe();
  const projects = useQuery(api.projects.list);
  const gyms = useQuery(api.gym.list);
  const personal = projects && splitPersonal(projects, me._id).personal;
  return {
    gym: personal && gyms?.find((gym) => gym.projectId === personal._id),
    loaded: projects !== undefined && gyms !== undefined,
    personal,
  };
}
