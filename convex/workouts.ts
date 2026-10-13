import { ConvexError, v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import {
  ifVisible,
  requireExercise,
  requireGymEntry,
  requireProject,
  requireWorkout,
} from "./lib/access";
import {
  EMPTY_SUMMARY,
  activeOf,
  cleanDate,
  cleanName,
  cleanNote,
  cleanRest,
  cleanSets,
  entriesOf,
  prefill,
  previousOf,
  requireGymOf,
  resummarize,
  settle,
} from "./lib/gym";
import type { GymSet, TargetSet } from "./lib/validators";
import { vGymSet } from "./lib/validators";
import {
  MAX_ENTRIES,
  MAX_REST,
  MAX_WORKOUT_MS,
  MAX_WORKOUT_TITLE,
  isFilled,
} from "./shared/gym";
import { isDay } from "./shared/habits";
import { rankBetween } from "./shared/model";

/** An exercise in a workout, with what was done the last time before it. */
export type WorkoutEntry = Doc<"gymEntries"> & {
  /** When it was last done before, in ms, and the sets done then; null the first time. */
  previous: { at: number; sets: GymSet[] } | null;
};

export interface WorkoutView {
  workout: Doc<"gymWorkouts">;
  entries: WorkoutEntry[];
}

/** One time an exercise was done, as its history reads it. */
export type ExerciseTime = Pick<
  Doc<"gymEntries">,
  "_id" | "at" | "workoutId" | "sets" | "prs"
>;

const MINUTE = 60_000;

/** The project's workouts that started on `from` or after, newest first; null once out of reach. */
export const list = query({
  args: { from: v.string(), projectId: v.id("projects") },
  handler: async (
    ctx,
    { from, projectId }
  ): Promise<Doc<"gymWorkouts">[] | null> => {
    const access = await ifVisible(requireProject(ctx, projectId, "view"));
    if (!(access && isDay(from))) {
      return null;
    }
    const workouts = await ctx.db
      .query("gymWorkouts")
      .withIndex("by_project_and_date", (q) =>
        q.eq("projectId", projectId).gte("date", from)
      )
      .collect();
    return workouts.toSorted((a, b) => b.startedAt - a.startedAt);
  },
});

/** The day the project's first workout started, or null before there's one. */
export const oldest = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }): Promise<string | null> => {
    const access = await ifVisible(requireProject(ctx, projectId, "view"));
    if (!access) {
      return null;
    }
    const first = await ctx.db
      .query("gymWorkouts")
      .withIndex("by_project_and_date", (q) => q.eq("projectId", projectId))
      .first();
    return first?.date ?? null;
  },
});

/** The workout under way in the project; null when there's none, or it's out of reach. */
export const active = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }): Promise<Doc<"gymWorkouts"> | null> => {
    const access = await ifVisible(requireProject(ctx, projectId, "view"));
    return access ? await activeOf(ctx, projectId) : null;
  },
});

/** A workout with its exercises in order; null once it's gone. */
export const get = query({
  args: { workoutId: v.id("gymWorkouts") },
  handler: async (ctx, { workoutId }): Promise<WorkoutView | null> => {
    const access = await ifVisible(requireWorkout(ctx, workoutId, "view"));
    if (!access) {
      return null;
    }
    const { workout } = access;
    const entries = await entriesOf(ctx, workoutId);
    return {
      entries: await Promise.all(
        entries.map(async (entry) => ({
          ...entry,
          previous: await previousOf(ctx, entry.exerciseId, workout.startedAt),
        }))
      ),
      workout,
    };
  },
});

/** Every time the exercise was done, oldest first; null once it's gone. */
export const history = query({
  args: { exerciseId: v.id("gymExercises") },
  handler: async (ctx, { exerciseId }): Promise<ExerciseTime[] | null> => {
    const access = await ifVisible(requireExercise(ctx, exerciseId, "view"));
    if (!access) {
      return null;
    }
    const entries = await ctx.db
      .query("gymEntries")
      .withIndex("by_exercise_and_at", (q) => q.eq("exerciseId", exerciseId))
      .collect();
    return entries
      .filter((entry) => entry.sets.some((set) => set.done))
      .map(({ _id, at, prs, sets, workoutId }) => ({
        _id,
        at,
        prs,
        sets: sets.filter((set) => set.done),
        workoutId,
      }));
  },
});

function cleanTitle(title: string): string {
  return cleanName(title, MAX_WORKOUT_TITLE, "Give the workout a name.");
}

/** An exercise a workout starts with, and the sets a routine aims for in it. */
interface PlannedExercise {
  exerciseId: Id<"gymExercises">;
  targets?: TargetSet[];
}

/**
 * Adds exercises to the end of the workout, each with sets to do: the
 * routine's, filled in from last time where there's one.
 */
async function addEntries(
  ctx: MutationCtx,
  workout: Doc<"gymWorkouts">,
  plan: readonly PlannedExercise[]
): Promise<Id<"gymEntries">[]> {
  const entries = await entriesOf(ctx, workout._id);
  if (entries.length + plan.length > MAX_ENTRIES) {
    throw new ConvexError(`A workout takes up to ${MAX_ENTRIES} exercises.`);
  }
  let rank = entries.at(-1)?.rank;
  const added: Id<"gymEntries">[] = [];
  for (const { exerciseId, targets } of plan) {
    const exercise = await ctx.db.get(exerciseId);
    // One deleted since, or of another gym, is passed over.
    if (exercise?.projectId === workout.projectId) {
      const previous = await previousOf(ctx, exerciseId, workout.startedAt);
      rank = rankBetween(rank);
      added.push(
        await ctx.db.insert("gymEntries", {
          at: workout.startedAt,
          exerciseId,
          note: "",
          projectId: workout.projectId,
          prs: [],
          rank,
          sets: prefill(previous?.sets, targets),
          workoutId: workout._id,
        })
      );
    }
  }
  // Nothing in them is done yet, so no record moves: only the list of exercises.
  await resummarize(ctx, workout._id);
  return added;
}

interface Plan {
  title: string;
  routineId?: Id<"gymRoutines">;
  exercises: PlannedExercise[];
}

/**
 * What a workout starts with: a routine's exercises and name, which marks it
 * done now; those of a workout repeated, aiming for what was done then; or
 * nothing but the name given.
 */
async function planOf(
  ctx: MutationCtx,
  args: {
    projectId: Id<"projects">;
    routineId?: Id<"gymRoutines">;
    repeatId?: Id<"gymWorkouts">;
    title: string;
  }
): Promise<Plan> {
  const routine = args.routineId && (await ctx.db.get(args.routineId));
  if (routine && routine.projectId === args.projectId) {
    await ctx.db.patch(routine._id, { lastAt: Date.now() });
    return {
      exercises: routine.exercises.map(({ exerciseId, sets }) => ({
        exerciseId,
        targets: sets,
      })),
      routineId: routine._id,
      title: routine.title,
    };
  }
  const repeated = args.repeatId && (await ctx.db.get(args.repeatId));
  if (repeated && repeated.projectId === args.projectId) {
    const entries = await entriesOf(ctx, repeated._id);
    return {
      exercises: entries.map(({ exerciseId, sets }) => ({
        exerciseId,
        targets: sets.filter((set) => set.done),
      })),
      title: repeated.title,
    };
  }
  return { exercises: [], title: args.title };
}

/**
 * Starts a workout, now: empty, from a routine, or again from one done
 * before. Only one is under way at a time. Resolves with its id.
 */
export const start = mutation({
  args: {
    /** Today where the person is. */
    date: v.string(),
    projectId: v.id("projects"),
    repeatId: v.optional(v.id("gymWorkouts")),
    routineId: v.optional(v.id("gymRoutines")),
    /** Its name, unless the routine or the workout repeated names it. */
    title: v.string(),
  },
  handler: async (ctx, args) => {
    const { user } = await requireGymOf(ctx, args.projectId, "edit");
    if (await activeOf(ctx, args.projectId)) {
      throw new ConvexError("A workout is under way. Finish it first.");
    }
    const { exercises, routineId, title } = await planOf(ctx, args);
    const workoutId = await ctx.db.insert("gymWorkouts", {
      createdBy: user._id,
      date: cleanDate(args.date),
      note: "",
      projectId: args.projectId,
      routineId,
      startedAt: Date.now(),
      summary: EMPTY_SUMMARY,
      title: cleanTitle(title),
    });
    const workout = await ctx.db.get(workoutId);
    if (workout && exercises.length > 0) {
      await addEntries(ctx, workout, exercises);
    }
    return workoutId;
  },
});

/** Start and end of a workout that's over: in order, and no longer than a workout runs. */
function checkSpan(startedAt: number, endedAt: number): void {
  if (!(endedAt > startedAt)) {
    throw new ConvexError("A workout ends after it starts.");
  }
  if (endedAt - startedAt > MAX_WORKOUT_MS) {
    throw new ConvexError("That’s longer than a workout runs.");
  }
  // A little slack for clocks that run ahead.
  if (endedAt > Date.now() + 5 * MINUTE) {
    throw new ConvexError("That workout hasn’t happened yet.");
  }
}

/** Adds a workout that's over, to fill in afterwards; resolves with its id. */
export const addPast = mutation({
  args: {
    date: v.string(),
    endedAt: v.number(),
    projectId: v.id("projects"),
    startedAt: v.number(),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    const { user } = await requireGymOf(ctx, args.projectId, "edit");
    checkSpan(args.startedAt, args.endedAt);
    return await ctx.db.insert("gymWorkouts", {
      createdBy: user._id,
      date: cleanDate(args.date),
      endedAt: args.endedAt,
      note: "",
      projectId: args.projectId,
      startedAt: args.startedAt,
      summary: EMPTY_SUMMARY,
      title: cleanTitle(args.title),
    });
  },
});

export const update = mutation({
  args: {
    /** The day it started, where the person is; sent with a new start. */
    date: v.optional(v.string()),
    endedAt: v.optional(v.number()),
    note: v.optional(v.string()),
    startedAt: v.optional(v.number()),
    title: v.optional(v.string()),
    workoutId: v.id("gymWorkouts"),
  },
  handler: async (ctx, { workoutId, ...changes }) => {
    const { workout } = await requireWorkout(ctx, workoutId, "edit");
    const patch: Partial<Doc<"gymWorkouts">> = {};
    if (changes.title !== undefined) {
      patch.title = cleanTitle(changes.title);
    }
    if (changes.note !== undefined) {
      patch.note = cleanNote(changes.note);
    }
    if (changes.date !== undefined) {
      patch.date = cleanDate(changes.date);
    }
    const startedAt = changes.startedAt ?? workout.startedAt;
    if (changes.endedAt !== undefined && workout.endedAt === undefined) {
      throw new ConvexError("Finish the workout to set when it ended.");
    }
    if (workout.endedAt !== undefined) {
      const endedAt = changes.endedAt ?? workout.endedAt;
      checkSpan(startedAt, endedAt);
      patch.endedAt = endedAt;
    } else if (startedAt > Date.now()) {
      throw new ConvexError("A workout under way started already.");
    }
    patch.startedAt = startedAt;
    await ctx.db.patch(workoutId, patch);
    if (startedAt !== workout.startedAt) {
      // Its exercises move in their histories, and records may move with them.
      const entries = await entriesOf(ctx, workoutId);
      for (const entry of entries) {
        await ctx.db.patch(entry._id, { at: startedAt });
      }
      await settle(ctx, {
        exerciseIds: entries.map((entry) => entry.exerciseId),
        workoutIds: [workoutId],
      });
    }
  },
});

/**
 * Ends a workout under way, or wraps up edits to one that's over. Sets not
 * checked off are dropped, or kept as done when they were filled in; an
 * exercise left with no sets goes.
 */
export const finish = mutation({
  args: {
    unchecked: v.union(v.literal("drop"), v.literal("keep")),
    workoutId: v.id("gymWorkouts"),
  },
  handler: async (ctx, { unchecked, workoutId }) => {
    const { workout } = await requireWorkout(ctx, workoutId, "edit");
    const entries = await entriesOf(ctx, workoutId);
    const outcomes = await Promise.all(
      entries.map(async (entry) => {
        const exercise = await ctx.db.get(entry.exerciseId);
        const sets = entry.sets
          .map((set) =>
            unchecked === "keep" && exercise && isFilled(exercise.kind, set)
              ? { ...set, done: true }
              : set
          )
          .filter((set) => set.done);
        return { entry, sets };
      })
    );
    const ending = workout.endedAt === undefined;
    if (ending && outcomes.every(({ sets }) => sets.length === 0)) {
      throw new ConvexError(
        "Nothing’s checked off yet. Do a set, or discard the workout."
      );
    }
    for (const { entry, sets } of outcomes) {
      if (sets.length === 0) {
        await ctx.db.delete(entry._id);
      } else if (sets.length !== entry.sets.length || unchecked === "keep") {
        await ctx.db.patch(entry._id, { sets });
      }
    }
    if (ending) {
      await ctx.db.patch(workoutId, {
        // One left running for hours is cut off where a workout would end.
        endedAt: Math.min(Date.now(), workout.startedAt + MAX_WORKOUT_MS),
        rest: undefined,
      });
    }
    await settle(ctx, {
      exerciseIds: entries.map((entry) => entry.exerciseId),
      workoutIds: [workoutId],
    });
  },
});

/** Deletes a workout with everything done in it: discarding one under way, or one in the history. */
export const remove = mutation({
  args: { workoutId: v.id("gymWorkouts") },
  handler: async (ctx, { workoutId }) => {
    await requireWorkout(ctx, workoutId, "edit");
    const entries = await entriesOf(ctx, workoutId);
    for (const entry of entries) {
      await ctx.db.delete(entry._id);
    }
    await ctx.db.delete(workoutId);
    await settle(ctx, {
      exerciseIds: entries.map((entry) => entry.exerciseId),
      workoutIds: [],
    });
  },
});

/** Adds exercises to a workout, each with sets filled in from last time; resolves with their entries' ids. */
export const addExercises = mutation({
  args: {
    exerciseIds: v.array(v.id("gymExercises")),
    workoutId: v.id("gymWorkouts"),
  },
  handler: async (ctx, { exerciseIds, workoutId }) => {
    const { workout } = await requireWorkout(ctx, workoutId, "edit");
    return await addEntries(
      ctx,
      workout,
      exerciseIds.map((exerciseId) => ({ exerciseId }))
    );
  },
});

/** Takes an exercise out of the workout, with its sets. */
export const removeEntry = mutation({
  args: { entryId: v.id("gymEntries") },
  handler: async (ctx, { entryId }) => {
    const { entry } = await requireGymEntry(ctx, entryId, "edit");
    await ctx.db.delete(entryId);
    await settle(ctx, {
      exerciseIds: [entry.exerciseId],
      workoutIds: [entry.workoutId],
    });
  },
});

/** Swaps an exercise with the one before or after it. */
export const moveEntry = mutation({
  args: {
    direction: v.union(v.literal("up"), v.literal("down")),
    entryId: v.id("gymEntries"),
  },
  handler: async (ctx, { direction, entryId }) => {
    const { entry } = await requireGymEntry(ctx, entryId, "edit");
    const entries = await entriesOf(ctx, entry.workoutId);
    const index = entries.findIndex((item) => item._id === entryId);
    const other = entries[direction === "up" ? index - 1 : index + 1];
    if (!other) {
      return;
    }
    // Ranks could be equal from a race; nudged apart, the swap always shows.
    const step = direction === "up" ? -1e-6 : 1e-6;
    await ctx.db.patch(entryId, {
      rank: other.rank === entry.rank ? other.rank + step : other.rank,
    });
    await ctx.db.patch(other._id, { rank: entry.rank });
    await resummarize(ctx, entry.workoutId);
  },
});

export const updateEntry = mutation({
  args: { entryId: v.id("gymEntries"), note: v.string() },
  handler: async (ctx, { entryId, note }) => {
    await requireGymEntry(ctx, entryId, "edit");
    await ctx.db.patch(entryId, { note: cleanNote(note) });
  },
});

/**
 * The rest between sets as it's kept, never refused, so a set checked off
 * offline and sent late still saves: a rest that ran out meanwhile is left
 * out, and none runs past the longest rest.
 */
function cleanRestTimer(rest: {
  endsAt: number;
  seconds: number;
}): { endsAt: number; seconds: number } | undefined {
  const now = Date.now();
  if (!(Number.isFinite(rest.endsAt) && rest.endsAt > now)) {
    return undefined;
  }
  return {
    endsAt: Math.min(rest.endsAt, now + MAX_REST * 1000),
    seconds: cleanRest(rest.seconds),
  };
}

const vRestTimer = v.object({ endsAt: v.number(), seconds: v.number() });

/**
 * Changes an exercise's sets: any number, edited, added, taken away or
 * checked off. With `rest`, a rest starts on the workout under way, as a set
 * done does.
 */
export const setSets = mutation({
  args: {
    entryId: v.id("gymEntries"),
    rest: v.optional(vRestTimer),
    sets: v.array(vGymSet),
  },
  handler: async (ctx, { entryId, rest, sets }) => {
    const { entry, exercise, workout } = await requireGymEntry(
      ctx,
      entryId,
      "edit"
    );
    await ctx.db.patch(entryId, { sets: cleanSets(exercise.kind, sets) });
    if (rest && workout.endedAt === undefined) {
      const timer = cleanRestTimer(rest);
      if (timer) {
        await ctx.db.patch(workout._id, { rest: timer });
      }
    }
    await settle(ctx, {
      exerciseIds: [entry.exerciseId],
      workoutIds: [entry.workoutId],
    });
  },
});

/** Starts, changes or ends the rest on a workout under way; null ends it. */
export const setRest = mutation({
  args: {
    rest: v.union(vRestTimer, v.null()),
    workoutId: v.id("gymWorkouts"),
  },
  handler: async (ctx, { rest, workoutId }) => {
    const { workout } = await requireWorkout(ctx, workoutId, "edit");
    if (workout.endedAt !== undefined) {
      return;
    }
    await ctx.db.patch(workoutId, {
      rest: rest ? cleanRestTimer(rest) : undefined,
    });
  },
});
