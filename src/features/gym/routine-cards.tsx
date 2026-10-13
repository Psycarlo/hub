import { cn } from "cn";
import { format } from "date-fns";
import {
  EllipsisIcon,
  HistoryIcon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { useState } from "react";

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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ExerciseBadge, PANEL } from "@/features/gym/gym-parts";
import type { Exercise, Routine } from "@/lib/gym";
import { deleteRoutine } from "@/lib/gym-actions";
import { dayLabel } from "@/lib/log";
import { plural } from "@/lib/utils";

function DeleteRoutineAlert({
  routine,
  open,
  onOpenChange,
}: {
  routine: Routine;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <AlertDialog onOpenChange={onOpenChange} open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {routine.title}?</AlertDialogTitle>
          <AlertDialogDescription>
            Workouts started from it stay in your history.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => deleteRoutine(routine)}
            variant="destructive"
          >
            Delete routine
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** A routine to start with a tap: what's in it, and when it was last done. */
function RoutineCard({
  routine,
  exercises,
  today,
  editable,
  onStart,
  onEdit,
}: {
  routine: Routine;
  exercises: ReadonlyMap<string, Exercise>;
  today: string;
  editable: boolean;
  onStart: () => void;
  onEdit: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const items = routine.exercises.flatMap(
    ({ exerciseId }) => exercises.get(exerciseId) ?? []
  );
  const day =
    routine.lastAt && dayLabel(format(routine.lastAt, "yyyy-MM-dd"), today);
  // "Last done today", but "Last done Fri, Oct 10".
  const last = day === "Today" || day === "Yesterday" ? day.toLowerCase() : day;
  return (
    <div className={cn(PANEL, "flex flex-col gap-3 p-4")}>
      <div className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-col">
          <h3 className="truncate font-medium">{routine.title}</h3>
          <p className="text-muted-foreground truncate text-xs">
            {plural(items.length, "exercise")}
            {last && ` · Last done ${last}`}
          </p>
        </div>
        {editable && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  aria-label={`More for ${routine.title}`}
                  className="text-muted-foreground -mt-1 -mr-1"
                  size="icon-sm"
                  variant="ghost"
                />
              }
            >
              <EllipsisIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEdit}>
                <PencilIcon />
                Edit routine
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setDeleting(true)}
                variant="destructive"
              >
                <Trash2Icon />
                Delete routine
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <ul className="flex flex-col gap-1.5">
        {items.slice(0, 4).map((exercise) => (
          <li
            className="flex min-w-0 items-center gap-2 text-sm"
            key={exercise._id}
          >
            <ExerciseBadge exercise={exercise} size="xs" />
            <span className="truncate">{exercise.name}</span>
          </li>
        ))}
        {items.length > 4 && (
          <li className="text-muted-foreground pl-7 text-xs">
            and {items.length - 4} more
          </li>
        )}
      </ul>
      {editable && (
        <Button
          className="mt-auto w-full"
          onClick={onStart}
          size="sm"
          variant="secondary"
        >
          <PlayIcon />
          Start
        </Button>
      )}
      <DeleteRoutineAlert
        onOpenChange={setDeleting}
        open={deleting}
        routine={routine}
      />
    </div>
  );
}

/** Ways to start: empty, or from a routine; and making routines. */
export function StartSection({
  routines,
  exercises,
  today,
  editable,
  onStart,
  onNewRoutine,
  onEditRoutine,
  onLogPast,
}: {
  routines: readonly Routine[];
  exercises: ReadonlyMap<string, Exercise>;
  today: string;
  editable: boolean;
  onStart: (routine?: Routine) => void;
  onNewRoutine: () => void;
  onEditRoutine: (routine: Routine) => void;
  onLogPast: () => void;
}) {
  return (
    <section aria-labelledby="gym-start" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3 px-1">
        <h2
          className="text-muted-foreground text-xs font-medium"
          id="gym-start"
        >
          Start a workout
        </h2>
        {editable && (
          <Button
            className="text-muted-foreground -mr-2"
            onClick={onLogPast}
            size="xs"
            variant="ghost"
          >
            <HistoryIcon />
            Log a past one
          </Button>
        )}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {editable && (
          <button
            className={cn(
              PANEL,
              "group/empty focus-visible:ring-ring/50 hover:shadow-raised flex min-h-36 flex-col items-start justify-between gap-3 p-4 text-left transition-[scale,box-shadow] duration-150 ease-out outline-none focus-visible:ring-3 active:scale-[0.99]"
            )}
            onClick={() => onStart()}
            type="button"
          >
            <span className="flex size-10 items-center justify-center rounded-xl bg-orange-500 text-white shadow-sm transition-transform duration-200 ease-out group-hover/empty:scale-105">
              <PlayIcon
                aria-hidden
                className="size-5 translate-x-px"
                fill="currentColor"
              />
            </span>
            <span className="flex flex-col">
              <span className="font-medium">Empty workout</span>
              <span className="text-muted-foreground text-xs">
                Add exercises as you go
              </span>
            </span>
          </button>
        )}
        {routines.map((routine) => (
          <RoutineCard
            editable={editable}
            exercises={exercises}
            key={routine._id}
            onEdit={() => onEditRoutine(routine)}
            onStart={() => onStart(routine)}
            routine={routine}
            today={today}
          />
        ))}
        {editable && (
          <button
            className="text-muted-foreground hover:text-foreground hover:bg-foreground/3 focus-visible:ring-ring/50 flex min-h-36 flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed p-4 text-center text-sm transition-[background-color,color] duration-150 ease-out outline-none focus-visible:ring-3"
            onClick={onNewRoutine}
            type="button"
          >
            <PlusIcon aria-hidden className="size-5" />
            <span className="font-medium">New routine</span>
            {routines.length === 0 && (
              <span className="max-w-52 text-xs">
                Keep your push, pull or leg day to start it with a tap.
              </span>
            )}
          </button>
        )}
      </div>
    </section>
  );
}
