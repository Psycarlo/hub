import type { Doc } from "@convex/_generated/dataModel";
import type { WidgetSettings } from "@convex/lib/validators";

export type { WidgetSettings } from "@convex/lib/validators";
export {
  FINANCE_DEFAULTS,
  HABITS_DEFAULTS,
  MAX_WIDGETS,
  MY_TASKS_DEFAULTS,
  TASK_SCOPES,
  TASK_SORTS,
  TIMEFRAMES,
} from "@convex/shared/widgets";
export type { TaskScope, TaskSort, Timeframe } from "@convex/shared/widgets";

export type Widget = Doc<"widgets">;

/** Each kind of widget, by the name its settings go by. */
export type WidgetType = WidgetSettings["type"];

/** The settings of one kind of widget. */
export type SettingsOf<T extends WidgetType> = Extract<
  WidgetSettings,
  { type: T }
>;
