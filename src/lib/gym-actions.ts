import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { OptimisticLocalStore } from "convex/browser";
import { toast } from "sonner";

import { run } from "@/lib/actions";
import { convex } from "@/lib/convex";
import type {
  BodyWeight,
  Equipment,
  Exercise,
  ExerciseKind,
  Gym,
  GymSet,
  Muscle,
  Routine,
  TargetSet,
  UnitSystem,
  Workout,
  WorkoutEntry,
} from "@/lib/gym";
import { playSound } from "@/lib/sounds";

export interface ExerciseDraft {
  name: string;
  kind: ExerciseKind;
  muscles: Muscle[];
  secondary: Muscle[];
  equipment: Equipment[];
  /** Seconds; missing takes the gym's. */
  rest?: number;
  note: string;
}

export interface ExerciseChanges extends Partial<Omit<ExerciseDraft, "rest">> {
  /** null takes the gym's. */
  rest?: number | null;
  archived?: boolean;
}

/** The rest between sets: when it ends, in ms, and how long it was set for. */
export interface RestTimer {
  endsAt: number;
  seconds: number;
}

export interface RoutineExercise {
  exerciseId: Id<"gymExercises">;
  sets: TargetSet[];
}

function patchGyms(
  store: OptimisticLocalStore,
  patch: (gyms: Gym[]) => Gym[]
): void {
  const gyms = store.getQuery(api.gym.list, {});
  if (gyms) {
    store.setQuery(api.gym.list, {}, patch(gyms));
  }
}

function patchExercises(
  store: OptimisticLocalStore,
  projectId: Id<"projects">,
  patch: (exercises: Exercise[]) => Exercise[]
): void {
  const exercises = store.getQuery(api.gym.exercises, { projectId });
  if (exercises) {
    store.setQuery(api.gym.exercises, { projectId }, patch(exercises));
  }
}

/** Changes the workout wherever it's loaded: its page, lists, and as the one under way. */
function patchWorkout(
  store: OptimisticLocalStore,
  workout: Pick<Workout, "_id" | "projectId">,
  patch: (workout: Workout) => Workout | null
): void {
  const query = { workoutId: workout._id };
  const view = store.getQuery(api.workouts.get, query);
  if (view) {
    const next = patch(view.workout);
    store.setQuery(api.workouts.get, query, next && { ...view, workout: next });
  }
  for (const { args, value } of store.getAllQueries(api.workouts.list)) {
    if (value && args.projectId === workout.projectId) {
      store.setQuery(
        api.workouts.list,
        args,
        value.flatMap((item) =>
          item._id === workout._id ? (patch(item) ?? []) : [item]
        )
      );
    }
  }
  const active = { projectId: workout.projectId };
  const current = store.getQuery(api.workouts.active, active);
  if (current?._id === workout._id) {
    const next = patch(current);
    store.setQuery(
      api.workouts.active,
      active,
      next?.endedAt === undefined ? next : null
    );
  }
}

function patchEntries(
  store: OptimisticLocalStore,
  workoutId: Id<"gymWorkouts">,
  patch: (entries: WorkoutEntry[]) => WorkoutEntry[]
): void {
  const view = store.getQuery(api.workouts.get, { workoutId });
  if (view) {
    store.setQuery(
      api.workouts.get,
      { workoutId },
      { ...view, entries: patch(view.entries) }
    );
  }
}

function patchRoutines(
  store: OptimisticLocalStore,
  projectId: Id<"projects">,
  patch: (routines: Routine[]) => Routine[]
): void {
  const routines = store.getQuery(api.routines.list, { projectId });
  if (routines) {
    store.setQuery(api.routines.list, { projectId }, patch(routines));
  }
}

/** Changes every loaded stretch of the project's weighings that `date` falls in. */
function patchWeights(
  store: OptimisticLocalStore,
  projectId: Id<"projects">,
  date: string,
  patch: (weights: BodyWeight[]) => BodyWeight[]
): void {
  for (const { args, value } of store.getAllQueries(api.bodyweight.list)) {
    if (value && args.projectId === projectId && date >= args.from) {
      store.setQuery(api.bodyweight.list, args, patch(value));
    }
  }
}

/** Sets up the gym in a personal project; resolves with its id. */
export function setupGym(projectId: Id<"projects">, units: UnitSystem) {
  playSound("sparkle");
  return run(convex.mutation(api.gym.setup, { projectId, units }));
}

export function updateGym(
  gym: Gym,
  changes: { units?: UnitSystem; rest?: number; goalWeight?: number | null }
) {
  return run(
    convex.mutation(
      api.gym.update,
      { gymId: gym._id, ...changes },
      {
        optimisticUpdate: (store) =>
          patchGyms(store, (gyms) =>
            gyms.map((item) =>
              item._id === gym._id
                ? {
                    ...item,
                    ...changes,
                    goalWeight:
                      changes.goalWeight === undefined
                        ? item.goalWeight
                        : (changes.goalWeight ?? undefined),
                  }
                : item
            )
          ),
      }
    )
  );
}

/** Adds an exercise to the gym; resolves with its id. */
export function createExercise(
  projectId: Id<"projects">,
  draft: ExerciseDraft
) {
  return run(convex.mutation(api.gym.createExercise, { projectId, ...draft }));
}

export function updateExercise(exercise: Exercise, changes: ExerciseChanges) {
  return run(
    convex.mutation(
      api.gym.updateExercise,
      { exerciseId: exercise._id, ...changes },
      {
        optimisticUpdate: (store) =>
          patchExercises(store, exercise.projectId, (exercises) =>
            exercises.map((item) =>
              item._id === exercise._id
                ? {
                    ...item,
                    ...changes,
                    archived: changes.archived ?? item.archived,
                    rest:
                      changes.rest === undefined
                        ? item.rest
                        : (changes.rest ?? undefined),
                  }
                : item
            )
          ),
      }
    )
  );
}

export function deleteExercise(exercise: Exercise) {
  playSound("whoosh");
  return run(
    convex.mutation(
      api.gym.removeExercise,
      { exerciseId: exercise._id },
      {
        optimisticUpdate: (store) =>
          patchExercises(store, exercise.projectId, (exercises) =>
            exercises.filter((item) => item._id !== exercise._id)
          ),
      }
    )
  );
}

/** Starts a workout now: empty, from a routine, or again from one before; resolves with its id. */
export function startWorkout(
  projectId: Id<"projects">,
  start: {
    date: string;
    title: string;
    routineId?: Id<"gymRoutines">;
    repeatId?: Id<"gymWorkouts">;
  }
) {
  playSound("rise");
  return run(convex.mutation(api.workouts.start, { projectId, ...start }));
}

/** Adds a workout that's over, to fill in; resolves with its id. */
export function addPastWorkout(
  projectId: Id<"projects">,
  past: { date: string; startedAt: number; endedAt: number; title: string }
) {
  return run(convex.mutation(api.workouts.addPast, { projectId, ...past }));
}

export function updateWorkout(
  workout: Workout,
  changes: Partial<
    Pick<Workout, "title" | "note" | "date" | "startedAt" | "endedAt">
  >
) {
  return run(
    convex.mutation(
      api.workouts.update,
      { workoutId: workout._id, ...changes },
      {
        optimisticUpdate: (store) =>
          patchWorkout(store, workout, (item) => ({ ...item, ...changes })),
      }
    )
  );
}

/**
 * Ends the workout under way, or wraps up edits to one that's over. Sets not
 * checked off are dropped, or kept as done when they're filled in.
 */
export function finishWorkout(workout: Workout, unchecked: "drop" | "keep") {
  if (workout.endedAt === undefined) {
    playSound("complete");
  }
  return run(
    convex.mutation(
      api.workouts.finish,
      { unchecked, workoutId: workout._id },
      {
        optimisticUpdate: (store) =>
          patchWorkout(store, workout, (item) => ({
            ...item,
            endedAt: item.endedAt ?? Date.now(),
            rest: undefined,
          })),
      }
    )
  );
}

/** Deletes a workout and what was done in it, discarding one under way. */
export function removeWorkout(workout: Workout) {
  playSound("whoosh");
  return run(
    convex.mutation(
      api.workouts.remove,
      { workoutId: workout._id },
      { optimisticUpdate: (store) => patchWorkout(store, workout, () => null) }
    )
  );
}

/** Adds exercises to the workout, filled in from last time; resolves with their entries' ids. */
export function addExercises(
  workout: Workout,
  exerciseIds: Id<"gymExercises">[]
) {
  playSound("pop");
  return run(
    convex.mutation(api.workouts.addExercises, {
      exerciseIds,
      workoutId: workout._id,
    })
  );
}

export function removeEntry(entry: WorkoutEntry) {
  playSound("off");
  return run(
    convex.mutation(
      api.workouts.removeEntry,
      { entryId: entry._id },
      {
        optimisticUpdate: (store) =>
          patchEntries(store, entry.workoutId, (entries) =>
            entries.filter((item) => item._id !== entry._id)
          ),
      }
    )
  );
}

export function moveEntry(entry: WorkoutEntry, direction: "up" | "down") {
  return run(
    convex.mutation(
      api.workouts.moveEntry,
      { direction, entryId: entry._id },
      {
        optimisticUpdate: (store) =>
          patchEntries(store, entry.workoutId, (entries) => {
            const index = entries.findIndex((item) => item._id === entry._id);
            const to = direction === "up" ? index - 1 : index + 1;
            const other = entries[to];
            return other && index !== -1
              ? entries.with(index, other).with(to, entry)
              : entries;
          }),
      }
    )
  );
}

export function updateEntryNote(entry: WorkoutEntry, note: string) {
  return run(
    convex.mutation(
      api.workouts.updateEntry,
      { entryId: entry._id, note },
      {
        optimisticUpdate: (store) =>
          patchEntries(store, entry.workoutId, (entries) =>
            entries.map((item) =>
              item._id === entry._id ? { ...item, note } : item
            )
          ),
      }
    )
  );
}

/** A rest of `seconds` starting now. */
function restFor(seconds: number): RestTimer {
  return { endsAt: Date.now() + seconds * 1000, seconds };
}

/**
 * Changes an exercise's sets, shown at once. With `restSeconds`, the rest
 * between sets starts too, as it does when a set's checked off.
 */
export function setSets(
  workout: Workout,
  entry: WorkoutEntry,
  sets: GymSet[],
  restSeconds?: number
) {
  const rest = restSeconds ? restFor(restSeconds) : undefined;
  return run(
    convex.mutation(
      api.workouts.setSets,
      { entryId: entry._id, rest, sets },
      {
        optimisticUpdate: (store) => {
          patchEntries(store, entry.workoutId, (entries) =>
            entries.map((item) =>
              item._id === entry._id ? { ...item, sets } : item
            )
          );
          if (rest && workout.endedAt === undefined) {
            patchWorkout(store, workout, (item) => ({ ...item, rest }));
          }
        },
      }
    )
  );
}

/** Starts, changes or ends the rest on the workout under way; null ends it. */
export function setRest(workout: Workout, rest: RestTimer | null) {
  return run(
    convex.mutation(
      api.workouts.setRest,
      { rest, workoutId: workout._id },
      {
        optimisticUpdate: (store) =>
          patchWorkout(store, workout, (item) => ({
            ...item,
            rest: rest ?? undefined,
          })),
      }
    )
  );
}

/** Keeps a routine; resolves with its id. */
export function createRoutine(
  projectId: Id<"projects">,
  title: string,
  exercises: RoutineExercise[]
) {
  playSound("sparkle");
  return run(
    convex.mutation(api.routines.create, { exercises, projectId, title })
  );
}

/** Keeps a workout as a routine to start again; resolves with its id. */
export async function routineFromWorkout(workout: Workout, title: string) {
  const routineId = await run(
    convex.mutation(api.routines.fromWorkout, {
      title,
      workoutId: workout._id,
    })
  );
  if (routineId) {
    playSound("sparkle");
    toast(`${title} saved as a routine`);
  }
  return routineId;
}

export function updateRoutine(
  routine: Routine,
  changes: { title?: string; exercises?: RoutineExercise[] }
) {
  return run(
    convex.mutation(
      api.routines.update,
      { routineId: routine._id, ...changes },
      {
        optimisticUpdate: (store) =>
          patchRoutines(store, routine.projectId, (routines) =>
            routines.map((item) =>
              item._id === routine._id ? { ...item, ...changes } : item
            )
          ),
      }
    )
  );
}

export function deleteRoutine(routine: Routine) {
  playSound("whoosh");
  return run(
    convex.mutation(
      api.routines.remove,
      { routineId: routine._id },
      {
        optimisticUpdate: (store) =>
          patchRoutines(store, routine.projectId, (routines) =>
            routines.filter((item) => item._id !== routine._id)
          ),
      }
    )
  );
}

/** Keeps what someone weighed on a day, in kilograms, in place of that day's weighing. */
export function logWeight(
  projectId: Id<"projects">,
  date: string,
  weight: number
) {
  playSound("tap");
  return run(
    convex.mutation(
      api.bodyweight.log,
      { date, projectId, weight },
      {
        optimisticUpdate: (store) =>
          patchWeights(store, projectId, date, (weights) => {
            const existing = weights.find((item) => item.date === date);
            if (existing) {
              return weights.map((item) =>
                item === existing ? { ...item, weight } : item
              );
            }
            return [
              ...weights,
              {
                _creationTime: Date.now(),
                // Stands in until the server's id arrives.
                _id: `pending-${date}` as Id<"bodyWeights">,
                date,
                projectId,
                weight,
              },
            ].toSorted((a, b) => a.date.localeCompare(b.date));
          }),
      }
    )
  );
}

/** Deletes a weighing; it can be brought back for a moment. */
export async function removeWeight(weighing: BodyWeight) {
  playSound("off");
  const done = await run(
    convex.mutation(
      api.bodyweight.remove,
      { weightId: weighing._id },
      {
        optimisticUpdate: (store) =>
          patchWeights(store, weighing.projectId, weighing.date, (weights) =>
            weights.filter((item) => item._id !== weighing._id)
          ),
      }
    )
  );
  if (done !== undefined) {
    toast("Weighing deleted", {
      action: {
        label: "Undo",
        onClick: () =>
          logWeight(weighing.projectId, weighing.date, weighing.weight),
      },
    });
  }
}
