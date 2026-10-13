import { cn } from "cn";
import { format } from "date-fns";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  EllipsisIcon,
  PencilIcon,
  PlusIcon,
  TimerIcon,
  Trash2Icon,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ExerciseBadge, PANEL } from "@/features/gym/gym-parts";
import {
  DropRow,
  Headings,
  ReadRow,
  SetRow,
  recordsBySet,
  setLabels,
} from "@/features/gym/set-row";
import { useToday } from "@/hooks/use-today";
import type {
  Exercise,
  ExerciseKind,
  Gym,
  GymSet,
  UnitSystem,
  Workout,
  WorkoutEntry,
} from "@/lib/gym";
import {
  KIND_INFO,
  MAX_GYM_NOTE,
  MAX_SETS,
  REST_CHOICES,
  formatRest,
  formatSet,
  formatVolume,
  isFilled,
  isWorking,
  musclesLine,
  newSetId,
  restOf,
  setVolume,
} from "@/lib/gym";
import {
  moveEntry,
  removeEntry,
  setSets,
  updateEntryNote,
  updateExercise,
} from "@/lib/gym-actions";
import { dayLabel } from "@/lib/log";
import { playSound } from "@/lib/sounds";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

/**
 * How the card is used: logging a workout under way, where checking a set
 * starts the rest; changing one that's over; or reading it.
 */
export type EntryMode = "live" | "edit" | "read";

/** The rest menu's value for taking the gym's. */
const GYM_REST = "gym";

/** A line on the exercise, plain until pointed at, saved as it's left. */
function NoteField({
  entry,
  autoFocus,
  onEmptied,
}: {
  entry: WorkoutEntry;
  autoFocus: boolean;
  onEmptied: () => void;
}) {
  const [draft, setDraft] = useState<string>();
  const commit = () => {
    const note = draft?.trim();
    if (note !== undefined && note !== entry.note) {
      updateEntryNote(entry, note);
    }
    if (note === "" || (note === undefined && !entry.note)) {
      onEmptied();
    }
    setDraft(undefined);
  };
  return (
    <input
      aria-label="Note"
      autoComplete="off"
      // Opened from the menu to write in.
      // oxlint-disable-next-line jsx-a11y/no-autofocus
      autoFocus={autoFocus}
      className="placeholder:text-muted-foreground/70 hover:bg-foreground/5 focus-visible:bg-foreground/5 h-8 w-full min-w-0 rounded-lg px-2 text-sm transition-[background-color] duration-150 ease-out outline-none"
      maxLength={MAX_GYM_NOTE}
      onBlur={commit}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.currentTarget.blur();
        }
      }}
      placeholder="Add a note"
      value={draft ?? entry.note}
    />
  );
}

/** How long to rest after the exercise's sets, set right from its card. */
function RestMenu({ exercise, gym }: { exercise: Exercise; gym: Gym }) {
  const rest = restOf(exercise, gym);
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger
          render={
            <DropdownMenuTrigger
              render={
                <Button
                  aria-label={`Rest after sets: ${formatRest(rest)}`}
                  className="text-muted-foreground tabular-nums"
                  size="sm"
                  variant="ghost"
                />
              }
            />
          }
        >
          <TimerIcon />
          {formatRest(rest)}
        </TooltipTrigger>
        <TooltipContent>Rest after each set</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="min-w-40">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Rest after each set</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            onValueChange={(value: string) =>
              updateExercise(exercise, {
                rest: value === GYM_REST ? null : Number(value),
              })
            }
            value={
              exercise.rest === undefined ? GYM_REST : String(exercise.rest)
            }
          >
            <DropdownMenuRadioItem value={GYM_REST}>
              Gym’s ({formatRest(gym.rest)})
            </DropdownMenuRadioItem>
            {REST_CHOICES.map((seconds) => (
              <DropdownMenuRadioItem key={seconds} value={String(seconds)}>
                {formatRest(seconds)}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Weight moved in sets that count, to tell against last time. */
function workingVolume(sets: readonly GymSet[]): number {
  return sets.filter(isWorking).reduce((sum, set) => sum + setVolume(set), 0);
}

/** The exercise's name, opening it, and what can be done to it in the workout. */
function EntryHeader({
  gym,
  entry,
  exercise,
  mode,
  canMoveUp,
  canMoveDown,
  onOpenExercise,
  onNote,
}: {
  gym: Gym;
  entry: WorkoutEntry;
  exercise: Exercise;
  mode: EntryMode;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onOpenExercise: (exerciseId: string) => void;
  onNote: () => void;
}) {
  return (
    <header className="flex items-center gap-3">
      <ExerciseBadge exercise={exercise} size="md" />
      <button
        className="group/name focus-visible:ring-ring/50 flex min-w-0 flex-1 flex-col rounded-lg text-left outline-none focus-visible:ring-3"
        onClick={() => onOpenExercise(exercise._id)}
        type="button"
      >
        <span className="decoration-foreground/30 truncate font-medium underline-offset-4 group-hover/name:underline">
          {exercise.name}
        </span>
        <span className="text-muted-foreground truncate text-xs">
          {musclesLine(exercise) || KIND_INFO[exercise.kind].label}
        </span>
      </button>
      {mode === "live" && <RestMenu exercise={exercise} gym={gym} />}
      {mode !== "read" && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                aria-label={`More for ${exercise.name}`}
                className="text-muted-foreground"
                size="icon-sm"
                variant="ghost"
              />
            }
          >
            <EllipsisIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onNote}>
              <PencilIcon />
              {entry.note ? "Edit note" : "Add note"}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!canMoveUp}
              onClick={() => moveEntry(entry, "up")}
            >
              <ArrowUpIcon />
              Move up
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!canMoveDown}
              onClick={() => moveEntry(entry, "down")}
            >
              <ArrowDownIcon />
              Move down
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => removeEntry(entry)}
              variant="destructive"
            >
              <Trash2Icon />
              Remove from workout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </header>
  );
}

/** What was done the last time, to beat. */
function LastTime({
  previous,
  kind,
  units,
}: {
  previous: NonNullable<WorkoutEntry["previous"]>;
  kind: ExerciseKind;
  units: UnitSystem;
}) {
  const today = useToday();
  return (
    <p className="text-muted-foreground truncate px-1 text-xs">
      <span className="text-foreground/70 mr-2 font-medium">
        Last time · {dayLabel(format(previous.at, "yyyy-MM-dd"), today)}
      </span>
      {previous.sets
        .filter((set) => set.type !== "warmup")
        .map((set) => formatSet(set, kind, units))
        .join(" · ")}
    </p>
  );
}

/** Last time's numbers poured into a set's empty fields. */
function fillFrom(set: GymSet, last: GymSet | undefined): GymSet {
  return last
    ? {
        ...set,
        meters: set.meters ?? last.meters,
        reps: set.reps ?? last.reps,
        seconds: set.seconds ?? last.seconds,
        weight: set.weight ?? last.weight,
      }
    : set;
}

/**
 * The sets to fill in and check off. Checking one off in a workout under
 * way starts the rest; in one that's over, filling one in is enough.
 */
function SetTable({
  gym,
  workout,
  entry,
  exercise,
  live,
}: {
  gym: Gym;
  workout: Workout;
  entry: WorkoutEntry;
  exercise: Exercise;
  live: boolean;
}) {
  const { units } = gym;
  const { kind } = exercise;
  const table = useRef<HTMLDivElement>(null);
  const [missing, setMissing] = useState<string>();
  const labels = setLabels(entry.sets);
  const records = recordsBySet(kind, entry);
  const previous = entry.previous?.sets;

  const commit = (sets: GymSet[], restSeconds?: number) =>
    setSets(workout, entry, sets, restSeconds);

  const change = (index: number, changes: Partial<GymSet>) => {
    const set = entry.sets[index];
    if (!set) {
      return;
    }
    const next = { ...set, ...changes };
    // In a workout that's over, a set filled in is one that was done.
    if (!(live || set.done) && isFilled(kind, next)) {
      next.done = true;
    }
    if (missing === set.id && isFilled(kind, next)) {
      setMissing(undefined);
    }
    commit(entry.sets.with(index, next));
  };

  const check = (index: number) => {
    const set = entry.sets[index];
    if (!set) {
      return;
    }
    if (set.done) {
      commit(entry.sets.with(index, { ...set, done: false }));
      return;
    }
    const filled = isFilled(kind, set) ? set : fillFrom(set, previous?.[index]);
    if (!isFilled(kind, filled)) {
      setMissing(set.id);
      table.current
        ?.querySelector<HTMLInputElement>(`[data-set="${set.id}"] input`)
        ?.focus();
      return;
    }
    setMissing(undefined);
    playSound("tap");
    commit(
      entry.sets.with(index, { ...filled, done: true }),
      live ? restOf(exercise, gym) : undefined
    );
  };

  const addSet = () => {
    const last = entry.sets.at(-1);
    commit([
      ...entry.sets,
      {
        done: false,
        id: newSetId(),
        meters: last?.meters,
        reps: last?.reps,
        seconds: last?.seconds,
        type: "normal",
        weight: last?.weight,
      },
    ]);
  };

  return (
    <div className="flex flex-col gap-1" ref={table}>
      {entry.sets.length > 0 && <Headings kind={kind} units={units} />}
      <AnimatePresence initial={false}>
        {entry.sets.map((set, index) => (
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.1 } }}
            initial={{ opacity: 0, y: -4 }}
            key={set.id}
            layout="position"
            transition={{ duration: 0.2, ease: EASE_OUT }}
          >
            <SetRow
              kind={kind}
              label={labels[index] ?? ""}
              missing={missing === set.id}
              onChange={(changes) => change(index, changes)}
              onCheck={() => check(index)}
              onRemove={() => commit(entry.sets.toSpliced(index, 1))}
              previous={previous?.[index]}
              records={records.get(set.id)}
              set={set}
              units={units}
            />
            {set.drops?.map((drop, at) => (
              <DropRow
                drop={drop}
                // Drops have no ids; they only change as a whole with their set.
                // oxlint-disable-next-line react/no-array-index-key
                key={at}
                label={`Drop ${at + 1} of set ${labels[index] ?? ""}`}
                onChange={(next) =>
                  change(index, { drops: (set.drops ?? []).with(at, next) })
                }
                onRemove={() =>
                  change(index, { drops: (set.drops ?? []).toSpliced(at, 1) })
                }
                units={units}
              />
            ))}
          </motion.div>
        ))}
      </AnimatePresence>
      {entry.sets.length < MAX_SETS && (
        <Button
          className="text-muted-foreground mt-1 w-full"
          onClick={addSet}
          size="sm"
          variant="ghost"
        >
          <PlusIcon />
          Add set
        </Button>
      )}
    </div>
  );
}

/** The sets as they were done, against the same sets last time. */
function ReadSets({
  entry,
  exercise,
  units,
}: {
  entry: WorkoutEntry;
  exercise: Exercise;
  units: UnitSystem;
}) {
  const done = entry.sets.filter((set) => set.done);
  const labels = setLabels(done);
  const records = recordsBySet(exercise.kind, entry);
  return (
    <ul className="flex flex-col px-1">
      {done.map((set, index) => (
        <ReadRow
          key={set.id}
          kind={exercise.kind}
          label={labels[index] ?? ""}
          previous={entry.previous?.sets[index]}
          records={records.get(set.id)}
          set={set}
          units={units}
        />
      ))}
    </ul>
  );
}

/** How the exercise's volume did against last time, as a share. */
function VolumeAgainst({
  entry,
  units,
}: {
  entry: WorkoutEntry;
  units: UnitSystem;
}) {
  const today = useToday();
  const before = entry.previous ? workingVolume(entry.previous.sets) : 0;
  const now = workingVolume(entry.sets);
  if (!(entry.previous && before > 0 && now > 0)) {
    return null;
  }
  const change = Math.round(((now - before) / before) * 100);
  return (
    <p className="text-muted-foreground px-1 text-xs">
      <span
        className={cn(
          "font-medium tabular-nums",
          change > 0 && "text-green-600 dark:text-green-400",
          change < 0 && "text-foreground/70"
        )}
      >
        {change > 0 ? "+" : ""}
        {change}%
      </span>{" "}
      volume against {dayLabel(format(entry.previous.at, "yyyy-MM-dd"), today)}{" "}
      ({formatVolume(now, units)})
    </p>
  );
}

interface EntryCardProps {
  gym: Gym;
  workout: Workout;
  entry: WorkoutEntry;
  exercise: Exercise;
  mode: EntryMode;
  /** Whether there's an exercise before it and after it, to move past. */
  canMoveUp: boolean;
  canMoveDown: boolean;
  onOpenExercise: (exerciseId: string) => void;
}

/** An exercise in a workout: its sets against last time's, and what can be done to it. */
export function EntryCard({
  gym,
  workout,
  entry,
  exercise,
  mode,
  canMoveUp,
  canMoveDown,
  onOpenExercise,
}: EntryCardProps) {
  const [noteOpen, setNoteOpen] = useState(false);
  const editable = mode !== "read";

  // A record beaten while the workout's under way gets a cheer.
  const prs = useRef(entry.prs.length);
  useEffect(() => {
    if (mode === "live" && entry.prs.length > prs.current) {
      playSound("sparkle");
    }
    prs.current = entry.prs.length;
  }, [entry.prs.length, mode]);

  return (
    <motion.article
      animate={{ opacity: 1, y: 0 }}
      aria-label={exercise.name}
      className={cn(PANEL, "flex flex-col gap-3 p-3 sm:p-4")}
      exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.15 } }}
      initial={{ opacity: 0, y: 8 }}
      layout="position"
      transition={{ duration: 0.25, ease: EASE_OUT }}
    >
      <EntryHeader
        canMoveDown={canMoveDown}
        canMoveUp={canMoveUp}
        entry={entry}
        exercise={exercise}
        gym={gym}
        mode={mode}
        onNote={() => setNoteOpen(true)}
        onOpenExercise={onOpenExercise}
      />
      {entry.previous && editable && (
        <LastTime
          kind={exercise.kind}
          previous={entry.previous}
          units={gym.units}
        />
      )}
      {editable ? (
        <SetTable
          entry={entry}
          exercise={exercise}
          gym={gym}
          live={mode === "live"}
          workout={workout}
        />
      ) : (
        <ReadSets entry={entry} exercise={exercise} units={gym.units} />
      )}
      {(noteOpen || entry.note) && editable && (
        <NoteField
          autoFocus={noteOpen}
          entry={entry}
          onEmptied={() => setNoteOpen(false)}
        />
      )}
      {entry.note && !editable && (
        <p className="text-muted-foreground px-1 text-sm">{entry.note}</p>
      )}
      {mode === "read" && exercise.kind === "weight" && (
        <VolumeAgainst entry={entry} units={gym.units} />
      )}
    </motion.article>
  );
}
