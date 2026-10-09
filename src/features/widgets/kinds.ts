import { BITCOIN_PRICE } from "@/features/widgets/bitcoin-widget";
import { FINANCE } from "@/features/widgets/finance-widget";
import { MY_TASKS } from "@/features/widgets/tasks-widget";
import type { WidgetKind } from "@/features/widgets/widget-kind";
import type { SettingsOf, WidgetSettings, WidgetType } from "@/lib/widgets";

/** Every kind of widget, in the order they're offered. */
export const WIDGET_KINDS: { [T in WidgetType]: WidgetKind<SettingsOf<T>> } = {
  bitcoinPrice: BITCOIN_PRICE,
  finance: FINANCE,
  myTasks: MY_TASKS,
};

/** The kind that `settings` belong to, typed to them. */
export function kindOf<S extends WidgetSettings>(settings: S): WidgetKind<S> {
  // Each kind is filed under its own type, so it takes exactly these settings.
  return WIDGET_KINDS[settings.type] as unknown as WidgetKind<S>;
}
