import { cn } from "cn";
import { format } from "date-fns";
import {
  ChevronDownIcon,
  DumbbellIcon,
  PlusIcon,
  SearchIcon,
} from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyTitle } from "@/components/ui/empty";
import type { RegionFilterValue } from "@/features/gym/gym-parts";
import {
  ExerciseBadge,
  PANEL,
  RegionFilter,
  inRegion,
} from "@/features/gym/gym-parts";
import type { Exercise, Gym } from "@/lib/gym";
import {
  KIND_INFO,
  RECORDS_OF,
  RECORD_LABELS,
  formatRecord,
  matchesSearch,
  musclesLine,
  searchWords,
} from "@/lib/gym";
import { dayLabel } from "@/lib/log";

function ExerciseRow({
  gym,
  exercise,
  today,
  onOpen,
}: {
  gym: Gym;
  exercise: Exercise;
  today: string;
  onOpen: () => void;
}) {
  const [lead] = RECORDS_OF[exercise.kind];
  const record = exercise.records.find((item) => item.kind === lead);
  return (
    <li>
      <button
        className="hover:bg-foreground/3 focus-visible:bg-foreground/3 flex w-full items-center gap-3 px-4 py-3 text-left outline-none"
        onClick={onOpen}
        type="button"
      >
        <ExerciseBadge exercise={exercise} size="md" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium">{exercise.name}</span>
          <span className="text-muted-foreground truncate text-xs">
            {musclesLine(exercise) || KIND_INFO[exercise.kind].label}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end">
          {record && lead && (
            <span className="text-sm font-medium tabular-nums">
              <span className="text-muted-foreground mr-1 text-xs font-normal">
                {RECORD_LABELS[lead]}
              </span>
              {formatRecord(record, gym.units)}
            </span>
          )}
          <span className="text-muted-foreground text-xs">
            {exercise.lastAt
              ? dayLabel(format(exercise.lastAt, "yyyy-MM-dd"), today)
              : "Not done yet"}
          </span>
        </span>
      </button>
    </li>
  );
}

/** Every exercise the gym knows, to search, filter and open. */
export function ExercisesTab({
  gym,
  exercises,
  loaded,
  today,
  onOpenExercise,
  onNew,
}: {
  gym: Gym;
  exercises: readonly Exercise[];
  loaded: boolean;
  today: string;
  onOpenExercise: (exerciseId: string) => void;
  /** Makes one, for whoever may. */
  onNew?: () => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<RegionFilterValue>(null);
  const [showArchived, setShowArchived] = useState(false);
  const words = searchWords(query);
  const shown = exercises
    .filter(
      (exercise) => matchesSearch(exercise, words) && inRegion(exercise, filter)
    )
    .toSorted((a, b) => a.name.localeCompare(b.name));
  const live = shown.filter((exercise) => !exercise.archived);
  const archived = shown.filter((exercise) => exercise.archived);

  if (loaded && exercises.length === 0) {
    return (
      <Empty>
        <DumbbellIcon
          aria-hidden
          className="text-muted-foreground size-8"
          strokeWidth={1.5}
        />
        <EmptyTitle>No exercises yet</EmptyTitle>
        <EmptyDescription>
          Type an exercise in a workout once, and it’s here to pick from then
          on, with its records and progress.
        </EmptyDescription>
        {onNew && (
          <Button onClick={onNew} variant="outline">
            <PlusIcon />
            New exercise
          </Button>
        )}
      </Empty>
    );
  }

  const row = (exercise: Exercise) => (
    <ExerciseRow
      exercise={exercise}
      gym={gym}
      key={exercise._id}
      onOpen={() => onOpenExercise(exercise._id)}
      today={today}
    />
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <label className="bg-card shadow-surface focus-within:ring-ring/40 flex h-9 min-w-0 flex-1 items-center gap-2 rounded-full px-3 focus-within:ring-2">
          <SearchIcon
            aria-hidden
            className="text-muted-foreground size-4 shrink-0"
          />
          <input
            aria-label="Search exercises"
            autoComplete="off"
            className="placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent text-base outline-none md:text-sm"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search exercises"
            value={query}
          />
        </label>
        {onNew && (
          <Button onClick={onNew} variant="outline">
            <PlusIcon />
            <span className="max-sm:sr-only">New exercise</span>
          </Button>
        )}
      </div>
      <RegionFilter
        className="-mx-4 px-4 pb-1 sm:-mx-6 sm:px-6"
        exercises={exercises}
        onChange={setFilter}
        value={filter}
      />
      {live.length > 0 ? (
        <ul className={cn(PANEL, "divide-y overflow-hidden")}>
          {live.map(row)}
        </ul>
      ) : (
        <p className="text-muted-foreground py-10 text-center text-sm">
          No exercises match.
        </p>
      )}
      {archived.length > 0 && (
        <div className="flex flex-col gap-3">
          <Button
            aria-expanded={showArchived}
            className="text-muted-foreground self-start"
            onClick={() => setShowArchived(!showArchived)}
            size="sm"
            variant="ghost"
          >
            <ChevronDownIcon
              className={cn(
                "transition-transform duration-200 ease-out",
                !showArchived && "-rotate-90"
              )}
            />
            Archived ({archived.length})
          </Button>
          {showArchived && (
            <ul className={cn(PANEL, "divide-y overflow-hidden opacity-80")}>
              {archived.map(row)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
