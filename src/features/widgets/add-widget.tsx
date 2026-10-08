import { Grid2x2PlusIcon } from "lucide-react";

import { IconButton } from "@/components/icon-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { WIDGET_KINDS } from "@/features/widgets/kinds";
import { WidgetIcon } from "@/features/widgets/widget-parts";
import { addWidget } from "@/lib/widget-actions";
import { MAX_WIDGETS } from "@/lib/widgets";

const KINDS = Object.values(WIDGET_KINDS);

/** Puts a widget on the home, picked from every kind there is. */
export function AddWidget({ count }: { count: number }) {
  const full = count >= MAX_WIDGETS;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <IconButton className="text-muted-foreground" label="Add widget" />
        }
      >
        <Grid2x2PlusIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Add a widget</DropdownMenuLabel>
          {KINDS.map((kind) => (
            <DropdownMenuItem
              className="gap-3"
              disabled={full}
              key={kind.defaults.type}
              onClick={() => addWidget(kind.defaults)}
            >
              <WidgetIcon color={kind.color} icon={kind.icon} />
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-medium">{kind.name}</span>
                <span className="text-muted-foreground truncate text-xs">
                  {kind.description}
                </span>
              </span>
            </DropdownMenuItem>
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
