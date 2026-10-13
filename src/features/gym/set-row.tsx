/**
 * A set's row in a workout: the numbers it takes for its kind of exercise,
 * typed in place, checked off, and read back against last time.
 */
import { cn } from "cn";
import {
  CheckIcon,
  CornerDownRightIcon,
  Trash2Icon,
  TrophyIcon,
  XIcon,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { KeyboardEvent } from "react";
import { useRef, useState } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type {
  ExerciseKind,
  GymSet,
  RecordKind,
  SetType,
  UnitSystem,
  WorkoutEntry,
} from "@/lib/gym";
import {
  MAX_DROPS,
  RECORD_LABELS,
  bestsOf,
  distanceUnit,
  formatClock,
  formatSet,
  fromDistance,
  fromLoad,
  parseAmount,
  parseClock,
  signOf,
  toDistance,
  toLoad,
  weightUnit,
} from "@/lib/gym";

/** A number a set records, kept metric. */
type Field = "weight" | "reps" | "seconds" | "meters";

/** The numbers a set of each kind takes, in the order they're typed. */
const FIELDS: Record<ExerciseKind, readonly Field[]> = {
  distance: ["meters", "seconds"],
  reps: ["weight", "reps"],
  time: ["seconds"],
  weight: ["weight", "reps"],
};

const SET_TYPE_LABELS: Record<SetType, string> = {
  failure: "To failure",
  normal: "Normal",
  warmup: "Warm-up",
};

/** Set, previous, the numbers, and the check; a time takes both number columns. */
const ROW =
  "grid grid-cols-[2.25rem_minmax(0,1fr)_4.25rem_4.25rem_2.25rem] items-center gap-1.5 sm:grid-cols-[2.5rem_minmax(0,1fr)_5.5rem_5.5rem_2.5rem] sm:gap-2";

const AMOUNT =
  "h-9 w-full min-w-0 rounded-lg bg-foreground/5 px-1 text-center text-base font-medium tabular-nums outline-none transition-[background-color,box-shadow] duration-150 ease-out placeholder:font-normal placeholder:text-muted-foreground/60 hover:bg-foreground/8 focus-visible:bg-card focus-visible:ring-2 focus-visible:ring-ring/50 md:text-sm";

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** A field's number as it's typed and shown, in the gym's units. */
function fieldText(field: Field, value: number | undefined, units: UnitSystem) {
  if (value === undefined) {
    return "";
  }
  switch (field) {
    case "weight": {
      return String(toLoad(value, units));
    }
    case "seconds": {
      return formatClock(value);
    }
    case "meters": {
      return String(round2(toDistance(value, units)));
    }
    default: {
      return String(value);
    }
  }
}

/** What was typed in a field, kept metric; undefined when it isn't a number. */
function parseField(
  field: Field,
  text: string,
  units: UnitSystem
): number | undefined {
  if (field === "seconds") {
    return parseClock(text);
  }
  const value = parseAmount(text);
  if (value === undefined) {
    return undefined;
  }
  switch (field) {
    case "weight": {
      return fromLoad(value, units);
    }
    case "meters": {
      return fromDistance(value, units);
    }
    default: {
      return Math.round(value);
    }
  }
}

function fieldHeading(field: Field, kind: ExerciseKind, units: UnitSystem) {
  switch (field) {
    case "weight": {
      return kind === "reps" ? `+${weightUnit(units)}` : weightUnit(units);
    }
    case "reps": {
      return "Reps";
    }
    case "seconds": {
      return "Time";
    }
    default: {
      return distanceUnit(units);
    }
  }
}

/** A number in a set, plain until pointed at, saved as it's left. */
function AmountInput({
  label,
  field,
  value,
  placeholder,
  units,
  invalid,
  className,
  onCommit,
}: {
  label: string;
  field: Field;
  value: number | undefined;
  /** Shown faintly while it's empty, like last time's number. */
  placeholder?: number;
  units: UnitSystem;
  invalid?: boolean;
  className?: string;
  onCommit: (value: number | undefined) => void;
}) {
  const [draft, setDraft] = useState<string>();
  // Escape leaves it as it was, though leaving the field saves it.
  const cancelled = useRef(false);
  const text = fieldText(field, value, units);
  const commit = () => {
    const typed = draft?.trim();
    if (!cancelled.current && typed !== undefined && typed !== text) {
      const next = typed === "" ? undefined : parseField(field, typed, units);
      if (typed === "" || next !== undefined) {
        onCommit(next);
      }
    }
    cancelled.current = false;
    setDraft(undefined);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.currentTarget.blur();
    } else if (event.key === "Escape" && draft !== undefined) {
      event.stopPropagation();
      cancelled.current = true;
      event.currentTarget.blur();
    }
  };
  return (
    <input
      aria-invalid={invalid || undefined}
      aria-label={label}
      autoComplete="off"
      className={cn(AMOUNT, invalid && "ring-destructive/50 ring-2", className)}
      inputMode={field === "reps" ? "numeric" : "decimal"}
      onBlur={commit}
      onChange={(event) => setDraft(event.target.value)}
      onFocus={(event) => event.currentTarget.select()}
      onKeyDown={onKeyDown}
      placeholder={fieldText(field, placeholder, units)}
      value={draft ?? text}
    />
  );
}

/** Each set's place as it's called: warm-ups are W, the rest count 1, 2, 3. */
export function setLabels(sets: readonly GymSet[]): string[] {
  let count = 0;
  return sets.map((set) => {
    if (set.type === "warmup") {
      return "W";
    }
    count += 1;
    return String(count);
  });
}

/** The records each set beat, by set id, for the trophies beside them. */
export function recordsBySet(
  kind: ExerciseKind,
  entry: WorkoutEntry
): Map<string, RecordKind[]> {
  const bests = bestsOf(kind, entry.sets);
  const bySet = new Map<string, RecordKind[]>();
  for (const record of entry.prs) {
    const best = bests[record];
    if (best) {
      bySet.set(best.set.id, [...(bySet.get(best.set.id) ?? []), record]);
    }
  }
  return bySet;
}

/** A set's number, with a trophy for records it beat. */
function SetLabel({
  label,
  type,
  records,
}: {
  label: string;
  type: SetType;
  records?: RecordKind[];
}) {
  return (
    <span className="relative flex size-8 items-center justify-center">
      <span
        className={cn(
          "text-sm font-semibold tabular-nums",
          type === "warmup" && "text-yellow-600 dark:text-yellow-400",
          type === "failure" && "text-red-600 dark:text-red-400"
        )}
      >
        {label}
      </span>
      <AnimatePresence>
        {records && records.length > 0 && (
          <motion.span
            animate={{ opacity: 1, scale: 1 }}
            className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-yellow-400 text-yellow-950 shadow-sm"
            exit={{ opacity: 0, scale: 0.5 }}
            initial={{ opacity: 0, scale: 0.4 }}
            transition={{ bounce: 0.5, duration: 0.45, type: "spring" }}
          >
            <TrophyIcon aria-hidden className="size-2.5" />
            <span className="sr-only">
              , record:{" "}
              {records.map((record) => RECORD_LABELS[record]).join(", ")}
            </span>
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}

/** The set's number, opening what can be done to it. */
function SetMenu({
  label,
  set,
  kind,
  records,
  onType,
  onAddDrop,
  onRemove,
}: {
  label: string;
  set: GymSet;
  kind: ExerciseKind;
  records?: RecordKind[];
  onType: (type: SetType) => void;
  onAddDrop: () => void;
  onRemove: () => void;
}) {
  const drops = kind === "weight" || kind === "reps";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Set ${label}`}
        className="hover:bg-foreground/5 focus-visible:ring-ring/50 aria-expanded:bg-foreground/5 rounded-lg transition-colors duration-150 ease-out outline-none focus-visible:ring-3"
      >
        <SetLabel label={label} records={records} type={set.type} />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-44">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Set</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            onValueChange={(value: SetType) => onType(value)}
            value={set.type}
          >
            {(["normal", "warmup", "failure"] as const).map((type) => (
              <DropdownMenuRadioItem key={type} value={type}>
                {SET_TYPE_LABELS[type]}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {drops && (
          <DropdownMenuItem
            disabled={(set.drops?.length ?? 0) >= MAX_DROPS}
            onClick={onAddDrop}
          >
            <CornerDownRightIcon />
            Add drop
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={onRemove} variant="destructive">
          <Trash2Icon />
          Remove set
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function CheckButton({
  done,
  label,
  onCheck,
}: {
  done: boolean;
  label: string;
  onCheck: () => void;
}) {
  return (
    <button
      aria-label={done ? `Set ${label} done` : `Mark set ${label} done`}
      aria-pressed={done}
      className={cn(
        "focus-visible:ring-ring/50 flex size-9 items-center justify-center justify-self-center rounded-lg transition-[background-color,color,scale] duration-150 ease-out outline-none focus-visible:ring-3 active:scale-[0.92]",
        done
          ? "bg-green-500 text-white"
          : "bg-foreground/6 text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
      )}
      onClick={onCheck}
      type="button"
    >
      <CheckIcon aria-hidden className="size-4" strokeWidth={2.5} />
    </button>
  );
}

interface SetRowProps {
  set: GymSet;
  label: string;
  kind: ExerciseKind;
  units: UnitSystem;
  /** The same set last time. */
  previous?: GymSet;
  records?: RecordKind[];
  /** Fields left empty when it was checked, to fill in. */
  missing: boolean;
  onChange: (changes: Partial<GymSet>) => void;
  onCheck: () => void;
  onRemove: () => void;
}

/** A set to fill in: last time's beside it, its numbers, and its check. */
export function SetRow({
  set,
  label,
  kind,
  units,
  previous,
  records,
  missing,
  onChange,
  onCheck,
  onRemove,
}: SetRowProps) {
  const fields = FIELDS[kind];
  const previousText = previous ? formatSet(previous, kind, units) : "";
  const addDrop = () => {
    const last = set.drops?.at(-1);
    const from = last?.weight ?? set.weight ?? 0;
    // About a fifth lighter, to the nearest plate pair.
    const step = units === "imperial" ? 5 : 2.5;
    const shown = Math.max(
      0,
      Math.round((toLoad(from, units) * 0.8) / step) * step
    );
    onChange({
      drops: [
        ...(set.drops ?? []),
        { reps: last?.reps ?? set.reps ?? 0, weight: fromLoad(shown, units) },
      ],
    });
  };
  return (
    <div
      className={cn(
        ROW,
        "rounded-xl px-1 py-1 transition-colors duration-200 ease-out",
        set.done && "bg-green-500/8 dark:bg-green-400/8"
      )}
      data-set={set.id}
    >
      <SetMenu
        kind={kind}
        label={label}
        onAddDrop={addDrop}
        onRemove={onRemove}
        onType={(type) => onChange({ type })}
        records={records}
        set={set}
      />
      <button
        className="text-muted-foreground hover:text-foreground disabled:hover:text-muted-foreground truncate rounded-md text-left text-xs tabular-nums transition-colors duration-150 ease-out outline-none focus-visible:underline disabled:cursor-default sm:text-sm"
        disabled={!previous || set.done}
        onClick={() =>
          previous &&
          onChange({
            meters: previous.meters,
            reps: previous.reps,
            seconds: previous.seconds,
            weight: previous.weight,
          })
        }
        title={previous ? "Use last time’s" : undefined}
        type="button"
      >
        {previousText || "—"}
      </button>
      {fields.map((field) => (
        <AmountInput
          className={cn(fields.length === 1 && "col-span-2")}
          field={field}
          invalid={missing && (field === "reps" || fields.length === 1)}
          key={field}
          label={`Set ${label} ${fieldHeading(field, kind, units)}`}
          onCommit={(value) => onChange({ [field]: value })}
          placeholder={previous?.[field]}
          units={units}
          value={set[field]}
        />
      ))}
      <CheckButton done={set.done} label={label} onCheck={onCheck} />
    </div>
  );
}

/** A lighter weight taken straight after its set. */
export function DropRow({
  drop,
  label,
  units,
  onChange,
  onRemove,
}: {
  drop: { weight: number; reps: number };
  label: string;
  units: UnitSystem;
  onChange: (drop: { weight: number; reps: number }) => void;
  onRemove: () => void;
}) {
  return (
    <div className={cn(ROW, "px-1 py-0.5")}>
      <CornerDownRightIcon
        aria-hidden
        className="text-muted-foreground size-4 justify-self-center"
      />
      <span className="text-muted-foreground text-xs">Drop</span>
      <AmountInput
        field="weight"
        label={`${label} ${weightUnit(units)}`}
        onCommit={(weight) => onChange({ ...drop, weight: weight ?? 0 })}
        units={units}
        value={drop.weight}
      />
      <AmountInput
        field="reps"
        label={`${label} reps`}
        onCommit={(reps) => onChange({ ...drop, reps: reps ?? 0 })}
        units={units}
        value={drop.reps}
      />
      <button
        aria-label={`Remove ${label.toLowerCase()}`}
        className="text-muted-foreground hover:bg-foreground/5 hover:text-foreground focus-visible:ring-ring/50 flex size-9 items-center justify-center justify-self-center rounded-lg transition-colors duration-150 ease-out outline-none focus-visible:ring-3"
        onClick={onRemove}
        type="button"
      >
        <XIcon aria-hidden className="size-4" />
      </button>
    </div>
  );
}

/** How a set did against the same set last time, as a few characters. */
function setChange(
  set: GymSet,
  previous: GymSet | undefined,
  kind: ExerciseKind,
  units: UnitSystem
): { by: number; text: string } | undefined {
  if (!previous) {
    return undefined;
  }
  if (kind === "weight" || kind === "reps") {
    const weight =
      toLoad(set.weight ?? 0, units) - toLoad(previous.weight ?? 0, units);
    if (Math.abs(weight) > 0.001) {
      return {
        by: weight,
        text: `${signOf(weight)}${round2(Math.abs(weight))} ${weightUnit(units)}`,
      };
    }
    const reps = (set.reps ?? 0) - (previous.reps ?? 0);
    return reps === 0
      ? undefined
      : {
          by: reps,
          text: `${signOf(reps)}${Math.abs(reps)} ${Math.abs(reps) === 1 ? "rep" : "reps"}`,
        };
  }
  if (kind === "distance" && set.meters !== previous.meters) {
    const by = (set.meters ?? 0) - (previous.meters ?? 0);
    return {
      by,
      text: `${signOf(by)}${round2(toDistance(Math.abs(by), units))} ${distanceUnit(units)}`,
    };
  }
  const by = (set.seconds ?? 0) - (previous.seconds ?? 0);
  // On a distance, less time for the same way is better.
  const better = kind === "distance" ? -by : by;
  return by === 0
    ? undefined
    : { by: better, text: `${signOf(by)}${formatClock(Math.abs(by))}` };
}

/** A set as it was done, with how it did against last time. */
export function ReadRow({
  set,
  label,
  kind,
  units,
  previous,
  records,
}: {
  set: GymSet;
  label: string;
  kind: ExerciseKind;
  units: UnitSystem;
  previous?: GymSet;
  records?: RecordKind[];
}) {
  const change = setChange(set, previous, kind, units);
  return (
    <li className="flex flex-col">
      <div className="flex h-9 items-center gap-2">
        <SetLabel label={label} records={records} type={set.type} />
        <span className="text-sm font-medium tabular-nums">
          {formatSet(set, kind, units)}
          {kind === "weight" && (set.weight ?? 0) > 0 && (
            <span className="text-muted-foreground font-normal">
              {" "}
              {weightUnit(units)}
            </span>
          )}
        </span>
        {change && (
          <span
            className={cn(
              "text-xs tabular-nums",
              change.by > 0
                ? "text-green-600 dark:text-green-400"
                : "text-muted-foreground"
            )}
          >
            {change.text}
          </span>
        )}
        {records && (
          <span className="text-muted-foreground ml-auto truncate text-xs">
            {records.map((record) => RECORD_LABELS[record]).join(" · ")}
          </span>
        )}
      </div>
      {set.drops?.map((drop, index) => (
        <div
          className="text-muted-foreground flex h-7 items-center gap-2 pl-8 text-sm tabular-nums"
          // Drops have no ids; they only change as a whole with their set.
          // oxlint-disable-next-line react/no-array-index-key
          key={index}
        >
          <CornerDownRightIcon aria-hidden className="size-3.5" />
          {formatSet(drop, kind, units)}
        </div>
      ))}
    </li>
  );
}

/** The column names over the sets. */
export function Headings({
  kind,
  units,
}: {
  kind: ExerciseKind;
  units: UnitSystem;
}) {
  const fields = FIELDS[kind];
  return (
    <div
      aria-hidden
      className={cn(
        ROW,
        "text-muted-foreground px-1 text-[11px] font-medium tracking-wide uppercase"
      )}
    >
      <span className="text-center">Set</span>
      <span>Last</span>
      {fields.map((field) => (
        <span
          className={cn("text-center", fields.length === 1 && "col-span-2")}
          key={field}
        >
          {fieldHeading(field, kind, units)}
        </span>
      ))}
      <span className="flex justify-center">
        <CheckIcon className="size-3.5" />
      </span>
    </div>
  );
}
