import { cn } from "cn";
import { CheckIcon, Grid2x2PlusIcon } from "lucide-react";

import { IconButton } from "@/components/icon-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { titleOf, WIDGET_KINDS } from "@/features/widgets/kinds";
import { openWidgetSettings } from "@/features/widgets/widget-card";
import type { WidgetKind } from "@/features/widgets/widget-kind";
import { WidgetIcon } from "@/features/widgets/widget-parts";
import { addWidget } from "@/lib/widget-actions";
import type { Widget, WidgetSettings } from "@/lib/widgets";
import { isRepeatable, MAX_WIDGETS } from "@/lib/widgets";

// Each kind takes its own settings; here they're only read, and added as they are.
const KINDS = Object.values(
  WIDGET_KINDS
) as unknown as WidgetKind<WidgetSettings>[];

const NO_WIDGETS: Widget[] = [];

/**
 * Adds a widget. Another of a kind already on the home is the same as the
 * first until it's set apart, like a clock for a second city, so its settings
 * open as it lands.
 */
async function add(settings: WidgetSettings, alike: number) {
  const widgetId = await addWidget(settings);
  if (widgetId && alike > 0) {
    openWidgetSettings(widgetId);
  }
}

/** The line under a kind's name: what it does, or which of it the home has. */
function noteOf(
  kind: WidgetKind<WidgetSettings>,
  mine: Widget[],
  added: boolean
): string {
  if (added) {
    return "On your home";
  }
  if (mine.length > 0) {
    const titles = mine.map((widget) => titleOf(widget.settings));
    return `On your home: ${titles.join(", ")}`;
  }
  return kind.description;
}

function KindText({ name, note }: { name: string; note: string }) {
  return (
    <span className="flex min-w-0 flex-1 flex-col">
      <span className="truncate font-medium">{name}</span>
      <span className="text-muted-foreground truncate text-xs">{note}</span>
    </span>
  );
}

/**
 * One kind to add. Most go on a home once, and show as on it once they are;
 * one with ways to start opens them beside it.
 */
function KindItem({
  kind,
  mine,
  full,
}: {
  kind: WidgetKind<WidgetSettings>;
  /** The widgets of this kind on the home. */
  mine: Widget[];
  full: boolean;
}) {
  const added = !isRepeatable(kind.defaults.type) && mine.length > 0;
  const text = (
    <>
      <WidgetIcon color={kind.color} icon={kind.icon} />
      <KindText name={kind.name} note={noteOf(kind, mine, added)} />
    </>
  );
  if (kind.presets && !added) {
    return (
      <DropdownMenuSub>
        <DropdownMenuSubTrigger className="gap-3" disabled={full}>
          {text}
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="w-60">
          <DropdownMenuGroup>
            <DropdownMenuLabel>New {kind.name.toLowerCase()}</DropdownMenuLabel>
            {kind.presets.map(({ Preview, description, name, settings }) => (
              <DropdownMenuItem
                className="gap-3"
                key={name}
                onClick={() => add(settings, mine.length)}
              >
                <Preview />
                <KindText name={name} note={description} />
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    );
  }
  return (
    <DropdownMenuItem
      // One already added isn’t dimmed: it’s on the home, not out of reach.
      className={cn("gap-3", added && "data-disabled:opacity-100")}
      disabled={full || added}
      onClick={() => add(kind.defaults, mine.length)}
    >
      {text}
      {added && <CheckIcon aria-hidden className="text-muted-foreground" />}
    </DropdownMenuItem>
  );
}

/** Puts a widget on the home, picked from every kind there is, and shows which are on it. */
export function AddWidget({ widgets = NO_WIDGETS }: { widgets?: Widget[] }) {
  const full = widgets.length >= MAX_WIDGETS;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <IconButton className="text-muted-foreground" label="Add widget" />
        }
      >
        <Grid2x2PlusIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex items-center justify-between gap-2">
            Add a widget
            <span className="font-normal tabular-nums">
              {widgets.length} of {MAX_WIDGETS}
            </span>
          </DropdownMenuLabel>
          {KINDS.map((kind) => (
            <KindItem
              full={full}
              key={kind.defaults.type}
              kind={kind}
              mine={widgets.filter(
                (widget) => widget.settings.type === kind.defaults.type
              )}
            />
          ))}
        </DropdownMenuGroup>
        {full && (
          <p className="text-muted-foreground px-2 pt-1 pb-1.5 text-xs">
            Your home holds up to {MAX_WIDGETS} widgets. Remove one to add
            another.
          </p>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
