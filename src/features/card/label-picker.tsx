import { Combobox } from "@base-ui/react/combobox";
import { CheckIcon, PlusIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

import { useBoard } from "@/features/board/board-context";
import { cardLabels, nextLabelColor } from "@/features/card/card-fields";
import { LabelDot } from "@/features/card/card-parts";
import { createLabel } from "@/lib/actions";
import { shortId } from "@/lib/crm";
import type { BoardLabel, Card } from "@/lib/model";
import { labelKey, MAX_LABEL_NAME, MAX_LABELS } from "@/lib/model";

/** How many labels "Frequently used" holds. */
const FREQUENT = 3;
/** Fewer labels than this take in at a glance, so none are singled out. */
const FREQUENT_FROM = 6;
const SEPARATOR = /[^\p{L}\p{N}]/u;

const ITEM =
  "group/choice data-highlighted:bg-accent data-highlighted:text-accent-foreground flex h-8 cursor-default items-center gap-2.5 rounded-lg px-2 text-sm outline-none select-none";
/** Looks like the app's checkbox; shows on the highlighted row and on picked ones. */
const CHECKBOX =
  "border-input bg-card dark:bg-input/30 group-data-selected/choice:border-primary group-data-selected/choice:bg-primary dark:group-data-selected/choice:bg-primary group-data-selected/choice:text-primary-foreground flex size-4 shrink-0 items-center justify-center rounded-[5px] border opacity-0 transition-[opacity,background-color,border-color] duration-150 group-data-highlighted/choice:opacity-100 group-data-selected/choice:opacity-100";

/** A label to make from what was typed. */
interface NewLabel {
  create: string;
}

type Choice = BoardLabel | NewLabel;

interface ChoiceGroup {
  /** Shown above the group; results of a search have none. */
  label?: string;
  items: Choice[];
}

function isNew(choice: Choice): choice is NewLabel {
  return "create" in choice;
}

function sameChoice(a: Choice, b: Choice): boolean {
  return !(isNew(a) || isNew(b)) && a.id === b.id;
}

function choiceName(choice: Choice): string {
  return isNew(choice) ? choice.create : choice.name;
}

/** How many cards wear each label. */
function usage(cards: readonly Card[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const card of cards) {
    for (const id of card.labels) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  return counts;
}

/**
 * How well a name matches a search, best first: from its start, from the
 * start of a later word ("faucet" in "signet-faucet"), or anywhere in it.
 */
function matchRank(name: string, needle: string): number | undefined {
  const text = labelKey(name);
  if (text.startsWith(needle)) {
    return 0;
  }
  const first = text.indexOf(needle);
  if (first === -1) {
    return undefined;
  }
  for (let at = first; at !== -1; at = text.indexOf(needle, at + 1)) {
    if (SEPARATOR.test(text.charAt(at - 1))) {
      return 1;
    }
  }
  return 2;
}

/**
 * Without a search, the labels used most and then the rest by name. With
 * one, the labels that match, best first, and a new label when none is
 * named exactly that.
 */
function choiceGroups(
  labels: readonly BoardLabel[],
  uses: ReadonlyMap<string, number>,
  query: string
): ChoiceGroup[] {
  const used = (label: BoardLabel) => uses.get(label.id) ?? 0;
  const needle = labelKey(query);
  if (!needle) {
    const frequent =
      labels.length < FREQUENT_FROM
        ? []
        : labels
            .filter((label) => used(label) > 0)
            .toSorted((a, b) => used(b) - used(a))
            .slice(0, FREQUENT);
    const rest = labels.filter((label) => !frequent.includes(label));
    const groups: ChoiceGroup[] =
      frequent.length > 0
        ? [
            { items: frequent, label: "Frequently used" },
            { items: rest, label: "Labels" },
          ]
        : [{ items: rest }];
    return groups.filter((group) => group.items.length > 0);
  }
  const matches: Choice[] = labels
    .flatMap((label) => {
      const rank = matchRank(label.name, needle);
      return rank === undefined ? [] : [{ label, rank }];
    })
    .toSorted((a, b) => a.rank - b.rank || used(b.label) - used(a.label))
    .map(({ label }) => label);
  const named = labels.some((label) => labelKey(label.name) === needle);
  if (!(named || labels.length >= MAX_LABELS)) {
    matches.push({ create: query.trim() });
  }
  return matches.length > 0 ? [{ items: matches }] : [];
}

function ChoiceItem({ choice }: { choice: Choice }) {
  if (isNew(choice)) {
    return (
      <Combobox.Item className={ITEM} value={choice}>
        <PlusIcon
          aria-hidden
          className="text-muted-foreground size-4 shrink-0"
        />
        <span className="truncate">
          <span className="text-muted-foreground">Create new label: </span>
          {`“${choice.create}”`}
        </span>
      </Combobox.Item>
    );
  }
  return (
    <Combobox.Item className={ITEM} value={choice}>
      <span aria-hidden className={CHECKBOX}>
        <CheckIcon
          className="size-3 opacity-0 group-data-selected/choice:opacity-100"
          strokeWidth={3}
        />
      </span>
      <LabelDot color={choice.color} />
      <span className="truncate">{choice.name}</span>
    </Combobox.Item>
  );
}

interface LabelPickerProps {
  /** Ids of the labels picked. */
  value: readonly string[];
  onChange: (labels: string[]) => void;
  /** What the button that opens the picker shows. */
  children: ReactNode;
  className?: string;
  id?: string;
  "aria-label"?: string;
}

/**
 * Picks a card's labels from the board's, searching them by name. A name
 * no label has yet makes a new label, which anyone editing cards may do.
 */
export function LabelPicker({
  value,
  onChange,
  children,
  className,
  ...props
}: LabelPickerProps) {
  const { board, content } = useBoard();
  const { labels } = content;
  const [query, setQuery] = useState("");
  const picked: Choice[] = cardLabels(labels, value);

  const pick = (choices: Choice[]) => {
    const ids = choices.flatMap((choice) => (isNew(choice) ? [] : [choice.id]));
    const made = choices.find(isNew);
    if (made) {
      const label = {
        color: nextLabelColor(labels),
        id: shortId(),
        name: made.create,
      };
      createLabel(board, label);
      ids.push(label.id);
    }
    onChange(ids);
  };

  return (
    <Combobox.Root
      autoHighlight
      filter={null}
      inputValue={query}
      isItemEqualToValue={sameChoice}
      itemToStringLabel={choiceName}
      items={choiceGroups(labels, usage(content.cards), query)}
      multiple
      onInputValueChange={setQuery}
      onValueChange={pick}
      value={picked}
    >
      <Combobox.Trigger className={className} {...props}>
        {children}
      </Combobox.Trigger>
      <Combobox.Portal>
        <Combobox.Positioner
          align="start"
          className="isolate z-50"
          sideOffset={6}
        >
          <Combobox.Popup className="bg-popover text-popover-foreground shadow-raised flex max-h-[min(22rem,var(--available-height))] w-64 origin-(--transform-origin) flex-col overflow-hidden rounded-xl transition-[opacity,scale] duration-150 ease-out outline-none data-ending-style:scale-[0.96] data-ending-style:opacity-0 data-ending-style:duration-100 data-starting-style:scale-[0.96] data-starting-style:opacity-0">
            <Combobox.Input
              aria-label="Search or add labels"
              autoCapitalize="off"
              autoCorrect="off"
              className="border-border placeholder:text-muted-foreground h-10 shrink-0 border-b bg-transparent px-3 text-base outline-none md:text-sm"
              maxLength={MAX_LABEL_NAME}
              placeholder="Add labels…"
              spellCheck={false}
            />
            <Combobox.Empty className="text-muted-foreground px-3 py-5 text-center text-sm text-balance empty:hidden">
              {query.trim()
                ? `No labels match “${query.trim()}”.`
                : "No labels yet. Type a name to make one."}
            </Combobox.Empty>
            <Combobox.List className="min-h-0 overflow-y-auto overscroll-contain p-1 empty:hidden">
              {(group: ChoiceGroup) => (
                <Combobox.Group
                  items={group.items}
                  key={group.label ?? "matches"}
                >
                  {group.label && (
                    <Combobox.GroupLabel className="text-muted-foreground px-2 pt-1.5 pb-1 text-xs font-medium select-none">
                      {group.label}
                    </Combobox.GroupLabel>
                  )}
                  <Combobox.Collection>
                    {(choice: Choice) => (
                      <ChoiceItem
                        choice={choice}
                        key={isNew(choice) ? "new" : choice.id}
                      />
                    )}
                  </Combobox.Collection>
                </Combobox.Group>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}
