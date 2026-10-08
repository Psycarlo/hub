import { KeyboardSensor, PointerSensor } from "@dnd-kit/react";
import { useSortable } from "@dnd-kit/react/sortable";
import { Settings2Icon, Trash2Icon } from "lucide-react";
import type { HTMLMotionProps } from "motion/react";
import { motion } from "motion/react";
import { useId, useState } from "react";

import { IconButton } from "@/components/icon-button";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { kindOf } from "@/features/widgets/kinds";
import { WidgetIcon } from "@/features/widgets/widget-parts";
import { removeWidget, updateWidget } from "@/lib/widget-actions";
import type { Widget } from "@/lib/widgets";

/**
 * While a widget is dragged, dnd-kit leaves a hidden copy where it will land;
 * it shows as an empty dashed slot. dnd-kit mirrors the dragged card's inline
 * styles onto that copy, so the slot overrides the tilt to stay upright.
 */
const SURFACE =
  "group/widget bg-card shadow-surface flex flex-col gap-3 rounded-2xl p-5 outline-none select-none transition-shadow duration-150 ease-out [-webkit-touch-callout:none] focus-visible:ring-3 focus-visible:ring-ring/50 data-dnd-dragging:shadow-raised data-dnd-placeholder:visible! data-dnd-placeholder:rotate-none! data-dnd-placeholder:bg-foreground/[0.03] data-dnd-placeholder:shadow-none data-dnd-placeholder:outline-2 data-dnd-placeholder:-outline-offset-2 data-dnd-placeholder:outline-foreground/15 data-dnd-placeholder:outline-dashed data-dnd-placeholder:*:invisible";

/**
 * A widget is picked up by pointer from anywhere on it, or with Space or Enter
 * while it has focus. A finger or pen on a slider, like a chart, moves along
 * the slider instead.
 */
const SENSORS = [
  PointerSensor.configure({
    preventActivation: (event, source) =>
      (event.pointerType !== "mouse" &&
        event.target instanceof Element &&
        event.target.closest('[role="slider"]') !== null) ||
      (PointerSensor.defaults.preventActivation?.(event, source) ?? false),
  }),
  KeyboardSensor,
];

/** The widget's settings, from a button in its corner, and removing it. */
function WidgetSettings({ widget }: { widget: Widget }) {
  const [open, setOpen] = useState(false);
  const { Settings, name } = kindOf(widget.settings);
  const label = `${name} settings`;
  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger
        render={
          <IconButton
            className="-mr-1.5 ml-auto opacity-0 group-focus-within/widget:opacity-100 group-hover/widget:opacity-100 data-popup-open:opacity-100 pointer-coarse:opacity-100"
            label={label}
          />
        }
      >
        <Settings2Icon />
      </PopoverTrigger>
      <PopoverContent
        align="end"
        aria-label={label}
        className="flex w-72 flex-col gap-4"
      >
        <Settings
          onChange={(settings) => updateWidget(widget, settings)}
          settings={widget.settings}
        />
        <div className="-mx-3 -mb-3 border-t p-1.5">
          <Button
            className="text-destructive hover:bg-destructive/10 hover:text-destructive w-full justify-start rounded-lg px-2"
            onClick={() => {
              setOpen(false);
              removeWidget(widget);
            }}
            size="sm"
            variant="ghost"
          >
            <Trash2Icon />
            Remove widget
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface WidgetCardProps extends Pick<
  HTMLMotionProps<"div">,
  "exit" | "variants"
> {
  widget: Widget;
  /** Its place among the widgets, as dragging has them. */
  index: number;
}

/**
 * A widget on the home: its kind's content, in a card to drag, set up or
 * remove. It animates in and out of the grid itself, with no wrapper: dnd-kit
 * only keeps a dragged card afloat when the card is what moves in the grid.
 */
export function WidgetCard({ widget, index, exit, variants }: WidgetCardProps) {
  const { ref } = useSortable({
    accept: "widget",
    group: "widgets",
    id: widget._id,
    index,
    sensors: SENSORS,
    type: "widget",
  });
  const titleId = useId();
  const { Body, color, icon, name } = kindOf(widget.settings);
  return (
    <motion.div
      aria-labelledby={titleId}
      className={SURFACE}
      exit={exit}
      ref={ref}
      // dnd-kit turns draggables without a role into buttons; this one holds controls.
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
      role="group"
      variants={variants}
    >
      <div className="flex items-center gap-3">
        <WidgetIcon color={color} icon={icon} />
        <h3 className="min-w-0 truncate text-sm font-medium" id={titleId}>
          {name}
        </h3>
        <WidgetSettings widget={widget} />
      </div>
      <Body settings={widget.settings} />
    </motion.div>
  );
}
