import type { Id } from "@convex/_generated/dataModel";
import { cn } from "cn";
import { format } from "date-fns";
import {
  BookmarkPlusIcon,
  DumbbellIcon,
  EllipsisIcon,
  PencilIcon,
  PlusIcon,
  Repeat2Icon,
  Trash2Icon,
} from "lucide-react";
import { AnimatePresence } from "motion/react";
import type { KeyboardEvent } from "react";
import { useEffect, useId, useRef, useState } from "react";
import { Link, useLocation, useSearchParams } from "wouter";

import { ProjectAvatar } from "@/components/project-avatar";
import { TopBar } from "@/components/top-bar";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Empty, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { EntryCard } from "@/features/gym/entry-card";
import type { EntryMode } from "@/features/gym/entry-card";
import { ExercisePicker } from "@/features/gym/exercise-picker";
import { ExerciseSheet } from "@/features/gym/exercise-sheet";
import {
  gymPath,
  useOpenExercise,
  useStartWorkout,
} from "@/features/gym/gym-context";
import { LiveDot, PANEL } from "@/features/gym/gym-parts";
import {
  DeleteWorkoutAlert,
  FinishDialog,
  SaveRoutineDialog,
} from "@/features/gym/workout-dialogs";
import { useExercises, useSecond, useWorkout } from "@/hooks/use-gym";
import { useToday } from "@/hooks/use-today";
import type { Exercise, Gym, Workout, WorkoutEntry } from "@/lib/gym";
import {
  MAX_ENTRIES,
  MAX_GYM_NOTE,
  MAX_WORKOUT_TITLE,
  formatClock,
  formatDuration,
  formatVolume,
  sumWorkout,
  workoutSeconds,
} from "@/lib/gym";
import { addExercises, finishWorkout, updateWorkout } from "@/lib/gym-actions";
import type { Project } from "@/lib/project";
import { canEdit, projectPath } from "@/lib/project";

/** Keeps the screen on while the workout's under way, so the timers stay in sight. */
function useWakeLock(on: boolean) {
  useEffect(() => {
    if (!(on && "wakeLock" in navigator)) {
      return;
    }
    let lock: WakeLockSentinel | undefined;
    let stopped = false;
    const take = async () => {
      try {
        lock = await navigator.wakeLock.request("screen");
        if (stopped) {
          await lock.release();
        }
      } catch {
        // Refused, like on low battery: the screen just sleeps as usual.
      }
    };
    take();
    // The lock goes when the page is hidden; it's taken again on return.
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        take();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisible);
      lock?.release();
    };
  }, [on]);
}

/** The workout's name, typed over in place and saved as it's left. */
function TitleInput({
  workout,
  editable,
}: {
  workout: Workout;
  editable: boolean;
}) {
  const [draft, setDraft] = useState<string>();
  // Escape leaves the name as it was, though leaving the field saves it.
  const cancelled = useRef(false);
  const commit = () => {
    const title = draft?.trim();
    if (!cancelled.current && title && title !== workout.title) {
      updateWorkout(workout, { title });
    }
    cancelled.current = false;
    setDraft(undefined);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.currentTarget.blur();
    } else if (event.key === "Escape") {
      event.stopPropagation();
      cancelled.current = true;
      event.currentTarget.blur();
    }
  };
  if (!editable) {
    return (
      <h1 className="truncate text-2xl font-semibold tracking-tight">
        {workout.title}
      </h1>
    );
  }
  return (
    <input
      aria-label="Workout name"
      autoComplete="off"
      className="hover:bg-foreground/5 focus-visible:bg-foreground/5 -mx-2 w-[calc(100%+1rem)] min-w-0 rounded-lg px-2 py-0.5 text-2xl font-semibold tracking-tight transition-[background-color] duration-150 ease-out outline-none"
      maxLength={MAX_WORKOUT_TITLE}
      onBlur={commit}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={onKeyDown}
      value={draft ?? workout.title}
    />
  );
}

/** When it ran: "Tue, Oct 13 · 6:42–7:58 PM", or when it started, while it's under way. */
function whenLine(workout: Workout): string {
  const day = format(workout.startedAt, "EEE, MMM d");
  const start = format(workout.startedAt, "p");
  if (workout.endedAt === undefined) {
    return `Started ${start}`;
  }
  return `${day} · ${start}–${format(workout.endedAt, "p")}`;
}

function StatCell({
  label,
  value,
  live = false,
}: {
  label: string;
  value: string | number;
  live?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-0.5 px-2 py-3 sm:py-4">
      <span
        className={cn(
          "truncate text-lg font-semibold tracking-tight tabular-nums sm:text-xl",
          live && "text-orange-600 dark:text-orange-400"
        )}
      >
        {value}
      </span>
      <span className="text-muted-foreground truncate text-xs">{label}</span>
    </div>
  );
}

/** Time, volume, sets and records, ticking along while it's under way. */
function Stats({
  gym,
  workout,
  entries,
}: {
  gym: Gym;
  workout: Workout;
  entries: readonly WorkoutEntry[];
}) {
  const live = workout.endedAt === undefined;
  const now = useSecond(live);
  const sums = sumWorkout(entries);
  const seconds = workoutSeconds(workout, now);
  return (
    <section
      aria-label="So far"
      className={cn(PANEL, "grid grid-cols-4 divide-x")}
    >
      <StatCell
        label="Time"
        live={live}
        value={live ? formatClock(seconds) : formatDuration(seconds)}
      />
      <StatCell label="Volume" value={formatVolume(sums.volume, gym.units)} />
      <StatCell label="Sets" value={sums.sets} />
      <StatCell label="Records" value={sums.prs} />
    </section>
  );
}

/** `datetime-local`'s way of writing a moment, in the person's time. */
function localInput(ms: number): string {
  return format(ms, "yyyy-MM-dd'T'HH:mm");
}

/** When a workout that's over started and how long it took, to put right. */
function WhenFields({ workout }: { workout: Workout }) {
  const id = useId();
  const today = useToday();
  // At least a minute, so moving the start never ends it where it starts.
  const minutes = Math.max(
    1,
    Math.round(((workout.endedAt ?? 0) - workout.startedAt) / 60_000)
  );
  const [start, setStart] = useState<string>();
  const [duration, setDuration] = useState<string>();
  // Saved as the field is left, not while a year is half typed.
  const commitStart = () => {
    const startedAt = start ? new Date(start).getTime() : Number.NaN;
    if (Number.isFinite(startedAt) && startedAt !== workout.startedAt) {
      updateWorkout(workout, {
        date: format(startedAt, "yyyy-MM-dd"),
        endedAt: startedAt + minutes * 60_000,
        startedAt,
      });
    }
    setStart(undefined);
  };
  const commitDuration = () => {
    const next = Number(duration);
    if (duration !== undefined && Number.isFinite(next) && next > 0) {
      updateWorkout(workout, {
        endedAt: workout.startedAt + Math.round(next) * 60_000,
      });
    }
    setDuration(undefined);
  };
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-3">
      <div className="flex min-w-0 flex-col gap-2">
        <Label htmlFor={`${id}-start`}>Started</Label>
        <Input
          id={`${id}-start`}
          max={`${today}T23:59`}
          onBlur={commitStart}
          onChange={(event) => setStart(event.target.value)}
          type="datetime-local"
          value={start ?? localInput(workout.startedAt)}
        />
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <Label htmlFor={`${id}-minutes`}>Minutes</Label>
        <Input
          id={`${id}-minutes`}
          inputMode="numeric"
          min={1}
          onBlur={commitDuration}
          onChange={(event) => setDuration(event.target.value)}
          type="number"
          value={duration ?? String(minutes)}
        />
      </div>
    </div>
  );
}

/** How it went, in a line or two, saved as it's left. */
function NoteField({
  workout,
  editable,
}: {
  workout: Workout;
  editable: boolean;
}) {
  const [draft, setDraft] = useState<string>();
  if (!editable) {
    return workout.note ? (
      <p className="text-muted-foreground px-1 text-sm whitespace-pre-line">
        {workout.note}
      </p>
    ) : null;
  }
  return (
    <Textarea
      aria-label="Workout note"
      className="min-h-20 resize-none"
      maxLength={MAX_GYM_NOTE}
      onBlur={() => {
        const note = draft?.trim();
        if (note !== undefined && note !== workout.note) {
          updateWorkout(workout, { note });
        }
        setDraft(undefined);
      }}
      onChange={(event) => setDraft(event.target.value)}
      placeholder="How did it go?"
      value={draft ?? workout.note}
    />
  );
}

type Dialog = "add" | "finish" | "delete" | "routine";

/** What the top bar offers: finishing, wrapping up edits, or changing one that's over. */
function WorkoutActions({
  project,
  workout,
  mode,
  onDialog,
  onEditing,
}: {
  project: Project;
  workout: Workout;
  mode: EntryMode;
  onDialog: (dialog: Dialog) => void;
  onEditing: (editing: boolean) => void;
}) {
  const start = useStartWorkout(project);
  if (mode === "live") {
    return (
      <Button onClick={() => onDialog("finish")} size="sm">
        Finish
      </Button>
    );
  }
  if (mode === "edit") {
    return (
      <Button
        onClick={() => {
          // Sets not done go, and exercises left with none: in a workout
          // that's over, filling a set in checks it off.
          finishWorkout(workout, "drop");
          onEditing(false);
        }}
        size="sm"
      >
        Done
      </Button>
    );
  }
  if (!canEdit(project)) {
    return null;
  }
  return (
    <>
      <Button onClick={() => onEditing(true)} size="sm" variant="outline">
        <PencilIcon />
        Edit
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              aria-label="More for this workout"
              size="icon-sm"
              variant="ghost"
            />
          }
        >
          <EllipsisIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => start({ repeat: workout })}>
            <Repeat2Icon />
            Do it again
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onDialog("routine")}>
            <BookmarkPlusIcon />
            Save as routine
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => onDialog("delete")}
            variant="destructive"
          >
            <Trash2Icon />
            Delete workout
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

/** The workout's name and when, what it came to, and its exercises. */
function WorkoutBody({
  gym,
  workout,
  entries,
  exercises,
  mode,
  onDialog,
  onOpenExercise,
}: {
  gym: Gym;
  workout: Workout;
  entries: readonly WorkoutEntry[];
  exercises: ReadonlyMap<string, Exercise>;
  mode: EntryMode;
  onDialog: (dialog: Dialog) => void;
  onOpenExercise: (exerciseId: string) => void;
}) {
  const live = workout.endedAt === undefined;
  // Read back, only what was done shows, as the sums count it.
  const shown = entries.filter(
    (entry) =>
      exercises.has(entry.exerciseId) &&
      (mode !== "read" || entry.sets.some((set) => set.done))
  );

  // Exercises just added are scrolled to.
  const count = useRef(entries.length);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (entries.length > count.current) {
      list.current?.lastElementChild?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
    count.current = entries.length;
  }, [entries.length]);

  return (
    <>
      <header className="flex flex-col gap-1">
        <TitleInput editable={mode !== "read"} workout={workout} />
        <p className="text-muted-foreground flex items-center gap-2 text-sm">
          {live && (
            <>
              <LiveDot />
              Under way
              <span aria-hidden>·</span>
            </>
          )}
          {whenLine(workout)}
        </p>
      </header>
      <Stats entries={entries} gym={gym} workout={workout} />
      {mode === "edit" && <WhenFields workout={workout} />}
      <div className="flex flex-col gap-3" ref={list}>
        <AnimatePresence initial={false}>
          {shown.map((entry, index) => {
            const exercise = exercises.get(entry.exerciseId);
            return (
              exercise && (
                <EntryCard
                  canMoveDown={index < shown.length - 1}
                  canMoveUp={index > 0}
                  entry={entry}
                  exercise={exercise}
                  gym={gym}
                  key={entry._id}
                  mode={mode}
                  onOpenExercise={onOpenExercise}
                  workout={workout}
                />
              )
            );
          })}
        </AnimatePresence>
      </div>
      {mode === "read" && shown.length === 0 && (
        <p className="text-muted-foreground py-6 text-center text-sm">
          No exercises in this workout.
        </p>
      )}
      {mode !== "read" && entries.length < MAX_ENTRIES && (
        <button
          className={cn(
            "text-muted-foreground hover:text-foreground hover:bg-foreground/3 focus-visible:ring-ring/50 flex items-center justify-center gap-2 rounded-2xl border border-dashed text-sm font-medium transition-[background-color,color,scale] duration-150 ease-out outline-none focus-visible:ring-3 active:scale-[0.99]",
            shown.length === 0 ? "h-36 flex-col" : "h-14"
          )}
          onClick={() => onDialog("add")}
          type="button"
        >
          <PlusIcon aria-hidden className="size-5" />
          {shown.length === 0 ? "Add your first exercise" : "Add exercises"}
        </button>
      )}
      <NoteField editable={mode !== "read"} workout={workout} />
      {mode === "live" && (
        <Button
          className="text-muted-foreground self-center"
          onClick={() => onDialog("delete")}
          size="sm"
          variant="ghost"
        >
          Discard workout
        </Button>
      )}
    </>
  );
}

interface WorkoutPageProps {
  project: Project;
  gym: Gym;
  workoutId: Id<"gymWorkouts">;
}

/**
 * A workout: the one under way, logged set by set as it happens, or one in
 * the history, to read back or put right.
 */
export function WorkoutPage({ project, gym, workoutId }: WorkoutPageProps) {
  const [, navigate] = useLocation();
  const view = useWorkout(workoutId);
  const { exercises, byId } = useExercises(project);
  const { open: openExercise } = useOpenExercise();
  const [params] = useSearchParams();
  const [dialog, setDialog] = useState<Dialog>();
  // A workout just added to fill in opens ready for it.
  const [editing, setEditing] = useState(() => params.has("edit"));
  const dialogProps = (name: Dialog) => ({
    onOpenChange: (open: boolean) => setDialog(open ? name : undefined),
    open: dialog === name,
  });
  const workout = view?.workout;
  const entries = view?.entries ?? [];
  const live = workout !== undefined && workout.endedAt === undefined;
  const editable = canEdit(project);
  let mode: EntryMode = "read";
  if (editable && live) {
    mode = "live";
  } else if (editable && editing) {
    mode = "edit";
  }
  useWakeLock(live && editable);

  const crumbs = [
    {
      href: projectPath(project),
      icon: <ProjectAvatar project={project} />,
      label: project.title,
    },
    {
      href: gymPath(project),
      icon: <DumbbellIcon className="text-muted-foreground size-4 shrink-0" />,
      label: "Gym",
    },
  ];

  if (view === null) {
    return (
      <>
        <TopBar crumbs={crumbs} />
        <Empty>
          <EmptyTitle>Workout not found</EmptyTitle>
          <Link
            className={buttonVariants({ variant: "outline" })}
            href={gymPath(project, "workouts")}
          >
            Workouts
          </Link>
        </Empty>
      </>
    );
  }

  return (
    <>
      <TopBar crumbs={[...crumbs, { label: workout?.title ?? "Workout" }]}>
        {workout && (
          <WorkoutActions
            mode={mode}
            onDialog={setDialog}
            onEditing={setEditing}
            project={project}
            workout={workout}
          />
        )}
      </TopBar>
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 pt-4 pb-32 sm:px-6">
        {workout ? (
          <WorkoutBody
            entries={entries}
            exercises={byId}
            gym={gym}
            mode={mode}
            onDialog={setDialog}
            onOpenExercise={openExercise}
            workout={workout}
          />
        ) : (
          <div aria-busy className="flex flex-col gap-4">
            <Skeleton className="h-16 w-2/3 rounded-xl" />
            <Skeleton className="h-20 rounded-2xl" />
            <Skeleton className="h-56 rounded-2xl" />
          </div>
        )}
      </main>
      {workout && (
        <>
          <ExercisePicker
            {...dialogProps("add")}
            added={new Set(entries.map((entry) => entry.exerciseId))}
            exercises={exercises}
            gym={gym}
            onPick={(picked) => addExercises(workout, picked)}
          />
          <FinishDialog
            {...dialogProps("finish")}
            entries={entries}
            exercises={byId}
            gym={gym}
            onDiscard={() => setDialog("delete")}
            workout={workout}
          />
          <DeleteWorkoutAlert
            {...dialogProps("delete")}
            onDeleted={() => navigate(gymPath(project), { replace: true })}
            workout={workout}
          />
          <SaveRoutineDialog {...dialogProps("routine")} workout={workout} />
        </>
      )}
      <ExerciseSheet exercises={byId} gym={gym} project={project} />
    </>
  );
}
