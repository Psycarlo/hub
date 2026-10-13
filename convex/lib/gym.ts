/**
 * The gym's bookkeeping: the sums kept on workouts and the records kept on
 * exercises, brought up to date as sets change, and the checks every gym
 * change goes through.
 */
import { ConvexError } from "convex/values";

import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { RecordKind } from "../shared/gym";
import {
  MAX_DROPS,
  MAX_GYM_NOTE,
  MAX_LOAD,
  MAX_METERS,
  MAX_REPS,
  MAX_REST,
  MAX_SECONDS,
  MAX_SETS,
  RECORDS_OF,
  beats,
  bestsOf,
  newSetId,
  sumWorkout,
} from "../shared/gym";
import { addDays, isDay } from "../shared/habits";
import type { ProjectAccess } from "./access";
import { requireProject } from "./access";
import type { GymRecord, GymSet, TargetSet } from "./validators";

export const EMPTY_SUMMARY: Doc<"gymWorkouts">["summary"] = {
  exercises: [],
  prs: 0,
  sets: 0,
  volume: 0,
};

export async function gymOf(
  ctx: QueryCtx,
  projectId: Id<"projects">
): Promise<Doc<"gyms"> | null> {
  return await ctx.db
    .query("gyms")
    .withIndex("by_project", (q) => q.eq("projectId", projectId))
    .first();
}

/** The project, for someone who may `need` it, and its gym; one without a gym is refused. */
export async function requireGymOf(
  ctx: QueryCtx,
  projectId: Id<"projects">,
  need: "view" | "edit"
): Promise<ProjectAccess & { gym: Doc<"gyms"> }> {
  const access = await requireProject(ctx, projectId, need);
  const gym = await gymOf(ctx, projectId);
  if (!gym) {
    throw new ConvexError("Set up the gym first.");
  }
  return { ...access, gym };
}

/** The workout under way in the project, if there is one. */
export async function activeOf(
  ctx: QueryCtx,
  projectId: Id<"projects">
): Promise<Doc<"gymWorkouts"> | null> {
  return await ctx.db
    .query("gymWorkouts")
    .withIndex("by_project_and_ended", (q) =>
      // oxlint-disable-next-line unicorn/no-useless-undefined -- Convex matches a missing field by undefined
      q.eq("projectId", projectId).eq("endedAt", undefined)
    )
    .first();
}

/** The workout's exercises, in order. */
export async function entriesOf(
  ctx: QueryCtx,
  workoutId: Id<"gymWorkouts">
): Promise<Doc<"gymEntries">[]> {
  const entries = await ctx.db
    .query("gymEntries")
    .withIndex("by_workout", (q) => q.eq("workoutId", workoutId))
    .collect();
  return entries.toSorted(
    (a, b) => a.rank - b.rank || a._creationTime - b._creationTime
  );
}

/** The sets of the last time the exercise was done before `before`, or null before then. */
export async function previousOf(
  ctx: QueryCtx,
  exerciseId: Id<"gymExercises">,
  before: number
): Promise<{ at: number; sets: GymSet[] } | null> {
  const rows = await ctx.db
    .query("gymEntries")
    .withIndex("by_exercise_and_at", (q) =>
      q.eq("exerciseId", exerciseId).lt("at", before)
    )
    .order("desc")
    .take(10);
  for (const row of rows) {
    const done = row.sets.filter((set) => set.done);
    if (done.length > 0) {
      return { at: row.at, sets: done };
    }
  }
  return null;
}

/**
 * Sets to start an exercise with, still to do: as many as the routine asks
 * for, or as were done last time, filled in with last time's numbers so
 * they're there to beat. Without either, one blank set.
 */
export function prefill(
  previous: readonly TargetSet[] | undefined,
  targets?: readonly TargetSet[]
): GymSet[] {
  const shape = targets?.length ? targets : previous;
  if (!shape?.length) {
    return [{ done: false, id: newSetId(), type: "normal" }];
  }
  return shape.map((target, index) => {
    const from = previous?.[index] ?? previous?.at(-1) ?? target;
    return {
      done: false,
      id: newSetId(),
      meters: from.meters,
      reps: from.reps,
      seconds: from.seconds,
      // Going to failure is how a set went, not a plan.
      type: target.type === "failure" ? "normal" : target.type,
      weight: from.weight,
    };
  });
}

/** Today where the server is, as `YYYY-MM-DD`. */
function serverToday(): string {
  return new Date().toISOString().slice(0, 10);
}

/** A day that's been, or is today somewhere: time zones run up to a day ahead of the server. */
export function cleanDate(date: string): string {
  if (!isDay(date)) {
    throw new ConvexError("That isn’t a day.");
  }
  if (date > addDays(serverToday(), 1)) {
    throw new ConvexError("That day hasn’t come yet.");
  }
  return date;
}

/** A name or title: trimmed, cut to `max`, and never empty. */
export function cleanName(value: string, max: number, missing: string): string {
  const trimmed = value.trim().slice(0, max);
  if (!trimmed) {
    throw new ConvexError(missing);
  }
  return trimmed;
}

export function cleanNote(note: string): string {
  return note.trim().slice(0, MAX_GYM_NOTE);
}

/** Seconds of rest, from none to the most there is. */
export function cleanRest(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds < 0) {
    throw new ConvexError("That isn’t a rest.");
  }
  return Math.min(MAX_REST, Math.round(seconds));
}

/** A number a set records: not below zero, not past `max`, to `decimals` places. */
function cleanAmount(
  value: number | undefined,
  max: number,
  decimals: number
): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Number.isFinite(value) || value < 0 || value > max) {
    throw new ConvexError("One of those numbers is out of range.");
  }
  const scale = 10 ** decimals;
  return Math.round(value * scale) / scale;
}

/** Kilograms to four places, so weights typed in pounds read back the same. */
function cleanLoad(value: number | undefined): number | undefined {
  return cleanAmount(value, MAX_LOAD, 4);
}

/** A set with only what its exercise's kind records, every number in range. */
function cleanTarget(
  kind: Doc<"gymExercises">["kind"],
  set: TargetSet
): TargetSet {
  const lifts = kind === "weight" || kind === "reps";
  return {
    meters:
      kind === "distance" ? cleanAmount(set.meters, MAX_METERS, 1) : undefined,
    reps: lifts ? cleanAmount(set.reps, MAX_REPS, 0) : undefined,
    seconds: lifts ? undefined : cleanAmount(set.seconds, MAX_SECONDS, 0),
    type: set.type,
    weight: lifts ? cleanLoad(set.weight) : undefined,
  };
}

/** The sets a routine aims for, checked like sets done. */
export function cleanTargets(
  kind: Doc<"gymExercises">["kind"],
  sets: readonly TargetSet[]
): TargetSet[] {
  if (sets.length === 0 || sets.length > MAX_SETS) {
    throw new ConvexError(`An exercise takes 1 to ${MAX_SETS} sets.`);
  }
  return sets.map((set) => cleanTarget(kind, set));
}

/** Sets as they're kept: checked, each with an id of its own. */
export function cleanSets(
  kind: Doc<"gymExercises">["kind"],
  sets: readonly GymSet[]
): GymSet[] {
  if (sets.length > MAX_SETS) {
    throw new ConvexError(`An exercise takes up to ${MAX_SETS} sets.`);
  }
  const ids = new Set<string>();
  return sets.map((set) => {
    const id =
      set.id && set.id.length <= 16 && !ids.has(set.id) ? set.id : newSetId();
    ids.add(id);
    const drops =
      kind === "weight" || kind === "reps"
        ? (set.drops ?? []).slice(0, MAX_DROPS).map((drop) => ({
            reps: cleanAmount(drop.reps, MAX_REPS, 0) ?? 0,
            weight: cleanLoad(drop.weight) ?? 0,
          }))
        : [];
    return {
      ...cleanTarget(kind, set),
      done: set.done,
      drops: drops.length > 0 ? drops : undefined,
      id,
    };
  });
}

/** Sums the workout's entries again; a workout gone meanwhile is left be. */
export async function resummarize(
  ctx: MutationCtx,
  workoutId: Id<"gymWorkouts">
): Promise<void> {
  const workout = await ctx.db.get(workoutId);
  if (!workout) {
    return;
  }
  const summary = sumWorkout(await entriesOf(ctx, workoutId));
  if (JSON.stringify(summary) !== JSON.stringify(workout.summary)) {
    await ctx.db.patch(workoutId, { summary });
  }
}

function sameKinds(a: readonly RecordKind[], b: readonly RecordKind[]) {
  return a.length === b.length && a.every((kind, index) => kind === b[index]);
}

/**
 * Goes through the exercise's entries oldest first, marking the records each
 * beat, and keeps its bests and when it was last done. The first time it's
 * done beats nothing: there's nothing yet to beat. Returns the workouts whose
 * entries' records changed, to be summed again.
 */
async function settleExercise(
  ctx: MutationCtx,
  exerciseId: Id<"gymExercises">
): Promise<Id<"gymWorkouts">[]> {
  const exercise = await ctx.db.get(exerciseId);
  if (!exercise) {
    return [];
  }
  const kinds = RECORDS_OF[exercise.kind];
  const entries = await ctx.db
    .query("gymEntries")
    .withIndex("by_exercise_and_at", (q) => q.eq("exerciseId", exerciseId))
    .collect();
  const held = new Map<RecordKind, GymRecord>();
  const changed: Id<"gymWorkouts">[] = [];
  let lastAt: number | undefined;
  for (const entry of entries) {
    const bests = bestsOf(exercise.kind, entry.sets);
    const prs: RecordKind[] = [];
    for (const kind of kinds) {
      const best = bests[kind];
      const record = held.get(kind);
      if (!best || (record && !beats(best.value, record.value))) {
        continue;
      }
      if (record) {
        prs.push(kind);
      }
      held.set(kind, {
        at: entry.at,
        kind,
        reps: best.set.reps,
        value: best.value,
        weight: best.set.weight,
        workoutId: entry.workoutId,
      });
    }
    if (entry.sets.some((set) => set.done)) {
      lastAt = entry.at;
    }
    if (!sameKinds(prs, entry.prs)) {
      await ctx.db.patch(entry._id, { prs });
      changed.push(entry.workoutId);
    }
  }
  const records = kinds.flatMap((kind) => held.get(kind) ?? []);
  if (
    lastAt !== exercise.lastAt ||
    JSON.stringify(records) !== JSON.stringify(exercise.records)
  ) {
    await ctx.db.patch(exerciseId, { lastAt, records });
  }
  return changed;
}

/**
 * Once entries change: brings their exercises' records up to date, then sums
 * again the workouts touched, and any whose records moved because of it.
 */
export async function settle(
  ctx: MutationCtx,
  {
    exerciseIds,
    workoutIds,
  }: {
    exerciseIds: Iterable<Id<"gymExercises">>;
    workoutIds: Iterable<Id<"gymWorkouts">>;
  }
): Promise<void> {
  const workouts = new Set(workoutIds);
  for (const exerciseId of new Set(exerciseIds)) {
    for (const workoutId of await settleExercise(ctx, exerciseId)) {
      workouts.add(workoutId);
    }
  }
  for (const workoutId of workouts) {
    await resummarize(ctx, workoutId);
  }
}
