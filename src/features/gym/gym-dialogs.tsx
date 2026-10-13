import { format } from "date-fns";
import type { FormEvent } from "react";
import { useId, useState } from "react";
import { useLocation } from "wouter";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { workoutPath } from "@/features/gym/gym-context";
import { useToday } from "@/hooks/use-today";
import type { Gym, UnitSystem } from "@/lib/gym";
import {
  MAX_BODY_WEIGHT,
  MAX_WORKOUT_TITLE,
  MIN_BODY_WEIGHT,
  REST_CHOICES,
  formatRest,
  fromLoad,
  parseAmount,
  toLoad,
  weightUnit,
} from "@/lib/gym";
import { addPastWorkout, updateGym } from "@/lib/gym-actions";
import type { Project } from "@/lib/project";

const UNIT_OPTIONS: { value: UnitSystem; label: string }[] = [
  { label: "kg · km", value: "metric" },
  { label: "lb · mi", value: "imperial" },
];

/** Kilograms and kilometers, or pounds and miles, as two tabs. */
export function UnitsField({
  value,
  onChange,
}: {
  value: UnitSystem;
  onChange: (units: UnitSystem) => void;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium select-none" id={id}>
        Units
      </span>
      <Tabs onValueChange={(next: UnitSystem) => onChange(next)} value={value}>
        <TabsList aria-labelledby={id} className="w-full">
          {UNIT_OPTIONS.map((option) => (
            <TabsTrigger
              className="flex-1 justify-center"
              key={option.value}
              value={option.value}
            >
              {option.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </div>
  );
}

function SettingsForm({ gym, onDone }: { gym: Gym; onDone: () => void }) {
  const id = useId();
  const [units, setUnits] = useState(gym.units);
  const [rest, setRest] = useState(gym.rest);
  const [goal, setGoal] = useState(
    gym.goalWeight === undefined
      ? ""
      : String(toLoad(gym.goalWeight, gym.units))
  );
  const goalValue = parseAmount(goal);
  const goalKg =
    goalValue === undefined ? undefined : fromLoad(goalValue, units);
  const goalValid =
    goal.trim() === "" ||
    (goalKg !== undefined &&
      goalKg >= MIN_BODY_WEIGHT &&
      goalKg <= MAX_BODY_WEIGHT);

  const changeUnits = (next: UnitSystem) => {
    // The goal keeps its weight, read in the new unit.
    if (goalKg !== undefined) {
      setGoal(String(toLoad(goalKg, next)));
    }
    setUnits(next);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!goalValid) {
      return;
    }
    updateGym(gym, { goalWeight: goalKg ?? null, rest, units });
    onDone();
  };

  const restItems = REST_CHOICES.map((seconds) => ({
    label: formatRest(seconds),
    value: String(seconds),
  }));

  return (
    <form className="flex flex-col gap-5" onSubmit={submit}>
      <DialogHeader>
        <DialogTitle>Gym settings</DialogTitle>
      </DialogHeader>
      <UnitsField onChange={changeUnits} value={units} />
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium select-none" id={`${id}-rest`}>
          Rest between sets
        </span>
        <Select
          items={restItems}
          onValueChange={(next: string | null) => setRest(Number(next ?? 0))}
          value={String(rest)}
        >
          <SelectTrigger aria-labelledby={`${id}-rest`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {restItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-muted-foreground text-xs">
          Starts when you check off a set. Exercises can have their own.
        </span>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-goal`}>Goal weight</Label>
        <div className="relative">
          <Input
            aria-invalid={!goalValid || undefined}
            autoComplete="off"
            className="pr-10"
            id={`${id}-goal`}
            inputMode="decimal"
            onChange={(event) => setGoal(event.target.value)}
            placeholder="None"
            value={goal}
          />
          <span className="text-muted-foreground pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm">
            {weightUnit(units)}
          </span>
        </div>
      </div>
      <DialogFooter>
        <DialogClose render={<Button type="button" variant="ghost" />}>
          Cancel
        </DialogClose>
        <Button disabled={!goalValid} type="submit">
          Save
        </Button>
      </DialogFooter>
    </form>
  );
}

export function GymSettingsDialog({
  gym,
  open,
  onOpenChange,
}: {
  gym: Gym;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent showCloseButton={false}>
        <SettingsForm gym={gym} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function startedAnHourAgo(): Date {
  return new Date(Date.now() - 60 * 60_000);
}

function PastForm({
  project,
  onDone,
}: {
  project: Project;
  onDone: () => void;
}) {
  const id = useId();
  const today = useToday();
  const [, navigate] = useLocation();
  const [title, setTitle] = useState("Workout");
  // An hour long, ending now: never one that hasn't happened yet.
  const [date, setDate] = useState(() =>
    format(startedAnHourAgo(), "yyyy-MM-dd")
  );
  const [time, setTime] = useState(() => format(startedAnHourAgo(), "HH:mm"));
  const [minutes, setMinutes] = useState("60");
  const [saving, setSaving] = useState(false);
  const startedAt = new Date(`${date}T${time}`).getTime();
  const duration = Number(minutes);
  const valid =
    title.trim() !== "" &&
    Number.isFinite(startedAt) &&
    date <= today &&
    Number.isFinite(duration) &&
    duration > 0 &&
    duration <= 12 * 60;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!valid) {
      return;
    }
    setSaving(true);
    const workoutId = await addPastWorkout(project._id, {
      date,
      endedAt: startedAt + Math.round(duration) * 60_000,
      startedAt,
      title: title.trim(),
    });
    setSaving(false);
    if (workoutId) {
      onDone();
      navigate(`${workoutPath(project, { _id: workoutId })}?edit=1`);
    }
  };

  return (
    <form className="flex flex-col gap-5" onSubmit={submit}>
      <DialogHeader>
        <DialogTitle>Log a past workout</DialogTitle>
        <DialogDescription>
          Fill in its exercises next, as you did them.
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-title`}>Name</Label>
        <Input
          autoComplete="off"
          autoFocus
          id={`${id}-title`}
          maxLength={MAX_WORKOUT_TITLE}
          onChange={(event) => setTitle(event.target.value)}
          value={title}
        />
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_6.5rem_5.5rem] gap-3">
        <div className="flex min-w-0 flex-col gap-2">
          <Label htmlFor={`${id}-date`}>Day</Label>
          <Input
            id={`${id}-date`}
            max={today}
            onChange={(event) => setDate(event.target.value)}
            type="date"
            value={date}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <Label htmlFor={`${id}-time`}>Started</Label>
          <Input
            id={`${id}-time`}
            onChange={(event) => setTime(event.target.value)}
            type="time"
            value={time}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <Label htmlFor={`${id}-minutes`}>Minutes</Label>
          <Input
            id={`${id}-minutes`}
            inputMode="numeric"
            min={1}
            onChange={(event) => setMinutes(event.target.value)}
            type="number"
            value={minutes}
          />
        </div>
      </div>
      <DialogFooter>
        <DialogClose render={<Button type="button" variant="ghost" />}>
          Cancel
        </DialogClose>
        <Button disabled={!valid || saving} type="submit">
          {saving && <Spinner />}
          Add workout
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Adds a workout that's over, then opens it to fill in. */
export function PastWorkoutDialog({
  project,
  open,
  onOpenChange,
}: {
  project: Project;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent showCloseButton={false}>
        <PastForm onDone={() => onOpenChange(false)} project={project} />
      </DialogContent>
    </Dialog>
  );
}
