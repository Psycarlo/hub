import type { LucideIcon } from "lucide-react";
import type { ComponentType } from "react";

import type { Color } from "@/lib/palette";
import type { WidgetSettings } from "@/lib/widgets";

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
  Body: ComponentType<{ settings: S }>;
  Settings: ComponentType<{ settings: S; onChange: (settings: S) => void }>;
}
