import { cn } from "cn";
import { format } from "date-fns";
import { PencilIcon, TrophyIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";

import { IconButton } from "@/components/icon-button";
import { Button } from "@/components/ui/button";
import { FluidTooltip } from "@/components/ui/fluid-tooltip";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ExerciseDialog } from "@/features/gym/exercise-dialog";
import { useOpenExercise, workoutPath } from "@/features/gym/gym-context";
import { ExerciseBadge, PANEL, exerciseColor } from "@/features/gym/gym-parts";
import { TrendChart } from "@/features/gym/trend-chart";
import { useExerciseHistory } from "@/hooks/use-gym";
import { useToday } from "@/hooks/use-today";
import type {
  Exercise,
  ExerciseTime,
  Gym,
  RecordKind,
  UnitSystem,
} from "@/lib/gym";
import {
  EQUIPMENT_LABELS,
  KIND_INFO,
  MUSCLE_INFO,
  RECORDS_OF,
  RECORD_LABELS,
  bestsOf,
  equipmentOf,
  formatClock,
  formatRecord,
  formatSet,
  formatWeight,
  isWorking,
  setVolume,
  toDistance,
  toLoad,
  weightUnit,
} from "@/lib/gym";
import { dayLabel } from "@/lib/log";
import { HEX_COLORS } from "@/lib/palette";
import type { Project } from "@/lib/project";
import { canEdit } from "@/lib/project";

/** Times shown before asking for more. */
const HISTORY_PAGE = 8;

/** What the progress chart can follow, by kind of exercise. */
type Metric = RecordKind | "session";

const METRICS: Record<Exercise["kind"], readonly Metric[]> = {
  distance: ["distance"],
  reps: ["reps"],
  time: ["time"],
  weight: ["e1rm", "weight", "session"],
};

const METRIC_LABELS: Record<Metric, string> = {
  ...RECORD_LABELS,
  session: "Volume",
};

/** One time's value for the chart, in the gym's units; undefined when it has none. */
function metricOf(
  metric: Metric,
  time: ExerciseTime,
  kind: Exercise["kind"],
  units: UnitSystem
): number | undefined {
  if (metric === "session") {
    const volume = time.sets
      .filter(isWorking)
      .reduce((sum, set) => sum + setVolume(set), 0);
    return volume > 0 ? toLoad(volume, units) : undefined;
  }
  const best = bestsOf(kind, time.sets)[metric];
  if (!best) {
    return undefined;
  }
  if (metric === "e1rm" || metric === "weight") {
    return toLoad(best.value, units);
  }
  return metric === "distance" ? toDistance(best.value, units) : best.value;
}

/** A chart value as it reads, in the gym's units. */
function formatMetric(metric: Metric, units: UnitSystem) {
  return (value: number): string => {
    switch (metric) {
      case "time": {
        return formatClock(value);
      }
      case "reps": {
        return `${Math.round(value)}`;
      }
      case "distance": {
        return `${Math.round(value * 10) / 10} ${units === "imperial" ? "mi" : "km"}`;
      }
      default: {
        return `${Math.round(value * 10) / 10} ${weightUnit(units)}`;
      }
    }
  };
}

function Records({ exercise, gym }: { exercise: Exercise; gym: Gym }) {
  const today = useToday();
  const kinds = RECORDS_OF[exercise.kind];
  return (
    <div
      className={cn(
        "grid gap-2",
        kinds.length === 3 ? "grid-cols-3" : "grid-cols-2"
      )}
    >
      {kinds.map((kind) => {
        const record = exercise.records.find((item) => item.kind === kind);
        return (
          <div
            className="bg-foreground/3 flex min-w-0 flex-col gap-1 rounded-xl p-3"
            key={kind}
          >
            <span className="text-muted-foreground flex items-center gap-1 truncate text-xs">
              <TrophyIcon aria-hidden className="size-3 text-yellow-500" />
              {RECORD_LABELS[kind]}
            </span>
            <span className="truncate font-semibold tracking-tight tabular-nums">
              {record ? formatRecord(record, gym.units) : "—"}
            </span>
            <span className="text-muted-foreground truncate text-xs">
              {record && kind === "e1rm" && record.weight !== undefined
                ? `${formatWeight(record.weight, gym.units)} × ${record.reps ?? 0}`
                : record && dayLabel(format(record.at, "yyyy-MM-dd"), today)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Progress({
  exercise,
  gym,
  history,
}: {
  exercise: Exercise;
  gym: Gym;
  history: readonly ExerciseTime[];
}) {
  const metrics = METRICS[exercise.kind];
  const [picked, setPicked] = useState<Metric>(metrics[0] ?? "e1rm");
  const metric = metrics.includes(picked) ? picked : (metrics[0] ?? "e1rm");
  const points = history.flatMap((time) => {
    const value = metricOf(metric, time, exercise.kind, gym.units);
    return value === undefined ? [] : [{ t: time.at, value }];
  });
  return (
    <section aria-label="Progress" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium">Progress</h3>
        {metrics.length > 1 && (
          <Tabs
            onValueChange={(next: Metric) => setPicked(next)}
            value={metric}
          >
            <TabsList>
              {metrics.map((item) => (
                <TabsTrigger className="px-2.5 text-xs" key={item} value={item}>
                  {METRIC_LABELS[item]}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        )}
      </div>
      {points.length >= 2 ? (
        <TrendChart
          ariaLabel={`${exercise.name}, ${METRIC_LABELS[metric]} over time`}
          color={HEX_COLORS[exerciseColor(exercise)]}
          formatValue={formatMetric(metric, gym.units)}
          height={200}
          points={points}
        />
      ) : (
        <p className="text-muted-foreground bg-foreground/3 rounded-xl px-4 py-8 text-center text-sm">
          {points.length === 0
            ? "Do it once to start the line."
            : "Do it again to see where it’s going."}
        </p>
      )}
    </section>
  );
}

/** Every time it was done, newest first, opening the workout. */
function History({
  exercise,
  gym,
  project,
  history,
}: {
  exercise: Exercise;
  gym: Gym;
  project: Project;
  history: readonly ExerciseTime[];
}) {
  const today = useToday();
  const [shown, setShown] = useState(HISTORY_PAGE);
  const newest = history.toReversed();
  return (
    <section aria-label="History" className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">History</h3>
      <ol className="flex flex-col divide-y">
        {newest.slice(0, shown).map((time) => (
          <li key={time._id}>
            <Link
              className="hover:bg-foreground/3 focus-visible:bg-foreground/3 -mx-2 flex items-start gap-3 rounded-lg px-2 py-2.5 outline-none"
              href={workoutPath(project, { _id: time.workoutId })}
            >
              <span className="text-muted-foreground w-24 shrink-0 pt-0.5 text-xs font-medium">
                {dayLabel(format(time.at, "yyyy-MM-dd"), today)}
              </span>
              <span className="flex min-w-0 flex-1 flex-wrap gap-1">
                {time.sets
                  .filter((set) => set.type !== "warmup")
                  .map((set) => (
                    <span
                      className="bg-foreground/5 rounded-md px-1.5 py-0.5 text-xs tabular-nums"
                      key={set.id}
                    >
                      {formatSet(set, exercise.kind, gym.units)}
                    </span>
                  ))}
              </span>
              {time.prs.length > 0 && (
                <span className="mt-0.5 shrink-0">
                  <TrophyIcon
                    aria-hidden
                    className="size-3.5 text-yellow-500"
                  />
                  <span className="sr-only">
                    Records:{" "}
                    {time.prs.map((kind) => RECORD_LABELS[kind]).join(", ")}
                  </span>
                </span>
              )}
            </Link>
          </li>
        ))}
      </ol>
      {shown < newest.length && (
        <Button
          className="self-center"
          onClick={() => setShown(shown + HISTORY_PAGE)}
          variant="ghost"
        >
          Show more
        </Button>
      )}
    </section>
  );
}

function Detail({
  exercise,
  gym,
  project,
  onEdit,
  onClose,
}: {
  exercise: Exercise;
  gym: Gym;
  project: Project;
  onEdit: () => void;
  onClose: () => void;
}) {
  const history = useExerciseHistory(exercise);
  const equipment = equipmentOf(exercise.equipment)
    .map((item) => EQUIPMENT_LABELS[item])
    .join(", ");
  const meta = [KIND_INFO[exercise.kind].label, equipment]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="flex flex-col gap-6 p-5">
      <header className="flex items-start gap-3">
        <ExerciseBadge exercise={exercise} size="md" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <SheetTitle className="text-lg leading-tight font-semibold tracking-tight">
            {exercise.name}
          </SheetTitle>
          <SheetDescription className="text-muted-foreground text-xs">
            {meta}
            {exercise.archived && " · Archived"}
          </SheetDescription>
        </div>
        {/* Level with the badge, the close button's X lined up with the panels' edge. */}
        <div className="-mr-2 flex h-9 shrink-0 items-center gap-0.5">
          <FluidTooltip.Group>
            {canEdit(project) && (
              <IconButton label="Edit exercise" onClick={onEdit}>
                <PencilIcon />
              </IconButton>
            )}
            <IconButton label="Close" onClick={onClose}>
              <XIcon />
            </IconButton>
          </FluidTooltip.Group>
        </div>
      </header>

      {(exercise.muscles.length > 0 || exercise.secondary.length > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {exercise.muscles.map((muscle) => (
            <span
              className="bg-foreground/7 rounded-full px-2.5 py-1 text-xs font-medium"
              key={muscle}
            >
              {MUSCLE_INFO[muscle].label}
            </span>
          ))}
          {exercise.secondary.map((muscle) => (
            <span
              className="text-muted-foreground inset-ring-foreground/15 rounded-full px-2.5 py-1 text-xs inset-ring"
              key={muscle}
            >
              {MUSCLE_INFO[muscle].label}
            </span>
          ))}
        </div>
      )}

      {exercise.note && (
        <p className={cn(PANEL, "text-muted-foreground px-3 py-2.5 text-sm")}>
          {exercise.note}
        </p>
      )}

      <Records exercise={exercise} gym={gym} />

      {history ? (
        <>
          <Progress exercise={exercise} gym={gym} history={history} />
          {history.length > 0 && (
            <History
              exercise={exercise}
              gym={gym}
              history={history}
              project={project}
            />
          )}
        </>
      ) : (
        <div aria-busy className="flex flex-col gap-3">
          <Skeleton className="h-52 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
      )}
    </div>
  );
}

/**
 * The exercise opened from anywhere in the gym, in a sheet over the page:
 * its records, how it's going, and every time it was done.
 */
export function ExerciseSheet({
  gym,
  project,
  exercises,
}: {
  gym: Gym;
  project: Project;
  exercises: ReadonlyMap<string, Exercise>;
}) {
  const { exerciseId, close } = useOpenExercise();
  const exercise = exerciseId ? exercises.get(exerciseId) : undefined;
  const [editing, setEditing] = useState(false);
  // Kept while the sheet slides away, so it doesn't empty as it goes.
  const [last, setLast] = useState(exercise);
  if (exercise && exercise !== last) {
    setLast(exercise);
  }
  const shown = exercise ?? last;
  return (
    <>
      <Sheet
        onOpenChange={(open) => {
          if (!open) {
            close();
          }
        }}
        open={exercise !== undefined}
      >
        <SheetContent
          className="overflow-y-auto sm:max-w-md"
          showCloseButton={false}
        >
          {shown && (
            <Detail
              exercise={shown}
              gym={gym}
              onClose={close}
              onEdit={() => setEditing(true)}
              project={project}
            />
          )}
        </SheetContent>
      </Sheet>
      {shown && (
        <ExerciseDialog
          exercise={shown}
          gym={gym}
          onOpenChange={setEditing}
          open={editing}
        />
      )}
    </>
  );
}
