import { ConvexError, v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import {
  ifVisible,
  requireProject,
  requireRoutine,
  requireWorkout,
} from "./lib/access";
import { cleanName, cleanTargets, entriesOf, requireGymOf } from "./lib/gym";
import { vTargetSet } from "./lib/validators";
import { MAX_ENTRIES, MAX_ROUTINES, MAX_ROUTINE_TITLE } from "./shared/gym";
import { rankBetween } from "./shared/model";

type RoutineExercise = Doc<"gymRoutines">["exercises"][number];

const vRoutineExercise = v.object({
  exerciseId: v.id("gymExercises"),
  sets: v.array(vTargetSet),
});

/** The project's routines, in their order; null once out of reach. */
export const list = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }): Promise<Doc<"gymRoutines">[] | null> => {
    const access = await ifVisible(requireProject(ctx, projectId, "view"));
    if (!access) {
      return null;
    }
    const routines = await ctx.db
      .query("gymRoutines")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .collect();
    return routines.toSorted(
      (a, b) => a.rank - b.rank || a._creationTime - b._creationTime
    );
  },
});

function cleanTitle(title: string): string {
  return cleanName(title, MAX_ROUTINE_TITLE, "Give the routine a name.");
}

/** A routine's exercises, each of the gym and with sets fit for its kind. */
async function cleanExercises(
  ctx: QueryCtx,
  projectId: Id<"projects">,
  exercises: readonly RoutineExercise[]
): Promise<RoutineExercise[]> {
  if (exercises.length === 0) {
    throw new ConvexError("Add an exercise to the routine.");
  }
  if (exercises.length > MAX_ENTRIES) {
    throw new ConvexError(`A routine takes up to ${MAX_ENTRIES} exercises.`);
  }
  return await Promise.all(
    exercises.map(async ({ exerciseId, sets }) => {
      const exercise = await ctx.db.get(exerciseId);
      if (exercise?.projectId !== projectId) {
        throw new ConvexError("One of those exercises isn’t in this gym.");
      }
      return { exerciseId, sets: cleanTargets(exercise.kind, sets) };
    })
  );
}

/** The rank after the project's last routine, while there's room for one more. */
async function nextRank(
  ctx: QueryCtx,
  projectId: Id<"projects">
): Promise<number> {
  const routines = await ctx.db
    .query("gymRoutines")
    .withIndex("by_project", (q) => q.eq("projectId", projectId))
    .take(MAX_ROUTINES);
  if (routines.length >= MAX_ROUTINES) {
    throw new ConvexError(`A gym keeps up to ${MAX_ROUTINES} routines.`);
  }
  const ranks = routines.map((routine) => routine.rank);
  return rankBetween(ranks.length > 0 ? Math.max(...ranks) : undefined);
}

export const create = mutation({
  args: {
    exercises: v.array(vRoutineExercise),
    projectId: v.id("projects"),
    title: v.string(),
  },
  handler: async (ctx, { exercises, projectId, title }) => {
    const { user } = await requireGymOf(ctx, projectId, "edit");
    return await ctx.db.insert("gymRoutines", {
      createdBy: user._id,
      exercises: await cleanExercises(ctx, projectId, exercises),
      projectId,
      rank: await nextRank(ctx, projectId),
      title: cleanTitle(title),
    });
  },
});

/** Keeps a workout as a routine: its exercises, aiming for the sets done. */
export const fromWorkout = mutation({
  args: { title: v.string(), workoutId: v.id("gymWorkouts") },
  handler: async (ctx, { title, workoutId }) => {
    const { user, workout } = await requireWorkout(ctx, workoutId, "edit");
    const entries = await entriesOf(ctx, workoutId);
    const exercises = entries.flatMap(({ exerciseId, sets }) => {
      const done = sets.filter((set) => set.done);
      const kept = done.length > 0 ? done : sets;
      return kept.length > 0
        ? [
            {
              exerciseId,
              sets: kept.map(({ meters, reps, seconds, type, weight }) => ({
                meters,
                reps,
                seconds,
                type,
                weight,
              })),
            },
          ]
        : [];
    });
    return await ctx.db.insert("gymRoutines", {
      createdBy: user._id,
      exercises: await cleanExercises(ctx, workout.projectId, exercises),
      projectId: workout.projectId,
      rank: await nextRank(ctx, workout.projectId),
      title: cleanTitle(title),
    });
  },
});

export const update = mutation({
  args: {
    exercises: v.optional(v.array(vRoutineExercise)),
    routineId: v.id("gymRoutines"),
    title: v.optional(v.string()),
  },
  handler: async (ctx, { exercises, routineId, title }) => {
    const { routine } = await requireRoutine(ctx, routineId, "edit");
    const patch: Partial<Doc<"gymRoutines">> = {};
    if (title !== undefined) {
      patch.title = cleanTitle(title);
    }
    if (exercises !== undefined) {
      patch.exercises = await cleanExercises(ctx, routine.projectId, exercises);
    }
    await ctx.db.patch(routineId, patch);
  },
});

/** Deletes the routine; workouts started from it stay as they are. */
export const remove = mutation({
  args: { routineId: v.id("gymRoutines") },
  handler: async (ctx, { routineId }) => {
    await requireRoutine(ctx, routineId, "edit");
    await ctx.db.delete(routineId);
  },
});
