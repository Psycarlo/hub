import type { LucideIcon } from "lucide-react";
import type { ComponentType } from "react";

import type { Color } from "@/lib/palette";
import type { WidgetSettings } from "@/lib/widgets";

/** One way to start a widget, offered beside its kind where widgets are picked. */
export interface WidgetPreset<S extends WidgetSettings> {
  name: string;
  description: string;
  /** A small likeness of it, in place of the kind's icon. */
  Preview: ComponentType;
  settings: S;
}

/**
 * One kind of widget. The card around it is shared: its surface, dragging,
 * the settings button and removing it. A kind brings what goes inside the
 * card and the controls for its settings, which the card saves as they change.
 */
export interface WidgetKind<S extends WidgetSettings> {
  name: string;
  /** A line under its name where widgets are picked. */
  description: string;
  icon: LucideIcon;
  color: Color;
  /** What a new widget of this kind starts with. */
  defaults: S;
  /** Ways to start one, picked from a menu of their own; without, it starts from `defaults`. */
  presets?: readonly WidgetPreset<S>[];
  /** The card's heading, when its settings say more than the kind's name, like a clock's city. */
  title?: (settings: S) => string;
  Body: ComponentType<{ settings: S }>;
  Settings: ComponentType<{ settings: S; onChange: (settings: S) => void }>;
}
