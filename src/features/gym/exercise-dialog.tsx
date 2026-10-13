import type { Id } from "@convex/_generated/dataModel";
import { cn } from "cn";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { KIND_ICONS, REGION_COLORS } from "@/features/gym/gym-parts";
import type { Exercise, Gym, Muscle } from "@/lib/gym";
import {
  EQUIPMENT,
  EQUIPMENT_LABELS,
  EXERCISE_KINDS,
  KIND_INFO,
  MAX_EXERCISE_NAME,
  MAX_GYM_NOTE,
  MUSCLES,
  MUSCLE_INFO,
  REGIONS,
  REST_CHOICES,
  formatRest,
} from "@/lib/gym";
import type { ExerciseDraft } from "@/lib/gym-actions";
import {
  createExercise,
  deleteExercise,
  updateExercise,
} from "@/lib/gym-actions";
import { CHIP_COLORS } from "@/lib/palette";

/** The rest select's value for taking the gym's. */
const GYM_REST = "gym";
/** The equipment select's value for none. */
const NO_EQUIPMENT = "none";

const BLANK: ExerciseDraft = {
  kind: "weight",
  muscles: [],
  name: "",
  note: "",
  secondary: [],
};

/** What kind of numbers its sets take, as four cards to pick one of. */
function KindField({
  value,
  onChange,
}: {
  value: ExerciseDraft["kind"];
  onChange: (kind: ExerciseDraft["kind"]) => void;
}) {
  const name = useId();
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium select-none">Tracks</legend>
      <div className="grid grid-cols-2 gap-2">
        {EXERCISE_KINDS.map((kind) => {
          const Icon = KIND_ICONS[kind];
          const picked = kind === value;
          return (
            <label
              className={cn(
                "has-focus-visible:ring-ring/50 flex cursor-pointer items-start gap-2.5 rounded-xl border p-2.5 transition-[background-color,border-color,box-shadow,scale] duration-150 ease-out select-none active:scale-[0.98] has-focus-visible:ring-3",
                picked
                  ? "border-primary/60 bg-primary/8 inset-ring-primary/40 inset-ring"
                  : "hover:bg-foreground/3"
              )}
              key={kind}
            >
              <input
                checked={picked}
                className="sr-only"
                name={name}
                onChange={() => onChange(kind)}
                type="radio"
                value={kind}
              />
              <Icon
                aria-hidden
                className={cn(
                  "mt-0.5 size-4 shrink-0",
                  picked ? "text-primary" : "text-muted-foreground"
                )}
              />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium">
                  {KIND_INFO[kind].label}
                </span>
                <span className="text-muted-foreground truncate text-xs">
                  {KIND_INFO[kind].description}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

type Role = "main" | "secondary" | undefined;

/** Main, then along the way, then not at all. */
function nextRole(role: Role): Role {
  if (role === undefined) {
    return "main";
  }
  return role === "main" ? "secondary" : undefined;
}

/**
 * The muscles it trains, by part of the body. A tap marks one as trained
 * most, a second as worked along the way, a third clears it.
 */
function MusclesField({
  muscles,
  secondary,
  onChange,
}: {
  muscles: readonly Muscle[];
  secondary: readonly Muscle[];
  onChange: (muscles: Muscle[], secondary: Muscle[]) => void;
}) {
  const roleOf = (muscle: Muscle): Role => {
    if (muscles.includes(muscle)) {
      return "main";
    }
    return secondary.includes(muscle) ? "secondary" : undefined;
  };
  const toggle = (muscle: Muscle) => {
    const role = nextRole(roleOf(muscle));
    onChange(
      role === "main"
        ? [...muscles, muscle]
        : muscles.filter((item) => item !== muscle),
      role === "secondary"
        ? [...secondary, muscle]
        : secondary.filter((item) => item !== muscle)
    );
  };
  return (
    <fieldset>
      <legend className="text-sm font-medium select-none">Muscles</legend>
      <p className="text-muted-foreground mb-2 text-xs">
        Tap once for main, twice for also worked.
      </p>
      <div className="flex flex-col gap-2">
        {REGIONS.map((region) => (
          <div className="flex flex-wrap items-center gap-1.5" key={region.id}>
            <span className="text-muted-foreground w-16 shrink-0 text-xs">
              {region.label}
            </span>
            {MUSCLES.filter(
              (muscle) => MUSCLE_INFO[muscle].region === region.id
            ).map((muscle) => {
              const role = roleOf(muscle);
              return (
                <button
                  aria-label={`${MUSCLE_INFO[muscle].label}${role ? `, ${role === "main" ? "main" : "also worked"}` : ""}`}
                  aria-pressed={role !== undefined}
                  className={cn(
                    "focus-visible:ring-ring/50 h-7 rounded-full px-2.5 text-xs font-medium transition-[background-color,color,box-shadow,scale] duration-150 ease-out outline-none focus-visible:ring-3 active:scale-[0.96]",
                    role === "main" && CHIP_COLORS[REGION_COLORS[region.id]],
                    role === "secondary" &&
                      "text-foreground/80 inset-ring-foreground/25 inset-ring",
                    !role &&
                      "bg-foreground/5 text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
                  )}
                  key={muscle}
                  onClick={() => toggle(muscle)}
                  type="button"
                >
                  {MUSCLE_INFO[muscle].label}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </fieldset>
  );
}

function DeleteExercise({
  exercise,
  onDeleted,
}: {
  exercise: Exercise;
  onDeleted: () => void;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button className="sm:mr-auto" type="button" variant="destructive" />
        }
      >
        Delete
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {exercise.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            Every set of it disappears from your workouts, records included, and
            it leaves your routines. To keep its history, archive it instead.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              deleteExercise(exercise);
              onDeleted();
            }}
            variant="destructive"
          >
            Delete exercise
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

interface ExerciseFormProps {
  gym: Gym;
  /** The exercise to change; a new one starts otherwise. */
  exercise?: Exercise;
  /** A name to start a new one with, like what was searched for. */
  name?: string;
  onCreated?: (exerciseId: Id<"gymExercises">) => void;
  onDone: () => void;
  /** Goes back instead of closing the dialog, like to a list it was opened from. */
  onCancel?: () => void;
}

/** An exercise's name, what it tracks, the muscles it trains and how it's set up. */
export function ExerciseForm({
  gym,
  exercise,
  name = "",
  onCreated,
  onDone,
  onCancel,
}: ExerciseFormProps) {
  const id = useId();
  const [draft, setDraft] = useState<ExerciseDraft>(() =>
    exercise
      ? {
          equipment: exercise.equipment,
          kind: exercise.kind,
          muscles: exercise.muscles,
          name: exercise.name,
          note: exercise.note,
          rest: exercise.rest,
          secondary: exercise.secondary,
        }
      : { ...BLANK, name }
  );
  const [archived, setArchived] = useState(exercise?.archived ?? false);
  const [saving, setSaving] = useState(false);
  const valid = draft.name.trim() !== "";
  const change = (changes: Partial<ExerciseDraft>) =>
    setDraft((current) => ({ ...current, ...changes }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!valid) {
      return;
    }
    const cleaned = { ...draft, name: draft.name.trim() };
    if (exercise) {
      updateExercise(exercise, {
        ...cleaned,
        archived,
        equipment: cleaned.equipment ?? null,
        rest: cleaned.rest ?? null,
      });
      onDone();
      return;
    }
    setSaving(true);
    const exerciseId = await createExercise(gym.projectId, cleaned);
    setSaving(false);
    if (exerciseId) {
      onCreated?.(exerciseId);
      onDone();
    }
  };

  const equipmentItems = [
    { label: "None", value: NO_EQUIPMENT },
    ...EQUIPMENT.map((item) => ({
      label: EQUIPMENT_LABELS[item],
      value: item,
    })),
  ];
  const restItems = [
    { label: `Gym’s (${formatRest(gym.rest)})`, value: GYM_REST },
    ...REST_CHOICES.map((seconds) => ({
      label: formatRest(seconds),
      value: String(seconds),
    })),
  ];

  return (
    <form className="flex flex-col gap-5" onSubmit={submit}>
      <DialogHeader>
        <DialogTitle>{exercise ? "Exercise" : "New exercise"}</DialogTitle>
      </DialogHeader>

      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-name`}>Name</Label>
        <Input
          autoComplete="off"
          autoFocus={!exercise}
          id={`${id}-name`}
          maxLength={MAX_EXERCISE_NAME}
          onChange={(event) => change({ name: event.target.value })}
          placeholder="Incline chest press"
          value={draft.name}
        />
      </div>

      <KindField onChange={(kind) => change({ kind })} value={draft.kind} />

      <MusclesField
        muscles={draft.muscles}
        onChange={(muscles, secondary) => change({ muscles, secondary })}
        secondary={draft.secondary}
      />

      <div className="grid grid-cols-2 gap-3">
        <div className="flex min-w-0 flex-col gap-2">
          <span className="text-sm font-medium select-none" id={`${id}-eq`}>
            Equipment
          </span>
          <Select
            items={equipmentItems}
            onValueChange={(next: string | null) =>
              change({
                equipment: EQUIPMENT.find((item) => item === next),
              })
            }
            value={draft.equipment ?? NO_EQUIPMENT}
          >
            <SelectTrigger aria-labelledby={`${id}-eq`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {equipmentItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <span className="text-sm font-medium select-none" id={`${id}-rest`}>
            Rest
          </span>
          <Select
            items={restItems}
            onValueChange={(next: string | null) =>
              change({
                rest:
                  next === null || next === GYM_REST ? undefined : Number(next),
              })
            }
            value={draft.rest === undefined ? GYM_REST : String(draft.rest)}
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
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-note`}>Setup</Label>
        <Input
          autoComplete="off"
          id={`${id}-note`}
          maxLength={MAX_GYM_NOTE}
          onChange={(event) => change({ note: event.target.value })}
          placeholder="Seat on 4, pins on 3"
          value={draft.note}
        />
      </div>

      {exercise && (
        <label
          className="flex cursor-pointer items-center gap-3 select-none"
          htmlFor={`${id}-archived`}
        >
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-sm font-medium" id={`${id}-archived-label`}>
              Archived
            </span>
            <span
              className="text-muted-foreground text-xs"
              id={`${id}-archived-hint`}
            >
              Keeps its history, but it’s no longer offered to pick.
            </span>
          </span>
          <Switch
            aria-describedby={`${id}-archived-hint`}
            aria-labelledby={`${id}-archived-label`}
            checked={archived}
            id={`${id}-archived`}
            onCheckedChange={setArchived}
          />
        </label>
      )}

      <DialogFooter className="mt-1">
        {exercise && <DeleteExercise exercise={exercise} onDeleted={onDone} />}
        {onCancel ? (
          <Button onClick={onCancel} type="button" variant="ghost">
            Back
          </Button>
        ) : (
          <DialogClose render={<Button type="button" variant="ghost" />}>
            Cancel
          </DialogClose>
        )}
        <Button disabled={!valid || saving} type="submit">
          {saving && <Spinner />}
          {exercise ? "Save" : "Create exercise"}
        </Button>
      </DialogFooter>
    </form>
  );
}

type ExerciseDialogProps = Omit<ExerciseFormProps, "onDone"> & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function ExerciseDialog({
  open,
  onOpenChange,
  ...props
}: ExerciseDialogProps) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-lg" showCloseButton={false}>
        <ExerciseForm {...props} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
