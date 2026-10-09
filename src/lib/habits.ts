import type { Doc } from "@convex/_generated/dataModel";

export {
  HABIT_ICONS,
  MAX_GOAL,
  MAX_HABIT_TITLE,
  WEEKDAYS,
  addDays,
  isDone,
  isDue,
  weekdayOf,
} from "@convex/shared/habits";
export type { HabitIcon } from "@convex/shared/habits";
export type { HabitDay, HabitStreak } from "@convex/habits";

export type Habit = Doc<"habits">;

/** Weekdays in the order the app lays them out, Monday first. */
export const WEEK = [1, 2, 3, 4, 5, 6, 0] as const;

const WORKWEEK = [1, 2, 3, 4, 5];
const WEEKEND = [0, 6];
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function same(days: readonly number[], set: readonly number[]): boolean {
  return days.length === set.length && set.every((day) => days.includes(day));
}

/** The days a habit is due, said short: "Every day", "Weekdays", "Mon, Wed, Fri". */
export function scheduleLabel(days: readonly number[]): string {
  if (days.length === 7) {
    return "Every day";
  }
  if (same(days, WORKWEEK)) {
    return "Weekdays";
  }
  if (same(days, WEEKEND)) {
    return "Weekends";
  }
  return WEEK.filter((day) => days.includes(day))
    .map((day) => DAY_NAMES[day])
    .join(", ");
}

/** How the habit runs, in a line: its days, and its goal when it's more than once. */
export function describeHabit(habit: Pick<Habit, "days" | "goal">): string {
  const days = scheduleLabel(habit.days);
  return habit.goal > 1 ? `${days} · ${habit.goal} times` : days;
}

/**
 * What a tap on the habit's button makes of the day: one more, up to the
 * goal; once there, the last one taken back.
 */
export function nextCount(count: number, goal: number): number {
  return count >= goal ? goal - 1 : count + 1;
}
