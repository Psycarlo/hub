import {
  ArrowDownIcon,
  ArrowUpIcon,
  MinusIcon,
  PlusIcon,
  XIcon,
} from "lucide-react";
import type { FormEvent } from "react";
import { useId, useState } from "react";

import { IconButton } from "@/components/icon-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { ExercisePicker } from "@/features/gym/exercise-picker";
import { ExerciseBadge } from "@/features/gym/gym-parts";
import type { Exercise, Gym, Routine, TargetSet } from "@/lib/gym";
import { MAX_ENTRIES, MAX_ROUTINE_TITLE, MAX_SETS, formatSet } from "@/lib/gym";
import type { RoutineExercise } from "@/lib/gym-actions";
import { createRoutine, updateRoutine } from "@/lib/gym-actions";
import { plural } from "@/lib/utils";

/** Sets a new exercise in a routine starts with: a few of a lift, one of a run or a hold. */
function startingSets(exercise: Exercise): TargetSet[] {
  const count = exercise.kind === "weight" || exercise.kind === "reps" ? 3 : 1;
  return Array.from({ length: count }, () => ({ type: "normal" }));
}

/** An exercise in the routine, with how many sets to aim for. */
function Item({
  gym,
  exercise,
  item,
  first,
  last,
  onChange,
  onMove,
  onRemove,
}: {
  gym: Gym;
  exercise: Exercise;
  item: RoutineExercise;
  first: boolean;
  last: boolean;
  onChange: (sets: TargetSet[]) => void;
  onMove: (by: -1 | 1) => void;
  onRemove: () => void;
}) {
  const working = item.sets.find(
    (set) => set.type !== "warmup" && (set.reps || set.seconds || set.meters)
  );
  const lastSet = item.sets.at(-1);
  return (
    <li className="flex items-center gap-2 py-2">
      <ExerciseBadge exercise={exercise} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium">{exercise.name}</span>
        <span className="text-muted-foreground truncate text-xs">
          {plural(item.sets.length, "set")}
          {working && ` · ${formatSet(working, exercise.kind, gym.units)}`}
        </span>
      </span>
      <span className="bg-foreground/5 flex items-center rounded-full">
        <IconButton
          disabled={item.sets.length <= 1}
          label="One set fewer"
          onClick={() => onChange(item.sets.slice(0, -1))}
          size="icon-xs"
        >
          <MinusIcon />
        </IconButton>
        <span className="w-5 text-center text-xs font-medium tabular-nums">
          {item.sets.length}
        </span>
        <IconButton
          disabled={item.sets.length >= MAX_SETS}
          label="One set more"
          onClick={() =>
            onChange([...item.sets, { ...(lastSet ?? { type: "normal" }) }])
          }
          size="icon-xs"
        >
          <PlusIcon />
        </IconButton>
      </span>
      <span className="flex items-center">
        <IconButton
          disabled={first}
          label="Move up"
          onClick={() => onMove(-1)}
          size="icon-xs"
        >
          <ArrowUpIcon />
        </IconButton>
        <IconButton
          disabled={last}
          label="Move down"
          onClick={() => onMove(1)}
          size="icon-xs"
        >
          <ArrowDownIcon />
        </IconButton>
        <IconButton
          label={`Remove ${exercise.name}`}
          onClick={onRemove}
          size="icon-xs"
        >
          <XIcon />
        </IconButton>
      </span>
    </li>
  );
}

interface RoutineFormProps {
  gym: Gym;
  /** The routine to change; a new one starts otherwise. */
  routine?: Routine;
  exercises: readonly Exercise[];
  byId: ReadonlyMap<string, Exercise>;
  onDone: () => void;
}

function RoutineForm({
  gym,
  routine,
  exercises,
  byId,
  onDone,
}: RoutineFormProps) {
  const id = useId();
  const [title, setTitle] = useState(routine?.title ?? "");
  const [items, setItems] = useState<RoutineExercise[]>(
    () => routine?.exercises.filter((item) => byId.has(item.exerciseId)) ?? []
  );
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);
  const valid = title.trim() !== "" && items.length > 0;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!valid) {
      return;
    }
    if (routine) {
      updateRoutine(routine, { exercises: items, title: title.trim() });
      onDone();
      return;
    }
    setSaving(true);
    const routineId = await createRoutine(gym.projectId, title.trim(), items);
    setSaving(false);
    if (routineId) {
      onDone();
    }
  };

  const move = (index: number, by: -1 | 1) => {
    const item = items[index];
    const other = items[index + by];
    if (item && other) {
      setItems(items.with(index, other).with(index + by, item));
    }
  };

  return (
    <>
      <form className="flex flex-col gap-5" onSubmit={submit}>
        <DialogHeader>
          <DialogTitle>{routine ? "Routine" : "New routine"}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-title`}>Name</Label>
          <Input
            autoComplete="off"
            autoFocus={!routine}
            id={`${id}-title`}
            maxLength={MAX_ROUTINE_TITLE}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Push day"
            value={title}
          />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium">Exercises</span>
          {items.length > 0 ? (
            <ul className="flex flex-col divide-y">
              {items.map((item, index) => {
                const exercise = byId.get(item.exerciseId);
                return (
                  exercise && (
                    <Item
                      exercise={exercise}
                      first={index === 0}
                      gym={gym}
                      item={item}
                      key={`${item.exerciseId}-${index}`}
                      last={index === items.length - 1}
                      onChange={(sets) =>
                        setItems(items.with(index, { ...item, sets }))
                      }
                      onMove={(by) => move(index, by)}
                      onRemove={() => setItems(items.toSpliced(index, 1))}
                    />
                  )
                );
              })}
            </ul>
          ) : (
            <p className="text-muted-foreground py-2 text-sm">
              Weights and reps fill in from the last time you did each one.
            </p>
          )}
          {items.length < MAX_ENTRIES && (
            <Button
              className="mt-1 self-start"
              onClick={() => setPicking(true)}
              size="sm"
              type="button"
              variant="outline"
            >
              <PlusIcon />
              Add exercises
            </Button>
          )}
        </div>
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="ghost" />}>
            Cancel
          </DialogClose>
          <Button disabled={!valid || saving} type="submit">
            {saving && <Spinner />}
            {routine ? "Save" : "Create routine"}
          </Button>
        </DialogFooter>
      </form>
      {/* Beside the form, not in it: a submit inside the picker would bubble up to it. */}
      <ExercisePicker
        action="Add"
        added={new Set(items.map((item) => item.exerciseId))}
        exercises={exercises}
        gym={gym}
        onOpenChange={setPicking}
        onPick={(picked) =>
          setItems((current) => [
            ...current,
            ...picked.flatMap((exerciseId) => {
              const exercise = byId.get(exerciseId);
              return exercise
                ? [{ exerciseId, sets: startingSets(exercise) }]
                : [];
            }),
          ])
        }
        open={picking}
      />
    </>
  );
}

type RoutineDialogProps = Omit<RoutineFormProps, "onDone"> & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** Makes or changes a routine: its name and exercises, and sets of each to aim for. */
export function RoutineDialog({
  open,
  onOpenChange,
  ...props
}: RoutineDialogProps) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-lg" showCloseButton={false}>
        <RoutineForm
          // A fresh form for each routine opened.
          key={props.routine?._id ?? "new"}
          {...props}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
