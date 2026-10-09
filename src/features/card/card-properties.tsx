import { cn } from "cn";
import { format, isBefore, parseISO, startOfToday } from "date-fns";
import { ChevronDownIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useBoard } from "@/features/board/board-context";
import {
  assignable,
  cardLabels,
  inOfferedOrder,
  sprintChoices,
} from "@/features/card/card-fields";
import type { Option } from "@/features/card/card-options";
import {
  PRIORITY_OPTIONS,
  sprintOptions,
  statusOptions,
  useOptionShortcuts,
} from "@/features/card/card-options";
import { LabelChip, Muted, People, Person } from "@/features/card/card-parts";
import { LabelPicker } from "@/features/card/label-picker";
import { updateCard } from "@/lib/actions";
import type { BoardLabel, Card, CardFields, UserId } from "@/lib/model";
import { isClosed } from "@/lib/model";

const NAME = "font-normal text-muted-foreground";
const VALUE =
  "h-8 w-full rounded-lg px-2 hover:bg-foreground/5 data-popup-open:bg-foreground/5";
const SELECT_VALUE = cn(
  VALUE,
  "border-transparent bg-transparent dark:bg-transparent"
);
const GRID =
  "grid grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-x-2 gap-y-0.5 self-start";

function labelOf<T>(options: Option<T>[], value: T): ReactNode {
  return options.find((option) => option.value === value)?.label;
}

function isOverdue(card: Card): boolean {
  return (
    card.due !== undefined &&
    !isClosed(card.status) &&
    isBefore(parseISO(card.due), startOfToday())
  );
}

interface PropertySelectProps<T> {
  id: string;
  label: string;
  value: T;
  options: Option<T>[];
  onChange: (value: T | null) => void;
}

function PropertySelect<T>({
  id,
  label,
  value,
  options,
  onChange,
}: PropertySelectProps<T>) {
  const { onKeyDown, ...open } = useOptionShortcuts(options, onChange);
  return (
    <>
      <Label className={NAME} htmlFor={id}>
        {label}
      </Label>
      <Select {...open} items={options} onValueChange={onChange} value={value}>
        <SelectTrigger className={SELECT_VALUE} id={id}>
          <SelectValue className="items-center gap-2" />
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
    </>
  );
}

function Assignees({
  id,
  people,
  value,
  onChange,
}: {
  id: string;
  people: UserId[];
  value: UserId[];
  onChange: (assignees: UserId[]) => void;
}) {
  return (
    <>
      <Label className={NAME} htmlFor={id}>
        Assignees
      </Label>
      <Select
        multiple
        onValueChange={(next: string[]) =>
          onChange(inOfferedOrder(people, next))
        }
        value={value}
      >
        <SelectTrigger className={SELECT_VALUE} id={id}>
          <SelectValue className="items-center gap-2">
            {(current: string[]) => <People people={current} />}
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
    </>
  );
}

function DueDate({
  id,
  card,
  onChange,
}: {
  id: string;
  card: Card;
  onChange: (due: string | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const date = card.due ? parseISO(card.due) : undefined;
  const overdue = isOverdue(card);

  const pick = (day?: Date) => {
    onChange(day && format(day, "yyyy-MM-dd"));
    setOpen(false);
  };

  return (
    <>
      <Label className={NAME} htmlFor={id}>
        Due date
      </Label>
      <Popover onOpenChange={setOpen} open={open}>
        <PopoverTrigger
          className={cn(
            VALUE,
            "focus-visible:ring-ring/50 flex items-center justify-between gap-2 text-left text-sm transition-colors outline-none select-none focus-visible:ring-3",
            overdue && "text-destructive"
          )}
          id={id}
        >
          {date ? format(date, "MMM d, yyyy") : <Muted>No due date</Muted>}
          <ChevronDownIcon className="text-muted-foreground size-4 shrink-0" />
        </PopoverTrigger>
        <PopoverContent align="start" className="flex flex-col gap-1 p-2">
          <Calendar
            defaultMonth={date}
            mode="single"
            onSelect={pick}
            selected={date}
          />
          {date && (
            <Button onClick={() => pick()} size="sm" variant="ghost">
              Clear
            </Button>
          )}
        </PopoverContent>
      </Popover>
    </>
  );
}

function LabelChips({ labels }: { labels: BoardLabel[] }) {
  return labels.length > 0 ? (
    <span className="flex min-w-0 flex-wrap gap-1">
      {labels.map((label) => (
        <LabelChip key={label.id} label={label} />
      ))}
    </span>
  ) : (
    <Muted>No labels</Muted>
  );
}

function Labels({
  id,
  card,
  onChange,
}: {
  id: string;
  card: Card;
  onChange: (labels: string[]) => void;
}) {
  const { content } = useBoard();
  return (
    <>
      <Label className={cn(NAME, "self-start leading-8")} htmlFor={id}>
        Labels
      </Label>
      <LabelPicker
        className={cn(
          VALUE,
          "focus-visible:ring-ring/50 flex h-auto min-h-8 items-center justify-between gap-2 py-1.5 text-left text-sm transition-colors outline-none select-none focus-visible:ring-3"
        )}
        id={id}
        onChange={onChange}
        value={card.labels}
      >
        <LabelChips labels={cardLabels(content.labels, card.labels)} />
        <ChevronDownIcon className="text-muted-foreground size-4 shrink-0" />
      </LabelPicker>
    </>
  );
}

function Property({
  label,
  children,
  wraps = false,
}: {
  label: string;
  children: ReactNode;
  /** Whether the value may run onto more lines. */
  wraps?: boolean;
}) {
  return (
    <>
      <dt
        className={cn(
          "text-sm select-none",
          NAME,
          wraps && "self-start leading-8"
        )}
      >
        {label}
      </dt>
      <dd
        className={cn(
          "flex h-8 min-w-0 items-center gap-2 px-2 text-sm [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
          wraps && "h-auto min-h-8 py-1.5"
        )}
      >
        {children}
      </dd>
    </>
  );
}

/** The properties as text, for viewers of the board. */
function PropertyList({ card, className }: { card: Card; className?: string }) {
  const { board, content } = useBoard();
  const sprints = sprintOptions(sprintChoices(content.sprints, card.sprintId));
  const statuses = statusOptions(board.statuses, card.status);
  return (
    <dl className={cn(GRID, className)}>
      <Property label="Status">{labelOf(statuses, card.status)}</Property>
      <Property label="Assignees">
        <People people={card.assignees} />
      </Property>
      <Property label="Priority">
        {labelOf(PRIORITY_OPTIONS, card.priority ?? null)}
      </Property>
      {board.usesSprints && (
        <Property label="Sprint">
          {labelOf(sprints, card.sprintId ?? null) ?? labelOf(sprints, null)}
        </Property>
      )}
      <Property label="Due date">
        {card.due ? (
          <span className={cn(isOverdue(card) && "text-destructive")}>
            {format(parseISO(card.due), "MMM d, yyyy")}
          </span>
        ) : (
          <Muted>No due date</Muted>
        )}
      </Property>
      <Property label="Labels" wraps>
        <LabelChips labels={cardLabels(content.labels, card.labels)} />
      </Property>
    </dl>
  );
}

export function CardProperties({
  card,
  className,
}: {
  card: Card;
  className?: string;
}) {
  const id = useId();
  const { board, canEdit, content, people } = useBoard();
  const save = (changes: Partial<CardFields>) => updateCard(card, changes);
  const sprints = sprintChoices(content.sprints, card.sprintId);

  if (!canEdit) {
    return <PropertyList card={card} className={className} />;
  }

  return (
    <div className={cn(GRID, className)}>
      <PropertySelect
        id={`${id}-status`}
        label="Status"
        onChange={(status) => {
          if (status) {
            save({ status });
          }
        }}
        options={statusOptions(board.statuses, card.status)}
        value={card.status}
      />
      <Assignees
        id={`${id}-assignees`}
        onChange={(assignees) => save({ assignees })}
        people={assignable(people, card.assignees)}
        value={card.assignees}
      />
      <PropertySelect
        id={`${id}-priority`}
        label="Priority"
        onChange={(priority) => save({ priority: priority ?? undefined })}
        options={PRIORITY_OPTIONS}
        value={card.priority ?? null}
      />
      {board.usesSprints && (
        <PropertySelect
          id={`${id}-sprint`}
          label="Sprint"
          onChange={(sprint) =>
            save({
              sprintId: sprints.find((item) => item._id === sprint)?._id,
            })
          }
          options={sprintOptions(sprints)}
          value={
            sprints.find((sprint) => sprint._id === card.sprintId)?._id ?? null
          }
        />
      )}
      <DueDate card={card} id={`${id}-due`} onChange={(due) => save({ due })} />
      <Labels
        card={card}
        id={`${id}-labels`}
        onChange={(labels) => save({ labels })}
      />
    </div>
  );
}
