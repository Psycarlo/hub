import type { FormEvent } from "react";
import { useId, useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Stat, TrophyChip } from "@/features/gym/gym-parts";
import { useSecond } from "@/hooks/use-gym";
import type { Exercise, Gym, Workout, WorkoutEntry } from "@/lib/gym";
import {
  MAX_ROUTINE_TITLE,
  formatDuration,
  formatVolume,
  isFilled,
  sumWorkout,
  workoutSeconds,
} from "@/lib/gym";
import {
  finishWorkout,
  removeWorkout,
  routineFromWorkout,
} from "@/lib/gym-actions";
import { plural } from "@/lib/utils";

/** Sets filled in but not checked off, which finishing drops unless they're counted. */
function uncheckedSets(
  entries: readonly WorkoutEntry[],
  exercises: ReadonlyMap<string, Exercise>
): number {
  let count = 0;
  for (const entry of entries) {
    const exercise = exercises.get(entry.exerciseId);
    if (exercise) {
      count += entry.sets.filter(
        (set) => !set.done && isFilled(exercise.kind, set)
      ).length;
    }
  }
  return count;
}

/** The entries with every set filled in counted as done, as finishing with "keep" does. */
function withFilledDone(
  entries: readonly WorkoutEntry[],
  exercises: ReadonlyMap<string, Exercise>
): WorkoutEntry[] {
  return entries.map((entry) => {
    const exercise = exercises.get(entry.exerciseId);
    return exercise
      ? {
          ...entry,
          sets: entry.sets.map((set) =>
            isFilled(exercise.kind, set) ? { ...set, done: true } : set
          ),
        }
      : entry;
  });
}

/** Ends the workout under way: what it came to, and what to do with sets not checked off. */
export function FinishDialog({
  gym,
  workout,
  entries,
  exercises,
  open,
  onOpenChange,
  onDiscard,
}: {
  gym: Gym;
  workout: Workout;
  entries: readonly WorkoutEntry[];
  exercises: ReadonlyMap<string, Exercise>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Offered when nothing's been done, in place of finishing. */
  onDiscard: () => void;
}) {
  const id = useId();
  const now = useSecond(open);
  const [keep, setKeep] = useState(false);
  const [saving, setSaving] = useState(false);
  const checked = entries.some((entry) => entry.sets.some((set) => set.done));
  const unchecked = uncheckedSets(entries, exercises);
  const done = checked || unchecked > 0;
  // With nothing checked off, the sets filled in are the workout.
  const counting = keep || !checked;
  const sums = sumWorkout(
    counting ? withFilledDone(entries, exercises) : entries
  );

  const finish = async () => {
    setSaving(true);
    const result = await finishWorkout(workout, counting ? "keep" : "drop");
    setSaving(false);
    if (result !== undefined) {
      onOpenChange(false);
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>
            {done ? "Finish workout?" : "Nothing done yet"}
          </DialogTitle>
          {!done && (
            <DialogDescription>
              Fill in a set to keep this workout, or discard it.
            </DialogDescription>
          )}
          {done && !checked && (
            <DialogDescription>
              None are checked off, so the {plural(unchecked, "set")} you filled
              in count as done.
            </DialogDescription>
          )}
        </DialogHeader>
        {done && (
          <div className="bg-foreground/3 grid grid-cols-3 gap-3 rounded-xl p-4">
            <Stat
              label="Time"
              value={formatDuration(workoutSeconds(workout, now))}
            />
            <Stat label="Volume" value={formatVolume(sums.volume, gym.units)} />
            <Stat
              label="Sets"
              note={sums.prs > 0 && <TrophyChip count={sums.prs} />}
              value={sums.sets}
            />
          </div>
        )}
        {checked && unchecked > 0 && (
          <label
            className="flex cursor-pointer items-center gap-3 select-none"
            htmlFor={`${id}-keep`}
          >
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-sm font-medium" id={`${id}-keep-label`}>
                Count {plural(unchecked, "filled-in set")} as done
              </span>
              <span
                className="text-muted-foreground text-xs"
                id={`${id}-keep-hint`}
              >
                Otherwise sets not checked off are dropped.
              </span>
            </span>
            <Switch
              aria-describedby={`${id}-keep-hint`}
              aria-labelledby={`${id}-keep-label`}
              checked={keep}
              id={`${id}-keep`}
              onCheckedChange={setKeep}
            />
          </label>
        )}
        <DialogFooter>
          {!done && (
            <Button
              className="sm:mr-auto"
              onClick={() => {
                onOpenChange(false);
                onDiscard();
              }}
              variant="destructive"
            >
              Discard workout
            </Button>
          )}
          <DialogClose render={<Button variant="ghost" />}>
            Keep going
          </DialogClose>
          {done && (
            <Button disabled={saving} onClick={finish}>
              {saving && <Spinner />}
              Finish
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Asks before a workout goes, with everything done in it. */
export function DeleteWorkoutAlert({
  workout,
  open,
  onOpenChange,
  onDeleted,
}: {
  workout: Workout;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}) {
  const live = workout.endedAt === undefined;
  return (
    <AlertDialog onOpenChange={onOpenChange} open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {live ? "Discard this workout?" : `Delete ${workout.title}?`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            Every set in it disappears, and records it set go back to what they
            were.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              removeWorkout(workout);
              onDeleted();
            }}
            variant="destructive"
          >
            {live ? "Discard workout" : "Delete workout"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Keeps a workout as a routine, under a name of its own. */
export function SaveRoutineDialog({
  workout,
  open,
  onOpenChange,
}: {
  workout: Workout;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const id = useId();
  const [title, setTitle] = useState(workout.title);
  const [saving, setSaving] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) {
      return;
    }
    setSaving(true);
    const routineId = await routineFromWorkout(workout, title.trim());
    setSaving(false);
    if (routineId) {
      onOpenChange(false);
    }
  };
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent showCloseButton={false}>
        <form className="flex flex-col gap-5" onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Save as routine</DialogTitle>
            <DialogDescription>
              Start it again with a tap: its exercises, aiming for the sets you
              did.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${id}-title`}>Name</Label>
            <Input
              autoComplete="off"
              autoFocus
              id={`${id}-title`}
              maxLength={MAX_ROUTINE_TITLE}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Push day"
              value={title}
            />
          </div>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="ghost" />}>
              Cancel
            </DialogClose>
            <Button disabled={!title.trim() || saving} type="submit">
              {saving && <Spinner />}
              Save routine
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
