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

/** Widgets one person can keep on their home. */
export const MAX_WIDGETS = 12;
