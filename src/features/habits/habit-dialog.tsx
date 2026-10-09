import { MinusIcon, PlusIcon } from "lucide-react";
import type { FormEvent } from "react";
import { useId, useState } from "react";
import { useLocation } from "wouter";

import { ColorPicker } from "@/components/color-picker";
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  HABIT_ICON_COMPONENTS,
  HabitBadge,
} from "@/features/habits/habit-icon";
import { habitsPath } from "@/features/habits/habits-context";
import { useToday } from "@/hooks/use-today";
import type { HabitDraft } from "@/lib/habit-actions";
import { createHabit, deleteHabit, updateHabit } from "@/lib/habit-actions";
import type { Habit, HabitIcon } from "@/lib/habits";
import { HABIT_ICONS, MAX_GOAL, MAX_HABIT_TITLE, WEEK } from "@/lib/habits";
import type { Project } from "@/lib/project";

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const NEW_HABIT: HabitDraft = {
  color: "green",
  days: [0, 1, 2, 3, 4, 5, 6],
  description: "",
  goal: 1,
  icon: "check",
  title: "",
};

/** The habit's look: its color, then its icon, from the badge beside its name. */
function LookPicker({
  icon,
  color,
  onIcon,
  onColor,
}: {
  icon: HabitIcon;
  color: HabitDraft["color"];
  onIcon: (icon: HabitIcon) => void;
  onColor: (color: HabitDraft["color"]) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger
        aria-label="Icon and color"
        className="focus-visible:ring-ring/50 shrink-0 rounded-lg transition-[scale] duration-150 ease-out outline-none focus-visible:ring-3 active:scale-[0.96]"
      >
        <HabitBadge className="size-9" habit={{ color, icon }} />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        aria-label="Icon and color"
        className="flex w-auto flex-col gap-3"
      >
        <ColorPicker aria-label="Color" onChange={onColor} value={color} />
        <ToggleGroup
          aria-label="Icon"
          className="grid grid-cols-8 gap-1 border-t pt-3"
          onValueChange={(next) => {
            const picked = HABIT_ICONS.find((item) => item === next[0]);
            if (picked) {
              onIcon(picked);
            }
          }}
          value={[icon]}
        >
          {HABIT_ICONS.map((name) => {
            const Icon = HABIT_ICON_COMPONENTS[name];
            return (
              <ToggleGroupItem
                aria-label={name}
                className="text-muted-foreground hover:bg-foreground/5 hover:text-foreground data-pressed:bg-primary/15 data-pressed:text-foreground data-pressed:inset-ring-primary/60 flex size-9 items-center justify-center rounded-lg transition-[background-color,color,box-shadow] duration-150 data-pressed:inset-ring"
                key={name}
                value={name}
              >
                <Icon className="size-4" />
              </ToggleGroupItem>
            );
          })}
        </ToggleGroup>
      </PopoverContent>
    </Popover>
  );
}

/** Which days of the week the habit is due, Monday first. */
function DaysField({
  id,
  days,
  onChange,
}: {
  id: string;
  days: number[];
  onChange: (days: number[]) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium select-none" id={id}>
        Days
      </span>
      <ToggleGroup
        aria-labelledby={id}
        className="gap-1.5"
        multiple
        onValueChange={(next) => {
          // The last day stays: a habit is due on one at least.
          if (next.length > 0) {
            onChange(next.map(Number));
          }
        }}
        value={days.map(String)}
      >
        {WEEK.map((day) => (
          <ToggleGroupItem
            aria-label={DAY_NAMES[day]}
            className="bg-foreground/5 text-muted-foreground hover:bg-foreground/10 hover:text-foreground data-pressed:bg-primary data-pressed:text-primary-foreground flex size-9 items-center justify-center rounded-full text-xs font-medium transition-[background-color,color,scale] duration-150 ease-out active:scale-[0.94]"
            key={day}
            value={String(day)}
          >
            {DAY_NAMES[day]?.[0]}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}

/** Times a day that make the day done, one step at a time or typed. */
function GoalField({
  id,
  goal,
  onChange,
}: {
  id: string;
  goal: number;
  onChange: (goal: number) => void;
}) {
  const set = (value: number) =>
    onChange(Math.min(MAX_GOAL, Math.max(1, Math.round(value) || 1)));
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>Times a day</Label>
      <div className="flex items-center gap-1">
        <Button
          aria-label="Fewer"
          disabled={goal <= 1}
          onClick={() => set(goal - 1)}
          size="icon"
          type="button"
          variant="ghost"
        >
          <MinusIcon />
        </Button>
        <Input
          className="w-12 text-center tabular-nums"
          id={id}
          inputMode="numeric"
          onChange={(event) => set(Number(event.target.value))}
          onFocus={(event) => event.target.select()}
          value={goal}
        />
        <Button
          aria-label="More"
          disabled={goal >= MAX_GOAL}
          onClick={() => set(goal + 1)}
          size="icon"
          type="button"
          variant="ghost"
        >
          <PlusIcon />
        </Button>
      </div>
    </div>
  );
}

function DeleteHabit({
  project,
  habit,
  onDeleted,
}: {
  project: Project;
  habit: Habit;
  onDeleted: () => void;
}) {
  const [, navigate] = useLocation();
  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button className="sm:mr-auto" type="button" variant="destructive" />
        }
      >
        Delete habit
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {habit.title}?</AlertDialogTitle>
          <AlertDialogDescription>
            Every day logged on it disappears, streak included.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              deleteHabit(habit);
              onDeleted();
              navigate(habitsPath(project), { replace: true });
            }}
            variant="destructive"
          >
            Delete habit
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

interface HabitFormProps {
  project: Project;
  /** The habit to change; a new one starts otherwise. */
  habit?: Habit;
  onDone: () => void;
}

function HabitForm({ project, habit, onDone }: HabitFormProps) {
  const id = useId();
  const today = useToday();
  const [location, navigate] = useLocation();
  const [draft, setDraft] = useState<HabitDraft>(() =>
    habit
      ? {
          color: habit.color,
          days: habit.days,
          description: habit.description,
          goal: habit.goal,
          icon: habit.icon,
          title: habit.title,
        }
      : NEW_HABIT
  );
  const [saving, setSaving] = useState(false);
  const valid = draft.title.trim() !== "";
  const change = (changes: Partial<HabitDraft>) =>
    setDraft((current) => ({ ...current, ...changes }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!valid) {
      return;
    }
    const cleaned = {
      ...draft,
      description: draft.description.trim(),
      title: draft.title.trim(),
    };
    if (habit) {
      updateHabit(habit, cleaned);
      onDone();
      return;
    }
    setSaving(true);
    const habitId = await createHabit(project._id, cleaned, today);
    setSaving(false);
    if (habitId) {
      onDone();
      // Habits are checked off side by side, so a new one joins the others.
      if (location !== habitsPath(project)) {
        navigate(habitsPath(project));
      }
    }
  };

  return (
    <form className="flex flex-col gap-5" onSubmit={submit}>
      <DialogHeader>
        <DialogTitle>{habit ? "Habit settings" : "New habit"}</DialogTitle>
      </DialogHeader>

      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-title`}>Name</Label>
        <div className="flex items-center gap-2">
          <LookPicker
            color={draft.color}
            icon={draft.icon}
            onColor={(color) => change({ color })}
            onIcon={(icon) => change({ icon })}
          />
          <Input
            autoComplete="off"
            autoFocus={!habit}
            id={`${id}-title`}
            maxLength={MAX_HABIT_TITLE}
            onChange={(event) => change({ title: event.target.value })}
            placeholder="Morning run"
            value={draft.title}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-description`}>Description</Label>
        <Textarea
          className="min-h-16"
          id={`${id}-description`}
          onChange={(event) => change({ description: event.target.value })}
          value={draft.description}
        />
      </div>

      <div className="flex flex-wrap items-end justify-between gap-5">
        <DaysField
          days={draft.days}
          id={`${id}-days`}
          onChange={(days) => change({ days })}
        />
        <GoalField
          goal={draft.goal}
          id={`${id}-goal`}
          onChange={(goal) => change({ goal })}
        />
      </div>

      <DialogFooter className="mt-1">
        {habit && (
          <DeleteHabit habit={habit} onDeleted={onDone} project={project} />
        )}
        <DialogClose render={<Button type="button" variant="ghost" />}>
          Cancel
        </DialogClose>
        <Button disabled={!valid || saving} type="submit">
          {saving && <Spinner />}
          {habit ? "Save" : "Create habit"}
        </Button>
      </DialogFooter>
    </form>
  );
}

type HabitDialogProps = Omit<HabitFormProps, "onDone"> & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function HabitDialog({
  open,
  onOpenChange,
  ...props
}: HabitDialogProps) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent showCloseButton={false}>
        <HabitForm {...props} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
