import type { LucideIcon } from "lucide-react";
import {
  BitcoinIcon,
  CalendarCheckIcon,
  DumbbellIcon,
  FileTextIcon,
  HardDriveUploadIcon,
  NotebookPenIcon,
  PlusIcon,
  SquareKanbanIcon,
  SwatchBookIcon,
  Table2Icon,
  WalletIcon,
} from "lucide-react";

import { SplitButton } from "@/components/split-button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

/** What a project can hold. Habits, the log and the gym are kept only in personal projects. */
export type ProjectItem =
  | "board"
  | "table"
  | "page"
  | "files"
  | "portfolio"
  | "account"
  | "brand"
  | "habit"
  | "log"
  | "gym";

const ITEMS: {
  kind: ProjectItem;
  label: string;
  description: string;
  icon: LucideIcon;
  personalOnly?: boolean;
}[] = [
  {
    description: "Plan work as cards, with sprints if you want them.",
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
    description: "Keep PDFs, photos, videos and more in the project’s Drive.",
    icon: HardDriveUploadIcon,
    kind: "files",
    label: "Files",
  },
  {
    description: "Track bitcoin bought and sold, and what it’s worth.",
    icon: BitcoinIcon,
    kind: "portfolio",
    label: "Portfolio",
  },
  {
    description: "Follow money going out and coming in, month by month.",
    icon: WalletIcon,
    kind: "account",
    label: "Finance account",
  },
  {
    description: "Keep logos, colors and type in one place, ready to share.",
    icon: SwatchBookIcon,
    kind: "brand",
    label: "Brand",
  },
  {
    description: "Do something every day, or on the days you pick.",
    icon: CalendarCheckIcon,
    kind: "habit",
    label: "Habit",
    personalOnly: true,
  },
  {
    description: "Log what you worked on each day, with a tap.",
    icon: NotebookPenIcon,
    kind: "log",
    label: "Log topic",
    personalOnly: true,
  },
  {
    description: "Log workouts set by set, beat records, follow your weight.",
    icon: DumbbellIcon,
    kind: "gym",
    label: "Gym",
    personalOnly: true,
  },
];

/** Starts a board, or from its menu anything else a project holds. */
export function NewInProject({
  onNew,
  personal = false,
  hasGym = false,
  size,
  variant,
}: {
  onNew: (kind: ProjectItem) => void;
  /** A personal project, which offers habits, the log and the gym too. */
  personal?: boolean;
  /** The project has its gym already, which there's one of. */
  hasGym?: boolean;
  size?: "default" | "sm";
  variant?: "default" | "outline";
}) {
  const items = ITEMS.filter(
    (item) =>
      (personal || !item.personalOnly) && !(item.kind === "gym" && hasGym)
  );
  return (
    <SplitButton
      menu={items.map(({ kind, label, description, icon: Icon }) => (
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
