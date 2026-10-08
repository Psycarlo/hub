import { cn } from "cn";
import { PlusIcon, XIcon } from "lucide-react";
import { useState } from "react";

import { ColorPicker } from "@/components/color-picker";
import { IconButton } from "@/components/icon-button";
import { Button } from "@/components/ui/button";
import { FluidTooltip } from "@/components/ui/fluid-tooltip";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { nextLabelColor } from "@/features/card/card-fields";
import type { LabelChanges } from "@/lib/actions";
import { shortId } from "@/lib/crm";
import type { BoardLabel } from "@/lib/model";
import { labelKey, MAX_LABEL_NAME, MAX_LABELS } from "@/lib/model";
import { SWATCH_COLORS } from "@/lib/palette";

/**
 * The labels as they'd be saved: names trimmed, a label emptied keeping its
 * old name, and a new one left empty dropped.
 */
function settled(base: BoardLabel[], draft: BoardLabel[]): BoardLabel[] {
  const before = new Map(base.map((label) => [label.id, label]));
  return draft.flatMap((label) => {
    const name = label.name.trim() || before.get(label.id)?.name;
    return name ? [{ ...label, name }] : [];
  });
}

/** Ids of the labels that would share a name with another once saved. */
function clashing(base: BoardLabel[], draft: BoardLabel[]): Set<string> {
  const labels = settled(base, draft);
  const counts = new Map<string, number>();
  for (const { name } of labels) {
    counts.set(labelKey(name), (counts.get(labelKey(name)) ?? 0) + 1);
  }
  return new Set(
    labels
      .filter(({ name }) => (counts.get(labelKey(name)) ?? 0) > 1)
      .map(({ id }) => id)
  );
}

/** What changed from `base`, or undefined when nothing did. */
function labelChanges(
  base: BoardLabel[],
  draft: BoardLabel[]
): LabelChanges | undefined {
  const before = new Map(base.map((label) => [label.id, label]));
  const kept = new Set(draft.map(({ id }) => id));
  const changed = settled(base, draft).filter((label) => {
    const old = before.get(label.id);
    return old?.name !== label.name || old.color !== label.color;
  });
  const removed = base.filter(({ id }) => !kept.has(id)).map(({ id }) => id);
  return changed.length > 0 || removed.length > 0
    ? { changed, removed }
    : undefined;
}

/** Why the labels can't be saved, or undefined when they can. */
function labelsProblem(
  base: BoardLabel[],
  draft: BoardLabel[]
): string | undefined {
  return clashing(base, draft).size > 0
    ? "Two labels can’t share a name."
    : undefined;
}

/**
 * A board's labels as its settings edit them. Until first edited they follow
 * the board; from then on, only what changed since is saved, so labels added
 * from cards meanwhile stay.
 */
export function useLabelsDraft(labels: BoardLabel[] | undefined) {
  const [edit, setEdit] = useState<{
    base: BoardLabel[];
    draft: BoardLabel[];
  }>();
  const base = edit?.base ?? labels;
  return {
    changes: edit && labelChanges(edit.base, edit.draft),
    /** The labels as they'd be saved, once loaded. */
    current: edit ? settled(edit.base, edit.draft) : labels,
    /** What the editor takes, once the labels are loaded. */
    editor: base && {
      base,
      labels: edit?.draft ?? base,
      onChange: (draft: BoardLabel[]) => setEdit({ base, draft }),
    },
    problem: edit && labelsProblem(edit.base, edit.draft),
  };
}

function LabelRow({
  label,
  repeated,
  autoFocus,
  onChange,
  onRemove,
}: {
  label: BoardLabel;
  repeated: boolean;
  autoFocus: boolean;
  onChange: (label: BoardLabel) => void;
  onRemove: () => void;
}) {
  const name = label.name.trim() || "label";
  return (
    <li className="flex items-center gap-1.5">
      <Popover>
        <PopoverTrigger
          aria-label={`Color of ${name}`}
          className="hover:bg-foreground/5 focus-visible:ring-ring/50 data-popup-open:bg-foreground/5 flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors duration-150 outline-none focus-visible:ring-3"
        >
          <span
            className={cn("size-3.5 rounded-full", SWATCH_COLORS[label.color])}
          />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-3">
          <ColorPicker
            className="w-44"
            onChange={(color) => onChange({ ...label, color })}
            value={label.color}
          />
        </PopoverContent>
      </Popover>
      <Input
        aria-invalid={repeated || undefined}
        aria-label="Label name"
        autoComplete="off"
        autoFocus={autoFocus}
        className="h-8 px-2.5"
        maxLength={MAX_LABEL_NAME}
        onChange={(event) => onChange({ ...label, name: event.target.value })}
        placeholder="Label name"
        value={label.name}
      />
      <IconButton label={`Delete ${name}`} onClick={onRemove} size="icon-xs">
        <XIcon />
      </IconButton>
    </li>
  );
}

/** A board's labels in its settings: renamed, recolored, added or deleted. */
export function LabelsEditor({
  base,
  labels,
  onChange,
}: {
  /** The labels as saved, which an emptied name falls back to. */
  base: BoardLabel[];
  labels: BoardLabel[];
  onChange: (labels: BoardLabel[]) => void;
}) {
  // The label just added, whose name is typed next.
  const [added, setAdded] = useState<string>();
  const clashes = clashing(base, labels);
  const problem = labelsProblem(base, labels);

  const add = () => {
    const label = { color: nextLabelColor(labels), id: shortId(), name: "" };
    setAdded(label.id);
    onChange([...labels, label]);
  };

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">Labels</h3>
      {labels.length > 0 && (
        <FluidTooltip.Group>
          <ul className="flex flex-col gap-1">
            {labels.map((label) => (
              <LabelRow
                autoFocus={label.id === added}
                key={label.id}
                label={label}
                onChange={(next) =>
                  onChange(
                    labels.map((item) => (item.id === label.id ? next : item))
                  )
                }
                onRemove={() =>
                  onChange(labels.filter((item) => item.id !== label.id))
                }
                repeated={clashes.has(label.id)}
              />
            ))}
          </ul>
        </FluidTooltip.Group>
      )}
      {problem && (
        <p className="text-destructive text-xs" role="alert">
          {problem}
        </p>
      )}
      <Button
        className="self-start"
        disabled={labels.length >= MAX_LABELS}
        onClick={add}
        size="sm"
        type="button"
        variant="ghost"
      >
        <PlusIcon />
        Add label
      </Button>
    </div>
  );
}
