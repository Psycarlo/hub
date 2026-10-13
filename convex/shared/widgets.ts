/** Widgets on the home page: what both the server and the app know about them. */

/** How far back a widget's chart reaches, shortest first. */
export const TIMEFRAMES = ["1h", "24h", "7d", "30d", "1y"] as const;

export type Timeframe = (typeof TIMEFRAMES)[number];

/** Which of someone's tasks they keep an eye on: all still open, or only those under way. */
export const TASK_SCOPES = ["open", "started"] as const;

export type TaskScope = (typeof TASK_SCOPES)[number];

/** What puts a task first, in the order they're offered. */
export const TASK_SORTS = ["priority", "due", "updated"] as const;

export type TaskSort = (typeof TASK_SORTS)[number];

/** A new My tasks widget, which everyone's home also starts with. */
export const MY_TASKS_DEFAULTS = {
  scope: "open",
  sort: "priority",
  type: "myTasks",
} as const;

/** A new Finance widget, following every account in the total. */
export const FINANCE_DEFAULTS = { type: "finance" } as const;

/** A new Habits widget, listing every habit in the person's own project. */
export const HABITS_DEFAULTS = { type: "habits" } as const;

/** A new Worked on widget, showing today in the person's own log. */
export const LOG_DEFAULTS = { type: "log" } as const;

/** A new Gym widget: the week so far, or the workout under way. */
export const GYM_DEFAULTS = { type: "gym" } as const;

/** A new Weight widget, following the person’s body weight. */
export const BODY_WEIGHT_DEFAULTS = { type: "bodyWeight" } as const;

/** How a clock shows the time: in numerals, or with hands on a face. */
export const CLOCK_LOOKS = ["digital", "analog"] as const;

export type ClockLook = (typeof CLOCK_LOOKS)[number];

/** Whether a clock counts the hours to 12 or to 24. */
export const HOUR_CYCLES = ["12h", "24h"] as const;

export type HourCycle = (typeof HOUR_CYCLES)[number];

/** A new Clock widget, keeping the person's own time until they pick a zone. */
export const CLOCK_DEFAULTS = { look: "digital", type: "clock" } as const;

/** Widgets one person can keep on their home. */
export const MAX_WIDGETS = 12;

/** Kinds a home can hold several of, like clocks for different cities; of the rest, one each. */
const REPEATABLE: ReadonlySet<string> = new Set(["clock"]);

export function isRepeatable(type: string): boolean {
  return REPEATABLE.has(type);
}
