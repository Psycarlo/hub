import { ChartNoAxesColumnIcon } from "lucide-react";
import { useId } from "react";

import { PRIORITY_OPTIONS } from "@/features/card/card-options";
import {
  AssigneesPill,
  LabelsSelectPill,
  PillSelect,
} from "@/features/card/property-pills";
import type { BoardLabel, CardDefaults, UserId } from "@/lib/model";

/** New cards start blank until a board's settings say otherwise. */
export const NO_CARD_DEFAULTS: CardDefaults = { assignees: [], labels: [] };

/** What a board's new cards start with, in its settings. */
export function CardDefaultsField({
  people,
  labels,
  value,
  onChange,
}: {
  /** Who can be assigned: the people on the board's project. */
  people: UserId[];
  labels: BoardLabel[];
  value: CardDefaults;
  onChange: (defaults: CardDefaults) => void;
}) {
  const id = useId();
  return (
    <fieldset aria-describedby={`${id}-hint`} className="min-w-0">
      <legend className="text-sm font-medium">New cards</legend>
      <p className="text-muted-foreground mt-0.5 text-xs" id={`${id}-hint`}>
        Filled in on every card added here, and still changeable.
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <PillSelect
          icon={ChartNoAxesColumnIcon}
          label="Priority"
          onChange={(priority) =>
            onChange({ ...value, priority: priority ?? undefined })
          }
          options={PRIORITY_OPTIONS}
          value={value.priority ?? null}
        />
        <AssigneesPill
          onChange={(assignees) => onChange({ ...value, assignees })}
          people={people}
          // Anyone who has since left isn't filled in, so isn't shown either.
          value={value.assignees.filter((person) => people.includes(person))}
        />
        {labels.length > 0 && (
          <LabelsSelectPill
            labels={labels}
            onChange={(picked) => onChange({ ...value, labels: picked })}
            value={value.labels}
          />
        )}
      </div>
    </fieldset>
  );
}
