import type { LucideIcon } from "lucide-react";
import {
  BitcoinIcon,
  FileTextIcon,
  PlusIcon,
  SquareKanbanIcon,
  Table2Icon,
} from "lucide-react";

import { SplitButton } from "@/components/split-button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

/** What a project can hold. */
export type ProjectItem = "board" | "table" | "page" | "portfolio";

const ITEMS: {
  kind: ProjectItem;
  label: string;
  description: string;
  icon: LucideIcon;
}[] = [
  {
    description: "Plan work as cards, with a backlog and sprints.",
    icon: SquareKanbanIcon,
    kind: "board",
    label: "Board",
  },
  {
    description: "Track merchants, deals or contacts, with your own stages.",
    icon: Table2Icon,
    kind: "table",
    label: "CRM table",
  },
  {
    description: "Write down how the team works, in pages inside pages.",
    icon: FileTextIcon,
    kind: "page",
    label: "Page",
  },
  {
    description: "Track bitcoin bought and sold, and what it’s worth.",
    icon: BitcoinIcon,
    kind: "portfolio",
    label: "Portfolio",
  },
];

/** Starts a board, or from its menu anything else a project holds. */
export function NewInProject({
  onNew,
  size,
  variant,
}: {
  onNew: (kind: ProjectItem) => void;
  size?: "default" | "sm";
  variant?: "default" | "outline";
}) {
  return (
    <SplitButton
      menu={ITEMS.map(({ kind, label, description, icon: Icon }) => (
        <DropdownMenuItem
          className="items-start gap-3 py-2"
          key={kind}
          onClick={() => onNew(kind)}
        >
          <Icon aria-hidden className="text-muted-foreground mt-0.5" />
          <span className="flex flex-col gap-0.5">
            <span className="font-medium">{label}</span>
            <span className="text-muted-foreground text-xs">{description}</span>
          </span>
        </DropdownMenuItem>
      ))}
      menuLabel="More to create"
      onClick={() => onNew("board")}
      size={size}
      variant={variant}
    >
      <PlusIcon />
      New board
    </SplitButton>
  );
}
