/** Habits: what both the server and the app know about them. */

/** What a habit can show as its icon, by name. */
export const HABIT_ICONS = [
  "check",
  "run",
  "bike",
  "dumbbell",
  "stretch",
  "water",
  "apple",
  "salad",
  "pill",
  "sleep",
  "sun",
  "moon",
  "book",
  "pen",
  "brain",
  "code",
  "music",
  "languages",
  "heart",
  "sprout",
  "piggy",
  "bitcoin",
  "phoneOff",
  "smokeOff",
  "teeth",
  "shower",
  "swim",
  "hike",
  "pet",
  "cook",
  "clean",
  "alcoholOff",
] as const;

export type HabitIcon = (typeof HABIT_ICONS)[number];

/** Days of the week as `getDay` numbers them: Sunday is 0. */
export const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;

export const MAX_HABIT_TITLE = 80;
export const MAX_HABIT_DESCRIPTION = 500;
/** Times a day a habit can ask for, like glasses of water. */
export const MAX_GOAL = 99;
export const MAX_HABITS = 50;

/** `YYYY-MM-DD`, the way habit days are named. */
const DATE = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/u;
const DAY_MS = 86_400_000;

function toUtc(date: string): number {
  const [year = 0, month = 1, day = 1] = date.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

function fromUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Whether the value is a real day, February 30th not included. */
export function isDay(value: string): boolean {
  return DATE.test(value) && fromUtc(toUtc(value)) === value;
}

/** The day `by` days after `date`, or before it when negative. */
export function addDays(date: string, by: number): string {
  return fromUtc(toUtc(date) + by * DAY_MS);
}

/** Its day of the week, Sunday as 0. */
export function weekdayOf(date: string): number {
  return new Date(toUtc(date)).getUTCDay();
}

/** Whether the habit is due on that day of the week. */
export function isDue(habit: { days: readonly number[] }, date: string) {
  return habit.days.includes(weekdayOf(date));
}

/** Whether a day's count meets the goal. */
export function isDone(count: number, goal: number): boolean {
  return count >= goal;
}

/**
 * Counts the days in a row a habit was done, up to `today`, fed its logged
 * days newest first. A day it isn't due doesn't break the run, and counts
 * when it was done anyway. Today, still open, only adds once it's done.
 */
export class Streak {
  days = 0;
  private readonly habit: { days: readonly number[]; goal: number };
  private readonly today: string;
  /** The day the next log is checked against, walking back from today. */
  private day: string;
  private ended = false;

  constructor(habit: { days: readonly number[]; goal: number }, today: string) {
    this.habit = habit;
    this.today = today;
    this.day = today;
  }

  /** Whether a day that went by without the habit ends the run. */
  private breaks(date: string): boolean {
    return date !== this.today && isDue(this.habit, date);
  }

  /** Takes the next logged day back; false once the run has ended, so the rest can go unread. */
  add(log: { date: string; count: number }): boolean {
    if (this.ended || log.date > this.today) {
      return !this.ended;
    }
    while (this.day > log.date) {
      if (this.breaks(this.day)) {
        this.ended = true;
        return false;
      }
      this.day = addDays(this.day, -1);
    }
    if (isDone(log.count, this.habit.goal)) {
      this.days += 1;
    } else if (this.breaks(this.day)) {
      this.ended = true;
      return false;
    }
    this.day = addDays(this.day, -1);
    return true;
  }
}
