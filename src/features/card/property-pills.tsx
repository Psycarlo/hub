import { cn } from "cn";
import type { LucideIcon } from "lucide-react";
import { TagIcon, UserRoundIcon } from "lucide-react";
import type { ReactNode } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cardLabels, inOfferedOrder } from "@/features/card/card-fields";
import type { Option } from "@/features/card/card-options";
import { useOptionShortcuts } from "@/features/card/card-options";
import { LabelDot, People, Person } from "@/features/card/card-parts";
import type { BoardLabel, UserId } from "@/lib/model";

const PILL =
  "h-7 w-auto max-w-56 gap-1.5 rounded-full border-transparent bg-foreground/5 px-2.5 text-xs font-medium hover:bg-foreground/10 data-popup-open:bg-foreground/10 dark:bg-foreground/5 dark:hover:bg-foreground/10 [&_svg:not([class*='size-'])]:size-3.5";
// Select triggers end with a chevron; pills read as buttons without it.
const PILL_SELECT = cn(PILL, "[&>svg:last-child]:hidden");
/** A pill that opens a popover rather than a select. */
export const PILL_BUTTON = cn(
  PILL,
  "focus-visible:ring-ring/50 flex items-center transition-colors outline-none focus-visible:ring-3"
);

/** What an empty pill shows: the property's icon and name. */
export function Placeholder({
  icon: Icon,
  children,
}: {
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <span className="text-muted-foreground flex items-center gap-1.5">
      <Icon aria-hidden />
      {children}
    </span>
  );
}

interface PillSelectProps<T> {
  label: string;
  icon: LucideIcon;
  value: T | null;
  options: Option<T | null>[];
  onChange: (value: T | null) => void;
}

export function PillSelect<T>({
  label,
  icon,
  value,
  options,
  onChange,
}: PillSelectProps<T>) {
  const { onKeyDown, ...open } = useOptionShortcuts(options, onChange);
  return (
    <Select {...open} onValueChange={onChange} value={value}>
      <SelectTrigger aria-label={label} className={PILL_SELECT}>
        <SelectValue className="items-center gap-1.5">
          {(current: T | null) =>
            current === null ? (
              <Placeholder icon={icon}>{label}</Placeholder>
            ) : (
              options.find((option) => option.value === current)?.label
            )
          }
        </SelectValue>
      </SelectTrigger>
      <SelectContent onKeyDown={onKeyDown}>
        {options.map((option) => (
          <SelectItem
            key={String(option.value)}
            shortcut={option.shortcut}
            value={option.value}
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function AssigneesPill({
  people,
  value,
  onChange,
}: {
  people: UserId[];
  value: UserId[];
  onChange: (assignees: UserId[]) => void;
}) {
  return (
    <Select
      multiple
      onValueChange={(next: string[]) => onChange(inOfferedOrder(people, next))}
      value={value}
    >
      <SelectTrigger aria-label="Assignees" className={PILL_SELECT}>
        <SelectValue className="items-center gap-1.5">
          {(current: string[]) =>
            current.length === 0 ? (
              <Placeholder icon={UserRoundIcon}>Assignees</Placeholder>
            ) : (
              <People people={current} />
            )
          }
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {people.map((userId) => (
          <SelectItem key={userId} value={userId}>
            <Person userId={userId} />
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** The labels picked, as their dots and names. */
export function PickedLabels({ labels }: { labels: BoardLabel[] }) {
  if (labels.length === 0) {
    return <Placeholder icon={TagIcon}>Labels</Placeholder>;
  }
  return (
    <>
      <span className="flex -space-x-0.5">
        {labels.map((label) => (
          <LabelDot className="size-2.5" color={label.color} key={label.id} />
        ))}
      </span>
      <span className="truncate">
        {labels.map((label) => label.name).join(", ")}
      </span>
    </>
  );
}

/** Picks from the labels given, where no new one can be made on the spot. */
export function LabelsSelectPill({
  labels,
  value,
  onChange,
}: {
  labels: BoardLabel[];
  value: string[];
  onChange: (labels: string[]) => void;
}) {
  return (
    <Select
      multiple
      onValueChange={(next: string[]) =>
        onChange(cardLabels(labels, next).map(({ id }) => id))
      }
      value={value}
    >
      <SelectTrigger aria-label="Labels" className={PILL_SELECT}>
        <SelectValue className="items-center gap-1.5">
          {(current: string[]) => (
            <PickedLabels labels={cardLabels(labels, current)} />
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {labels.map((label) => (
          <SelectItem key={label.id} value={label.id}>
            <LabelDot color={label.color} />
            <span className="truncate">{label.name}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
