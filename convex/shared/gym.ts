/**
 * The gym: what both the server and the app know about it. Numbers are kept
 * metric (kilograms, seconds, meters) and only read in pounds and miles.
 *
 * Exercises name their muscles and equipment by the ids here, which are also
 * the names of the parts of the 3D body and of the equipment models, so the
 * muscles an exercise trains can light up on them.
 */

import { addDays, weekdayOf } from "./habits";

/** How weights and distances read: kilograms and kilometers, or pounds and miles. */
export const UNIT_SYSTEMS = ["metric", "imperial"] as const;

export type UnitSystem = (typeof UNIT_SYSTEMS)[number];

export const KG_PER_LB = 0.45359237;
export const METERS_PER_MILE = 1609.344;

/**
 * What a set of an exercise records: weight lifted for reps, like a bench
 * press; reps, with any weight added to the body, like pull-ups; time held,
 * like a plank; or distance covered and how long it took, like a run.
 */
export const EXERCISE_KINDS = ["weight", "reps", "time", "distance"] as const;

export type ExerciseKind = (typeof EXERCISE_KINDS)[number];

/** How a set was done: as usual, as a warm-up that counts toward nothing, or to failure. */
export const SET_TYPES = ["normal", "warmup", "failure"] as const;

export type SetType = (typeof SET_TYPES)[number];

/** Muscles an exercise can train, by the names of the 3D body's parts. */
export const MUSCLES = [
  "chest",
  "frontDelts",
  "sideDelts",
  "rearDelts",
  "biceps",
  "triceps",
  "forearms",
  "traps",
  "lats",
  "upperBack",
  "lowerBack",
  "abs",
  "obliques",
  "glutes",
  "quads",
  "hamstrings",
  "adductors",
  "abductors",
  "calves",
  "neck",
] as const;

export type Muscle = (typeof MUSCLES)[number];

/** What an exercise is done with, by the names of the 3D equipment models. */
export const EQUIPMENT = [
  "barbell",
  "dumbbell",
  "kettlebell",
  "cable",
  "machine",
  "smith",
  "ezBar",
  "trapBar",
  "plate",
  "band",
  "bodyweight",
  "treadmill",
  "bike",
  "rower",
  "other",
] as const;

export type Equipment = (typeof EQUIPMENT)[number];

/**
 * The bests an exercise keeps: estimated one-rep max, heaviest weight, best
 * set (weight times reps), most reps, longest time and farthest distance.
 */
export const RECORD_KINDS = [
  "e1rm",
  "weight",
  "volume",
  "reps",
  "time",
  "distance",
] as const;

export type RecordKind = (typeof RECORD_KINDS)[number];

/** The records each kind of exercise keeps, the one that matters most first. */
export const RECORDS_OF: Record<ExerciseKind, readonly RecordKind[]> = {
  distance: ["distance"],
  reps: ["reps", "weight"],
  time: ["time"],
  weight: ["e1rm", "weight", "volume"],
};

export const MAX_EXERCISE_NAME = 80;
export const MAX_EXERCISES = 500;
export const MAX_WORKOUT_TITLE = 80;
export const MAX_ROUTINE_TITLE = 80;
export const MAX_GYM_NOTE = 1000;
export const MAX_ROUTINES = 50;
/** Exercises in one workout or routine. */
export const MAX_ENTRIES = 40;
/** Sets of one exercise in a workout. */
export const MAX_SETS = 30;
/** Drops after one set. */
export const MAX_DROPS = 6;
/** Seconds of rest a new gym starts with between sets. */
export const DEFAULT_REST = 90;
export const MAX_REST = 15 * 60;
/** The most a set can weigh, in kilograms: past any lift on record. */
export const MAX_LOAD = 1500;
export const MAX_REPS = 1000;
export const MAX_SECONDS = 24 * 60 * 60;
export const MAX_METERS = 1_000_000;
/** What a scale can read, in kilograms. */
export const MIN_BODY_WEIGHT = 20;
export const MAX_BODY_WEIGHT = 400;
/** The longest a workout runs, in ms. One under way past it was left running. */
export const MAX_WORKOUT_MS = 12 * 60 * 60 * 1000;

/**
 * How far apart, as a share, two values must be to tell them apart: 225 lb is
 * 102.0583 kg, and 102.06 kg typed in metric beats nothing by being heavier.
 */
const TOLERANCE = 1e-4;

/** A set as the helpers here read it; the validator in lib/validators is the full shape. */
export interface SetValues {
  type: SetType;
  done: boolean;
  weight?: number;
  reps?: number;
  seconds?: number;
  meters?: number;
  drops?: readonly { weight: number; reps: number }[];
}

/** A short id for a set, unique among its exercise's sets. */
export function newSetId(): string {
  return crypto.randomUUID().replaceAll("-", "").slice(0, 8);
}

/** An exercise's name as names are compared: "Incline  Press" and "incline press" are one. */
export function exerciseKey(name: string): string {
  return name.trim().toLowerCase().replaceAll(/\s+/gu, " ");
}

/** A set that counts toward records and sums: done, and not a warm-up. */
export function isWorking(set: Pick<SetValues, "done" | "type">): boolean {
  return set.done && set.type !== "warmup";
}

/** Whether the set has what its kind of exercise records, so it can be done. */
export function isFilled(kind: ExerciseKind, set: SetValues): boolean {
  switch (kind) {
    case "weight":
    case "reps": {
      return (set.reps ?? 0) > 0;
    }
    case "time": {
      return (set.seconds ?? 0) > 0;
    }
    default: {
      return (set.meters ?? 0) > 0 || (set.seconds ?? 0) > 0;
    }
  }
}

/** What could be lifted once, going by Epley's formula. */
function oneRepMax(weight: number, reps: number): number {
  return reps <= 1 ? weight : weight * (1 + reps / 30);
}

/** Kilograms moved in a set, its drops' included. */
export function setVolume(set: SetValues): number {
  const own = (set.weight ?? 0) * (set.reps ?? 0);
  return (set.drops ?? []).reduce(
    (sum, drop) => sum + drop.weight * drop.reps,
    own
  );
}

/** What the set counts toward one kind of record, or undefined when it doesn't. */
function recordValue(record: RecordKind, set: SetValues): number | undefined {
  const weight = set.weight ?? 0;
  const reps = set.reps ?? 0;
  switch (record) {
    case "e1rm": {
      return weight > 0 && reps > 0 ? oneRepMax(weight, reps) : undefined;
    }
    case "weight": {
      return weight > 0 && reps > 0 ? weight : undefined;
    }
    case "volume": {
      // The set itself: its drops are on the way down.
      return weight > 0 && reps > 0 ? weight * reps : undefined;
    }
    case "reps": {
      return reps > 0 ? reps : undefined;
    }
    case "time": {
      return (set.seconds ?? 0) > 0 ? set.seconds : undefined;
    }
    default: {
      return (set.meters ?? 0) > 0 ? set.meters : undefined;
    }
  }
}

/** Whether `value` beats `held`, by more than the rounding between units. */
export function beats(value: number, held: number): boolean {
  return value > held * (1 + TOLERANCE);
}

export interface Best<S extends SetValues> {
  value: number;
  set: S;
}

/** The best set of each record the exercise keeps, among sets that count. */
export function bestsOf<S extends SetValues>(
  kind: ExerciseKind,
  sets: readonly S[]
): Partial<Record<RecordKind, Best<S>>> {
  const bests: Partial<Record<RecordKind, Best<S>>> = {};
  for (const set of sets) {
    if (!isWorking(set)) {
      continue;
    }
    for (const record of RECORDS_OF[kind]) {
      const value = recordValue(record, set);
      const held = bests[record];
      if (value !== undefined && (!held || beats(value, held.value))) {
        bests[record] = { set, value };
      }
    }
  }
  return bests;
}

/** What a workout's sets add up to, as lists show it. */
export interface WorkoutSums<E extends string = string> {
  /** Sets that count, done. */
  sets: number;
  /** Kilograms moved in them. */
  volume: number;
  /** Records beaten, across its exercises. */
  prs: number;
  /** Its exercises in order, with the sets of each that count. */
  exercises: { exerciseId: E; sets: number }[];
}

/** Adds up a workout's entries, given in order. */
export function sumWorkout<E extends string>(
  entries: readonly {
    exerciseId: E;
    sets: readonly SetValues[];
    prs: readonly string[];
  }[]
): WorkoutSums<E> {
  const sums: WorkoutSums<E> = { exercises: [], prs: 0, sets: 0, volume: 0 };
  for (const entry of entries) {
    const working = entry.sets.filter(isWorking);
    sums.sets += working.length;
    sums.volume += working.reduce((sum, set) => sum + setVolume(set), 0);
    sums.prs += entry.prs.length;
    sums.exercises.push({ exerciseId: entry.exerciseId, sets: working.length });
  }
  return sums;
}

/** The Monday of the week the day is in: weeks run Monday to Sunday. */
export function weekOf(date: string): string {
  return addDays(date, -((weekdayOf(date) + 6) % 7));
}
