import type { Id } from "@convex/_generated/dataModel";
import { cn } from "cn";
import { format } from "date-fns";
import { CheckIcon, PlusIcon, RotateCcwIcon, SearchIcon } from "lucide-react";
import type { KeyboardEvent, ReactNode } from "react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ExerciseForm } from "@/features/gym/exercise-dialog";
import type { RegionFilterValue } from "@/features/gym/gym-parts";
import {
  ExerciseBadge,
  RegionFilter,
  inRegion,
} from "@/features/gym/gym-parts";
import { useToday } from "@/hooks/use-today";
import type { Exercise, Gym } from "@/lib/gym";
import {
  KIND_INFO,
  byRecent,
  exerciseKey,
  matchesSearch,
  musclesLine,
  searchWords,
} from "@/lib/gym";
import { updateExercise } from "@/lib/gym-actions";
import { dayLabel } from "@/lib/log";
import { plural } from "@/lib/utils";

/** Recent exercises listed apart before the rest, while nothing's searched. */
const RECENT = 6;

function ExerciseRow({
  exercise,
  picked,
  added,
  today,
  onToggle,
}: {
  exercise: Exercise;
  picked: boolean;
  /** Already in the workout. */
  added: boolean;
  today: string;
  onToggle: () => void;
}) {
  const line = musclesLine(exercise) || KIND_INFO[exercise.kind].label;
  return (
    <li>
      <button
        aria-pressed={picked}
        className={cn(
          "focus-visible:bg-foreground/5 flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors duration-150 ease-out outline-none",
          picked ? "bg-primary/8" : "hover:bg-foreground/5"
        )}
        onClick={onToggle}
        type="button"
      >
        <span
          aria-hidden
          className={cn(
            "flex size-5 shrink-0 items-center justify-center rounded-full border transition-[background-color,border-color] duration-150 ease-out",
            picked
              ? "border-primary bg-primary text-primary-foreground"
              : "border-foreground/20"
          )}
        >
          {picked && <CheckIcon className="size-3" strokeWidth={3} />}
        </span>
        <ExerciseBadge exercise={exercise} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium">{exercise.name}</span>
          <span className="text-muted-foreground truncate text-xs">{line}</span>
        </span>
        <span className="text-muted-foreground shrink-0 text-xs">
          {added
            ? "In workout"
            : exercise.lastAt &&
              dayLabel(format(exercise.lastAt, "yyyy-MM-dd"), today)}
        </span>
      </button>
    </li>
  );
}

function Group({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      {title && (
        <h3 className="text-muted-foreground px-2 pt-2 pb-1 text-xs font-medium">
          {title}
        </h3>
      )}
      <ul className="flex flex-col">{children}</ul>
    </div>
  );
}

interface PickerProps {
  gym: Gym;
  /** Every exercise of the gym, archived ones included. */
  exercises: readonly Exercise[];
  /** Exercises the workout or routine has already, still offered. */
  added?: ReadonlySet<string>;
  /** What adding says: "Add" to a workout, a routine. */
  action?: string;
  onPick: (exerciseIds: Id<"gymExercises">[]) => void;
  onDone: () => void;
}

function Picker({
  gym,
  exercises,
  added,
  action = "Add",
  onPick,
  onDone,
}: PickerProps) {
  const today = useToday();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<RegionFilterValue>(null);
  const [picked, setPicked] = useState<Id<"gymExercises">[]>([]);
  const [creating, setCreating] = useState<string>();

  const words = searchWords(query);
  const live = exercises.filter((exercise) => !exercise.archived);
  const shown = byRecent(
    live.filter(
      (exercise) => matchesSearch(exercise, words) && inRegion(exercise, filter)
    )
  );
  const key = exerciseKey(query);
  const exact = key
    ? exercises.find((exercise) => exercise.nameKey === key)
    : undefined;
  const browsing = words.length === 0 && filter === null;
  const recent = browsing
    ? shown.filter((exercise) => exercise.lastAt).slice(0, RECENT)
    : [];
  const rest = browsing
    ? shown
        .filter((exercise) => !recent.includes(exercise))
        .toSorted((a, b) => a.name.localeCompare(b.name))
    : shown;

  const toggle = (exerciseId: Id<"gymExercises">) =>
    setPicked((current) =>
      current.includes(exerciseId)
        ? current.filter((id) => id !== exerciseId)
        : [...current, exerciseId]
    );

  const restore = (exercise: Exercise) => {
    updateExercise(exercise, { archived: false });
    setPicked((current) => [...current, exercise._id]);
    setQuery("");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") {
      return;
    }
    event.preventDefault();
    const [only] = shown;
    if (shown.length === 1 && only) {
      toggle(only._id);
      setQuery("");
    } else if (shown.length === 0 && key && !exact) {
      setCreating(query.trim());
    }
  };

  if (creating !== undefined) {
    return (
      <ExerciseForm
        gym={gym}
        name={creating}
        onCancel={() => setCreating(undefined)}
        onCreated={(exerciseId) => {
          setPicked((current) => [...current, exerciseId]);
          setQuery("");
        }}
        onDone={() => setCreating(undefined)}
      />
    );
  }

  const row = (exercise: Exercise) => (
    <ExerciseRow
      added={added?.has(exercise._id) ?? false}
      exercise={exercise}
      key={exercise._id}
      onToggle={() => toggle(exercise._id)}
      picked={picked.includes(exercise._id)}
      today={today}
    />
  );
  return (
    <div className="flex min-h-0 flex-col gap-4">
      <DialogHeader>
        <DialogTitle>Add exercises</DialogTitle>
      </DialogHeader>
      <div className="flex flex-col gap-3">
        <label className="bg-card border-input focus-within:border-ring focus-within:ring-ring/30 dark:bg-input/30 flex h-10 items-center gap-2 rounded-xl border px-3 transition-[border-color,box-shadow] focus-within:ring-3">
          <SearchIcon
            aria-hidden
            className="text-muted-foreground size-4 shrink-0"
          />
          <input
            aria-label="Search or name a new exercise"
            autoComplete="off"
            // A picker opens to be typed in.
            // oxlint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
            className="placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent text-base outline-none md:text-sm"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search, or type a new one"
            value={query}
          />
        </label>
        <RegionFilter
          className="-mx-5 px-5"
          exercises={live}
          onChange={setFilter}
          value={filter}
        />
      </div>

      <div className="-mx-3 flex h-[min(24rem,50dvh)] flex-col overflow-y-auto px-1">
        {key && !exact && (
          <button
            className="hover:bg-foreground/5 focus-visible:bg-foreground/5 flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left text-sm outline-none"
            onClick={() => setCreating(query.trim())}
            type="button"
          >
            <span className="bg-primary/10 text-primary flex size-7 shrink-0 items-center justify-center rounded-lg">
              <PlusIcon aria-hidden className="size-4" />
            </span>
            <span className="min-w-0 truncate">
              Create <span className="font-medium">“{query.trim()}”</span>
            </span>
          </button>
        )}
        {exact?.archived && (
          <button
            className="hover:bg-foreground/5 focus-visible:bg-foreground/5 flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left text-sm outline-none"
            onClick={() => restore(exact)}
            type="button"
          >
            <span className="bg-foreground/5 text-muted-foreground flex size-7 shrink-0 items-center justify-center rounded-lg">
              <RotateCcwIcon aria-hidden className="size-4" />
            </span>
            <span className="min-w-0 truncate">
              Bring back <span className="font-medium">{exact.name}</span>{" "}
              <span className="text-muted-foreground">(archived)</span>
            </span>
          </button>
        )}
        {recent.length > 0 && <Group title="Recent">{recent.map(row)}</Group>}
        {rest.length > 0 && (
          <Group title={recent.length > 0 ? "All exercises" : undefined}>
            {rest.map(row)}
          </Group>
        )}
        {live.length === 0 && !key && (
          <p className="text-muted-foreground m-auto max-w-64 py-8 text-center text-sm">
            Type the name of an exercise to add it. Next time, it’s here to
            pick.
          </p>
        )}
        {live.length > 0 && shown.length === 0 && !key && (
          <p className="text-muted-foreground m-auto py-8 text-center text-sm">
            No exercises here yet.
          </p>
        )}
      </div>

      <DialogFooter>
        <DialogClose render={<Button type="button" variant="ghost" />}>
          Cancel
        </DialogClose>
        <Button
          disabled={picked.length === 0}
          onClick={() => {
            onPick(picked);
            onDone();
          }}
        >
          {picked.length > 0
            ? `${action} ${plural(picked.length, "exercise")}`
            : action}
        </Button>
      </DialogFooter>
    </div>
  );
}

type ExercisePickerProps = Omit<PickerProps, "onDone"> & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** Picks exercises from the gym's, recent ones first, or makes a new one from what's typed. */
export function ExercisePicker({
  open,
  onOpenChange,
  ...props
}: ExercisePickerProps) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-lg" showCloseButton={false}>
        <Picker {...props} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
