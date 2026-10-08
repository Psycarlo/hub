import type { Doc } from "@convex/_generated/dataModel";
import type { WidgetSettings } from "@convex/lib/validators";

export type { WidgetSettings } from "@convex/lib/validators";
export { MAX_WIDGETS, TIMEFRAMES } from "@convex/shared/widgets";
export type { Timeframe } from "@convex/shared/widgets";

export type Widget = Doc<"widgets">;

/** Each kind of widget, by the name its settings go by. */
export type WidgetType = WidgetSettings["type"];

/** The settings of one kind of widget. */
export type SettingsOf<T extends WidgetType> = Extract<
  WidgetSettings,
  { type: T }
>;
