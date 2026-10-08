import { cn } from "cn";
import { format, parseISO } from "date-fns";
import type { LucideIcon } from "lucide-react";
import {
  CalendarIcon,
  ChartNoAxesColumnIcon,
  ChevronRightIcon,
  CircleDashedIcon,
  IterationCwIcon,
  TagIcon,
  UserRoundIcon,
  XIcon,
} from "lucide-react";
import type { FormEvent, KeyboardEvent, ReactNode, RefObject } from "react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { IconButton } from "@/components/icon-button";
import { MarkdownEditor } from "@/components/markdown-editor";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
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
import { Switch } from "@/components/ui/switch";
import type { BoardScope, CardPlacement } from "@/features/board/board-context";
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
  STATUS_OPTIONS,
  useOptionShortcuts,
} from "@/features/card/card-options";
import { LabelDot, People, Person } from "@/features/card/card-parts";
import { LabelPicker } from "@/features/card/label-picker";
import { useStoredDraft } from "@/hooks/use-stored-draft";
import { createCard } from "@/lib/actions";
import { readDraft, writeDraft } from "@/lib/drafts";
import type { CardFields, UserId } from "@/lib/model";
import { cardKey, rankBetween } from "@/lib/model";

export type NewCardDefaults = CardPlacement & Pick<CardFields, "assignees">;

/** What's kept of a card being written, should the dialog close before it's created. */
type Draft = Pick<
  CardFields,
  "title" | "description" | "assignees" | "priority" | "due" | "labels"
>;

const BLANK: Draft = { assignees: [], description: "", labels: [], title: "" };

function isBlank(draft: Draft): boolean {
  return draft.title.trim() === "" && draft.description.trim() === "";
}

/** One draft per person and board. */
function draftKey({ board, me }: BoardScope): string {
  return `new-card:${me}:${board._id}`;
}

const PILL =
  "h-7 w-auto max-w-56 gap-1.5 rounded-full border-transparent bg-foreground/5 px-2.5 text-xs font-medium hover:bg-foreground/10 data-popup-open:bg-foreground/10 dark:bg-foreground/5 dark:hover:bg-foreground/10 [&_svg:not([class*='size-'])]:size-3.5";
// Select triggers end with a chevron; pills read as buttons without it.
const PILL_SELECT = cn(PILL, "[&>svg:last-child]:hidden");
/** A pill that opens a popover rather than a select. */
const PILL_BUTTON = cn(
  PILL,
  "focus-visible:ring-ring/50 flex items-center transition-colors outline-none focus-visible:ring-3"
);

function Placeholder({
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

function PillSelect<T>({
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

function AssigneesPill({
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

function LabelsPill({
  value,
  onChange,
}: {
  value: string[];
  onChange: (labels: string[]) => void;
}) {
  const { content } = useBoard();
  const labels = cardLabels(content.labels, value);
  return (
    <LabelPicker
      aria-label="Labels"
      className={PILL_BUTTON}
      onChange={onChange}
      value={value}
    >
      {labels.length === 0 ? (
        <Placeholder icon={TagIcon}>Labels</Placeholder>
      ) : (
        <>
          <span className="flex -space-x-0.5">
            {labels.map((label) => (
              <LabelDot
                className="size-2.5"
                color={label.color}
                key={label.id}
              />
            ))}
          </span>
          <span className="truncate">
            {labels.map((label) => label.name).join(", ")}
          </span>
        </>
      )}
    </LabelPicker>
  );
}

function DuePill({
  value,
  onChange,
}: {
  value?: string;
  onChange: (due: string | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const date = value ? parseISO(value) : undefined;

  const pick = (day?: Date) => {
    onChange(day && format(day, "yyyy-MM-dd"));
    setOpen(false);
  };

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger aria-label="Due date" className={PILL_BUTTON}>
        {date ? (
          <>
            <CalendarIcon aria-hidden />
            {format(date, "MMM d")}
          </>
        ) : (
          <Placeholder icon={CalendarIcon}>Due date</Placeholder>
        )}
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
  );
}

function isEnter(event: KeyboardEvent): boolean {
  return event.key === "Enter" && !event.nativeEvent.isComposing;
}

function NewCardForm({
  defaults,
  titleField,
  onClose,
}: {
  defaults: NewCardDefaults;
  titleField: RefObject<HTMLTextAreaElement | null>;
  onClose: () => void;
}) {
  const scope = useBoard();
  const { board, content, people } = scope;
  const { draft, change, discard, restored } = useStoredDraft(
    draftKey(scope),
    { ...BLANK, assignees: defaults.assignees },
    isBlank
  );
  // Where the card goes follows where it was added, even for a draft started elsewhere.
  const [placement, setPlacement] = useState<CardPlacement>({
    sprintId: defaults.sprintId,
    status: defaults.status,
  });
  // Bumped whenever the text is replaced from here, so the editor starts over with it.
  const [fresh, setFresh] = useState(0);
  const [createMore, setCreateMore] = useState(false);
  const ready = draft.title.trim() !== "";
  const sprints = sprintChoices(content.sprints, placement.sprintId);

  // A restored draft picks up where it was left, at the end of the title.
  useEffect(() => {
    const field = titleField.current;
    if (restored && field) {
      field.setSelectionRange(field.value.length, field.value.length);
    }
  }, [restored, titleField]);

  const startOver = () => {
    discard();
    setFresh((count) => count + 1);
    titleField.current?.focus();
  };

  // Mod+Enter in the description passes its text, since the state it just
  // committed only updates on the next render.
  const create = async (text?: string) => {
    if (!ready) {
      return;
    }
    const written = { ...draft, description: text ?? draft.description };
    // The text leaves the form, and the kept draft, right away. Properties
    // carry over, so a run of similar cards is quick to enter.
    change({ description: "", title: "" });
    const saving = createCard(board, {
      ...written,
      ...placement,
      // A draft can name someone who has since left the project.
      assignees: written.assignees.filter((person) => people.includes(person)),
      rank: rankBetween(content.cards.at(-1)?.rank),
      title: written.title.trim(),
    });
    if (createMore) {
      setFresh((count) => count + 1);
      titleField.current?.focus();
    } else {
      onClose();
    }
    const card = await saving;
    if (!card) {
      // Not created: the text comes back as the draft, to try again.
      change(written);
      setFresh((count) => count + 1);
    } else if (createMore) {
      toast.success(`${cardKey(board, card)} created`);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    create();
  };

  return (
    <form className="flex flex-col" onSubmit={submit}>
      <div className="flex items-center gap-1.5 py-3 pr-3 pl-5">
        <span className="bg-foreground/5 text-muted-foreground flex h-6 items-center rounded-md px-2 text-xs font-medium">
          {board.code}
        </span>
        <ChevronRightIcon
          aria-hidden
          className="text-muted-foreground size-3.5"
        />
        <DialogTitle className="text-sm font-medium">New card</DialogTitle>
        <IconButton className="ml-auto" label="Close" onClick={onClose}>
          <XIcon />
        </IconButton>
      </div>
      <div className="flex flex-col gap-1 px-5">
        <textarea
          aria-label="Title"
          className="placeholder:text-muted-foreground/70 field-sizing-content resize-none bg-transparent text-lg leading-snug font-semibold outline-none"
          onChange={(event) => change({ title: event.target.value })}
          // Enter creates; Shift+Enter is left alone.
          onKeyDown={(event) => {
            if (isEnter(event) && !event.shiftKey) {
              event.preventDefault();
              create();
            }
          }}
          placeholder="Card title"
          ref={titleField}
          rows={1}
          value={draft.title}
        />
        <MarkdownEditor
          aria-label="Description"
          className="max-h-[40dvh] min-h-20 overflow-y-auto text-base leading-relaxed outline-none md:text-sm"
          key={fresh}
          onSubmit={create}
          onValueCommitted={(description) => change({ description })}
          placeholder="Add a description…"
          value={draft.description}
        />
      </div>
      <div className="flex flex-wrap items-center gap-1.5 px-5 pt-2 pb-4">
        <PillSelect
          icon={CircleDashedIcon}
          label="Status"
          onChange={(status) => {
            if (status) {
              setPlacement((current) => ({ ...current, status }));
            }
          }}
          options={STATUS_OPTIONS}
          value={placement.status}
        />
        <PillSelect
          icon={ChartNoAxesColumnIcon}
          label="Priority"
          onChange={(priority) => change({ priority: priority ?? undefined })}
          options={PRIORITY_OPTIONS}
          value={draft.priority ?? null}
        />
        <AssigneesPill
          onChange={(assignees) => change({ assignees })}
          people={assignable(people, draft.assignees)}
          value={draft.assignees}
        />
        {board.usesSprints && (
          <PillSelect
            icon={IterationCwIcon}
            label="Sprint"
            onChange={(sprint) =>
              setPlacement((current) => ({
                ...current,
                sprintId: sprints.find((item) => item._id === sprint)?._id,
              }))
            }
            options={sprintOptions(sprints)}
            value={
              sprints.find((sprint) => sprint._id === placement.sprintId)
                ?._id ?? null
            }
          />
        )}
        <DuePill onChange={(due) => change({ due })} value={draft.due} />
        <LabelsPill
          onChange={(labels) => change({ labels })}
          value={draft.labels}
        />
      </div>
      <div className="flex items-center justify-end gap-4 px-5 pb-4">
        {restored && !isBlank(draft) && (
          <Button
            className="text-muted-foreground mr-auto -ml-3"
            onClick={startOver}
            size="sm"
            type="button"
            variant="ghost"
          >
            Discard draft
          </Button>
        )}
        {/* oxlint-disable-next-line jsx-a11y/label-has-associated-control -- the switch renders its own input */}
        <label className="text-muted-foreground flex items-center gap-2 text-sm select-none">
          <Switch checked={createMore} onCheckedChange={setCreateMore} />
          Create more
        </label>
        <Button disabled={!ready} type="submit">
          Create card
        </Button>
      </div>
    </form>
  );
}

interface NewCardDialogProps {
  defaults: NewCardDefaults;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NewCardDialog({
  defaults,
  open,
  onOpenChange,
}: NewCardDialogProps) {
  const titleField = useRef<HTMLTextAreaElement>(null);
  const key = draftKey(useBoard());

  // What was written stays as a draft, and closing says so, with a way to drop it.
  const close = () => {
    onOpenChange(false);
    const kept = readDraft(key, BLANK);
    if (kept && !isBlank(kept)) {
      toast("Draft saved", {
        action: { label: "Discard", onClick: () => writeDraft(key, null) },
        description: "It’s back the next time you add a card to this board.",
      });
    }
  };

  return (
    <Dialog
      onOpenChange={(next) => {
        if (!next) {
          close();
        }
      }}
      open={open}
    >
      <DialogContent
        className="max-w-2xl gap-0 p-0"
        initialFocus={titleField}
        showCloseButton={false}
      >
        <NewCardForm
          defaults={defaults}
          onClose={close}
          titleField={titleField}
        />
      </DialogContent>
    </Dialog>
  );
}
