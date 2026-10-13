import type { Doc } from "@convex/_generated/dataModel";
import type { GymRecord, GymSet } from "@convex/lib/validators";
import type {
  Equipment,
  ExerciseKind,
  Muscle,
  RecordKind,
  UnitSystem,
} from "@convex/shared/gym";
import { KG_PER_LB, METERS_PER_MILE, weekOf } from "@convex/shared/gym";
import { addDays } from "@convex/shared/habits";

import type { Color } from "@/lib/palette";
import type { Project } from "@/lib/project";

export {
  EQUIPMENT,
  EXERCISE_KINDS,
  MAX_BODY_WEIGHT,
  MAX_DROPS,
  MAX_ENTRIES,
  MAX_EXERCISE_NAME,
  MAX_GYM_NOTE,
  MAX_REST,
  MAX_ROUTINE_TITLE,
  MAX_SETS,
  MAX_WORKOUT_TITLE,
  MIN_BODY_WEIGHT,
  MUSCLES,
  RECORDS_OF,
  bestsOf,
  exerciseKey,
  isFilled,
  isWorking,
  newSetId,
  setVolume,
  sumWorkout,
  weekOf,
} from "@convex/shared/gym";
export type {
  Equipment,
  ExerciseKind,
  Muscle,
  RecordKind,
  SetType,
  UnitSystem,
} from "@convex/shared/gym";
export type { GymRecord, GymSet, TargetSet } from "@convex/lib/validators";
export type { ExerciseTime, WorkoutEntry, WorkoutView } from "@convex/workouts";
export { addDays, isDay } from "@convex/shared/habits";

export type Gym = Doc<"gyms">;
export type Exercise = Doc<"gymExercises">;
export type Workout = Doc<"gymWorkouts">;
export type Routine = Doc<"gymRoutines">;
export type BodyWeight = Doc<"bodyWeights">;

/** The gym's own color: its widget, its year and its streak. */
export const GYM_COLOR: Color = "orange";
/** Body weight's color, kept apart from training's. */
export const BODY_COLOR: Color = "teal";

/** The project's gym, once it has one. */
export function gymOf(
  gyms: readonly Gym[],
  project: Pick<Project, "_id"> | undefined
): Gym | undefined {
  return project && gyms.find((gym) => gym.projectId === project._id);
}

/** Pounds where they're what scales read, kilograms everywhere else. */
export function unitsForLocale(): UnitSystem {
  const { region } = new Intl.Locale(navigator.language).maximize();
  return region && ["US", "LR", "MM"].includes(region) ? "imperial" : "metric";
}

export const KIND_INFO: Record<
  ExerciseKind,
  { label: string; description: string }
> = {
  distance: { description: "Runs, rows and rides", label: "Distance" },
  reps: { description: "Pull-ups or dips, weight optional", label: "Reps" },
  time: { description: "Planks and holds", label: "Time" },
  weight: { description: "Presses, squats, curls", label: "Weight × reps" },
};

/** Where on the body a muscle is, to group them. */
export const REGIONS = [
  { id: "chest", label: "Chest" },
  { id: "shoulders", label: "Shoulders" },
  { id: "arms", label: "Arms" },
  { id: "back", label: "Back" },
  { id: "core", label: "Core" },
  { id: "legs", label: "Legs" },
] as const;

export type Region = (typeof REGIONS)[number]["id"];

export const MUSCLE_INFO: Record<Muscle, { label: string; region: Region }> = {
  abductors: { label: "Abductors", region: "legs" },
  abs: { label: "Abs", region: "core" },
  adductors: { label: "Adductors", region: "legs" },
  biceps: { label: "Biceps", region: "arms" },
  calves: { label: "Calves", region: "legs" },
  chest: { label: "Chest", region: "chest" },
  forearms: { label: "Forearms", region: "arms" },
  frontDelts: { label: "Front delts", region: "shoulders" },
  glutes: { label: "Glutes", region: "legs" },
  hamstrings: { label: "Hamstrings", region: "legs" },
  lats: { label: "Lats", region: "back" },
  lowerBack: { label: "Lower back", region: "back" },
  neck: { label: "Neck", region: "back" },
  obliques: { label: "Obliques", region: "core" },
  quads: { label: "Quads", region: "legs" },
  rearDelts: { label: "Rear delts", region: "shoulders" },
  sideDelts: { label: "Side delts", region: "shoulders" },
  traps: { label: "Traps", region: "back" },
  triceps: { label: "Triceps", region: "arms" },
  upperBack: { label: "Upper back", region: "back" },
};

export const EQUIPMENT_LABELS: Record<Equipment, string> = {
  band: "Band",
  barbell: "Barbell",
  bike: "Bike",
  bodyweight: "Bodyweight",
  cable: "Cable",
  dumbbell: "Dumbbell",
  ezBar: "EZ bar",
  kettlebell: "Kettlebell",
  machine: "Machine",
  other: "Other",
  plate: "Plate",
  rower: "Rower",
  smith: "Smith machine",
  trapBar: "Trap bar",
  treadmill: "Treadmill",
};

export const RECORD_LABELS: Record<RecordKind, string> = {
  distance: "Farthest",
  e1rm: "Est. 1RM",
  reps: "Most reps",
  time: "Longest",
  volume: "Best set",
  weight: "Heaviest",
};

/** The regions an exercise trains, by its main muscles, in body order. */
export function regionsOf(exercise: Pick<Exercise, "muscles">): Region[] {
  const regions = new Set(
    exercise.muscles.map((muscle) => MUSCLE_INFO[muscle].region)
  );
  return REGIONS.map((region) => region.id).filter((id) => regions.has(id));
}

/** The exercise's main muscles, as a line: "Chest · Triceps". */
export function musclesLine(exercise: Pick<Exercise, "muscles">): string {
  return exercise.muscles
    .map((muscle) => MUSCLE_INFO[muscle].label)
    .join(" · ");
}

/** Exercises to offer, the ones done most lately first, then by name. */
export function byRecent(exercises: readonly Exercise[]): Exercise[] {
  return exercises.toSorted(
    (a, b) => (b.lastAt ?? 0) - (a.lastAt ?? 0) || a.name.localeCompare(b.name)
  );
}

const twoPlaces = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 2,
});
const onePlace = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 1,
});
const wholes = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 1,
  notation: "compact",
});

export function weightUnit(units: UnitSystem): "kg" | "lb" {
  return units === "imperial" ? "lb" : "kg";
}

export function distanceUnit(units: UnitSystem): "km" | "mi" {
  return units === "imperial" ? "mi" : "km";
}

/** Kilograms in the gym's unit, to the hundredth. */
export function toLoad(kg: number, units: UnitSystem): number {
  const value = units === "imperial" ? kg / KG_PER_LB : kg;
  return Math.round(value * 100) / 100;
}

/** A weight typed in the gym's unit, in kilograms. */
export function fromLoad(value: number, units: UnitSystem): number {
  return units === "imperial" ? value * KG_PER_LB : value;
}

/** A weight's number alone, in the gym's unit: "82.5". */
export function formatLoad(kg: number, units: UnitSystem): string {
  return twoPlaces.format(toLoad(kg, units));
}

/** A weight with its unit: "82.5 kg". */
export function formatWeight(kg: number, units: UnitSystem): string {
  return `${formatLoad(kg, units)} ${weightUnit(units)}`;
}

/** Weight moved, short once it's big: "8,420 kg", "12.4 t", "27.4K lb". */
export function formatVolume(kg: number, units: UnitSystem): string {
  const value = units === "imperial" ? kg / KG_PER_LB : kg;
  if (value < 10_000) {
    return `${wholes.format(value)} ${weightUnit(units)}`;
  }
  return units === "imperial"
    ? `${compact.format(value)} lb`
    : `${onePlace.format(value / 1000)} t`;
}

/** Meters in the gym's unit: kilometers or miles. */
export function toDistance(meters: number, units: UnitSystem): number {
  return meters / (units === "imperial" ? METERS_PER_MILE : 1000);
}

export function fromDistance(value: number, units: UnitSystem): number {
  return value * (units === "imperial" ? METERS_PER_MILE : 1000);
}

function formatDistance(meters: number, units: UnitSystem): string {
  return `${twoPlaces.format(toDistance(meters, units))} ${distanceUnit(units)}`;
}

/** Seconds as a clock reads them: "0:45", "12:30", "1:02:03". */
export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = String(total % 60).padStart(2, "0");
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}`
    : `${minutes}:${rest}`;
}

/** Rests to pick between sets, in seconds; 0 for none. */
export const REST_CHOICES = [0, 30, 45, 60, 90, 120, 150, 180, 240, 300];

/** A rest as it's picked: "1:30", or "Off" for none. */
export function formatRest(seconds: number): string {
  return seconds === 0 ? "Off" : formatClock(seconds);
}

/** The sign a change reads with: up, down, or neither. */
export function signOf(value: number): "+" | "−" | "±" {
  if (value > 0) {
    return "+";
  }
  return value < 0 ? "−" : "±";
}

/** How a weight moved, from `before` to `after`, in the gym's unit to a tenth. */
export function weightChange(
  after: number,
  before: number,
  units: UnitSystem
): number {
  return Math.round((toLoad(after, units) - toLoad(before, units)) * 10) / 10;
}

/** A weight's move as it reads: "+1.2 kg", "−0.6 lb", "±0 kg". */
export function formatChange(by: number, units: UnitSystem): string {
  return `${signOf(by)}${Math.abs(by)} ${weightUnit(units)}`;
}

/** Seconds said short: "1h 12m", "45m", "30s". */
export function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 1) {
    return `${Math.max(0, Math.round(seconds))}s`;
  }
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const rest = minutes % 60;
  return `${Math.floor(minutes / 60)}h${rest > 0 ? ` ${rest}m` : ""}`;
}

/** A number as typed, a comma or a point before the decimals; undefined when it isn't one. */
export function parseAmount(text: string): number | undefined {
  const cleaned = text.trim().replace(",", ".");
  if (!cleaned) {
    return undefined;
  }
  const value = Number(cleaned);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

/**
 * Time as typed: "90" is seconds, "1:30" minutes and seconds, "1:02:03" with
 * hours. A point works like a colon, since phones' number pads have no colon.
 */
export function parseClock(text: string): number | undefined {
  const parts = text.trim().split(/[:.]/u);
  if (parts.length > 3 || parts.some((part) => !/^\d+$/u.test(part))) {
    return undefined;
  }
  return parts.reduce((total, part) => total * 60 + Number(part), 0);
}

/** A set in a few characters: "82.5 × 8", "+10 × 12", "12 reps", "1:30", "5 km · 25:00". */
export function formatSet(
  set: Pick<GymSet, "weight" | "reps" | "seconds" | "meters">,
  kind: ExerciseKind,
  units: UnitSystem
): string {
  const weight = set.weight ?? 0;
  const reps = set.reps ?? 0;
  switch (kind) {
    case "weight": {
      return weight > 0
        ? `${formatLoad(weight, units)} × ${reps}`
        : `${reps} reps`;
    }
    case "reps": {
      return weight > 0
        ? `+${formatLoad(weight, units)} × ${reps}`
        : `${reps} reps`;
    }
    case "time": {
      return formatClock(set.seconds ?? 0);
    }
    default: {
      return [
        set.meters ? formatDistance(set.meters, units) : undefined,
        set.seconds ? formatClock(set.seconds) : undefined,
      ]
        .filter(Boolean)
        .join(" · ");
    }
  }
}

/** A record's value as it reads: "112.5 kg", "100 kg × 8", "15 reps". */
export function formatRecord(
  record: Pick<GymRecord, "kind" | "value" | "weight" | "reps">,
  units: UnitSystem
): string {
  switch (record.kind) {
    case "e1rm":
    case "weight": {
      return formatWeight(record.value, units);
    }
    case "volume": {
      return `${formatWeight(record.weight ?? 0, units)} × ${record.reps ?? 0}`;
    }
    case "reps": {
      return `${record.value} reps`;
    }
    case "time": {
      return formatClock(record.value);
    }
    default: {
      return formatDistance(record.value, units);
    }
  }
}

/** A name for a workout started now, from the time of day. */
export function defaultTitle(now = new Date()): string {
  const hour = now.getHours();
  if (hour >= 5 && hour < 12) {
    return "Morning workout";
  }
  if (hour >= 12 && hour < 17) {
    return "Afternoon workout";
  }
  return hour >= 17 && hour < 22 ? "Evening workout" : "Night workout";
}

/** How long the workout ran, or has run so far, in seconds. */
export function workoutSeconds(
  workout: Pick<Workout, "startedAt" | "endedAt">,
  now: number
): number {
  return Math.max(0, ((workout.endedAt ?? now) - workout.startedAt) / 1000);
}

/** Seconds of rest after a set of the exercise: its own, or the gym's. */
export function restOf(exercise: Pick<Exercise, "rest">, gym: Gym): number {
  return exercise.rest ?? gym.rest;
}

/**
 * Weeks in a row with a workout, up to this week. This week, still open,
 * only adds once there's one in it, and doesn't break the run before then.
 */
export function weekStreak(
  workouts: readonly Pick<Workout, "date">[],
  today: string
): number {
  const weeks = new Set(workouts.map((workout) => weekOf(workout.date)));
  let week = weekOf(today);
  if (!weeks.has(week)) {
    week = addDays(week, -7);
  }
  let streak = 0;
  while (weeks.has(week)) {
    streak += 1;
    week = addDays(week, -7);
  }
  return streak;
}

/** What was typed in a search, as the words each exercise must have. */
export function searchWords(query: string): string[] {
  return query.trim().toLowerCase().split(/\s+/u).filter(Boolean);
}

/** Whether every word searched is in the exercise's name or one of its muscles. */
export function matchesSearch(
  exercise: Pick<Exercise, "name" | "muscles" | "secondary">,
  words: readonly string[]
): boolean {
  const text = [
    exercise.name,
    ...[...exercise.muscles, ...exercise.secondary].map(
      (muscle) => MUSCLE_INFO[muscle].label
    ),
  ]
    .join(" ")
    .toLowerCase();
  return words.every((word) => text.includes(word));
}
