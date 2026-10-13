import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useQuery } from "convex/react";
import {
  DumbbellIcon,
  HistoryIcon,
  PlayIcon,
  Settings2Icon,
} from "lucide-react";
import { useState } from "react";
import { useLocation, useSearchParams } from "wouter";

import { IconButton } from "@/components/icon-button";
import { ProjectAvatar } from "@/components/project-avatar";
import { SplitButton } from "@/components/split-button";
import { TopBar } from "@/components/top-bar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Empty, EmptyDescription, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BodyTab } from "@/features/gym/body-tab";
import { ExerciseDialog } from "@/features/gym/exercise-dialog";
import { ExerciseSheet } from "@/features/gym/exercise-sheet";
import { ExercisesTab } from "@/features/gym/exercises-tab";
import type { GymTab } from "@/features/gym/gym-context";
import {
  GYM_TABS,
  gymPath,
  parseWorkoutParam,
  useOpenExercise,
  useStartWorkout,
  workoutPath,
} from "@/features/gym/gym-context";
import {
  GymSettingsDialog,
  PastWorkoutDialog,
  UnitsField,
} from "@/features/gym/gym-dialogs";
import { LiveDot } from "@/features/gym/gym-parts";
import { Overview } from "@/features/gym/overview";
import { RoutineDialog } from "@/features/gym/routine-dialog";
import { WorkoutPage } from "@/features/gym/workout-page";
import { WorkoutsTab } from "@/features/gym/workouts-tab";
import { gridStart } from "@/features/habits/heatmap";
import {
  useActiveWorkout,
  useBodyWeights,
  useExercises,
  useRoutines,
  useSecond,
  useWorkouts,
} from "@/hooks/use-gym";
import { useToday } from "@/hooks/use-today";
import type { Gym, Routine, UnitSystem } from "@/lib/gym";
import {
  addDays,
  formatClock,
  unitsForLocale,
  workoutSeconds,
} from "@/lib/gym";
import { setupGym } from "@/lib/gym-actions";
import type { Project } from "@/lib/project";
import { canEdit, projectPath } from "@/lib/project";

const TAB_LABELS: Record<GymTab, string> = {
  body: "Body",
  exercises: "Exercises",
  overview: "Overview",
  workouts: "Workouts",
};

/** Weighings the overview's body weight card follows, in days. */
const BODY_DAYS = 90;

function crumbsOf(project: Project) {
  return [
    {
      href: projectPath(project),
      icon: <ProjectAvatar project={project} />,
      label: project.title,
    },
    {
      icon: <DumbbellIcon className="text-muted-foreground size-4 shrink-0" />,
      label: "Gym",
    },
  ];
}

/** The tab the link opens. */
function useTab(): [GymTab, (tab: GymTab) => void] {
  const [params, setParams] = useSearchParams();
  const tab = GYM_TABS.find((item) => item === params.get("tab")) ?? "overview";
  const go = (next: GymTab) =>
    setParams(next === "overview" ? {} : { tab: next }, { replace: true });
  return [tab, go];
}

/** Goes back to the workout under way, its time ticking on the button. */
function ResumeButton({
  project,
  workout,
}: {
  project: Project;
  workout: NonNullable<ReturnType<typeof useActiveWorkout>>;
}) {
  const [, navigate] = useLocation();
  const now = useSecond();
  return (
    <Button
      className="tabular-nums"
      onClick={() => navigate(workoutPath(project, workout))}
      size="sm"
    >
      <LiveDot light />
      Resume · {formatClock(workoutSeconds(workout, now))}
    </Button>
  );
}

type Dialog = "routine" | "settings" | "past" | "exercise";

interface GymHomeProps {
  project: Project;
  gym: Gym;
}

/** The gym's tabs: the overview, the history, the exercises and body weight. */
function GymHome({ project, gym }: GymHomeProps) {
  const [, navigate] = useLocation();
  const today = useToday();
  const [tab, setTab] = useTab();
  const { open: openExercise } = useOpenExercise();
  const [dialog, setDialog] = useState<Dialog>();
  // The routine its dialog opens on; none for a new one.
  const [editedRoutine, setEditedRoutine] = useState<Routine>();
  const [years, setYears] = useState(1);
  const dialogProps = (name: Dialog) => ({
    onOpenChange: (open: boolean) => setDialog(open ? name : undefined),
    open: dialog === name,
  });
  const editable = canEdit(project);
  const yearStart = gridStart(today, 53);
  const reach = addDays(yearStart, -364 * (years - 1));
  const { exercises, byId, loaded: exercisesLoaded } = useExercises(project);
  const { routines } = useRoutines(project);
  const { workouts, loaded } = useWorkouts(project, reach);
  const { weights } = useBodyWeights(project, addDays(today, -BODY_DAYS));
  const active = useActiveWorkout(project);
  const oldest = useQuery(api.workouts.oldest, { projectId: project._id });
  const startWorkout = useStartWorkout(project);
  // Only one runs at a time: starting another goes back to it.
  const start = (routine?: Routine) =>
    active ? navigate(workoutPath(project, active)) : startWorkout({ routine });

  let action = null;
  if (active) {
    action = <ResumeButton project={project} workout={active} />;
  } else if (editable && active === null) {
    action = (
      <SplitButton
        menu={
          <>
            {routines.map((item) => (
              <DropdownMenuItem key={item._id} onClick={() => start(item)}>
                <PlayIcon className="text-muted-foreground" />
                {item.title}
              </DropdownMenuItem>
            ))}
            {routines.length > 0 && <DropdownMenuSeparator />}
            <DropdownMenuItem onClick={() => setDialog("past")}>
              <HistoryIcon className="text-muted-foreground" />
              Log a past workout
            </DropdownMenuItem>
          </>
        }
        menuLabel="More ways to start"
        onClick={() => start()}
        size="sm"
      >
        <PlayIcon />
        Start workout
      </SplitButton>
    );
  }

  let body = (
    <div aria-busy className="flex flex-col gap-6">
      <Skeleton className="h-36 rounded-2xl" />
      <Skeleton className="h-24 rounded-2xl" />
      <Skeleton className="h-64 rounded-2xl" />
    </div>
  );
  if (tab === "body") {
    body = <BodyTab gym={gym} project={project} today={today} />;
  } else if (tab === "exercises") {
    body = (
      <ExercisesTab
        exercises={exercises}
        gym={gym}
        loaded={exercisesLoaded}
        onNew={editable ? () => setDialog("exercise") : undefined}
        onOpenExercise={openExercise}
        today={today}
      />
    );
  } else if (tab === "workouts") {
    body = (
      <WorkoutsTab
        exercises={byId}
        gym={gym}
        loaded={loaded}
        more={oldest ? oldest < reach : false}
        onMore={() => setYears(years + 1)}
        onStart={editable ? () => start() : undefined}
        project={project}
        workouts={workouts}
      />
    );
  } else if (loaded && exercisesLoaded) {
    body = (
      <Overview
        active={active}
        byId={byId}
        exercises={exercises}
        gym={gym}
        onEditRoutine={(item) => {
          setEditedRoutine(item);
          setDialog("routine");
        }}
        onLogPast={() => setDialog("past")}
        onNewRoutine={() => {
          setEditedRoutine(undefined);
          setDialog("routine");
        }}
        onOpenExercise={openExercise}
        onStart={start}
        project={project}
        routines={routines}
        today={today}
        weights={weights}
        workouts={workouts}
      />
    );
  }

  return (
    <>
      <TopBar crumbs={crumbsOf(project)}>
        {editable && (
          <IconButton
            label="Gym settings"
            onClick={() => setDialog("settings")}
          >
            <Settings2Icon />
          </IconButton>
        )}
        {action}
      </TopBar>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 pt-4 pb-24 sm:px-6">
        <Tabs onValueChange={(next: GymTab) => setTab(next)} value={tab}>
          <TabsList className="max-w-full overflow-x-auto [&::-webkit-scrollbar]:hidden">
            {GYM_TABS.map((item) => (
              <TabsTrigger key={item} value={item}>
                {TAB_LABELS[item]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        {body}
      </main>
      <RoutineDialog
        {...dialogProps("routine")}
        byId={byId}
        exercises={exercises}
        gym={gym}
        routine={editedRoutine}
      />
      <GymSettingsDialog {...dialogProps("settings")} gym={gym} />
      <PastWorkoutDialog {...dialogProps("past")} project={project} />
      <ExerciseDialog {...dialogProps("exercise")} gym={gym} />
      <ExerciseSheet exercises={byId} gym={gym} project={project} />
    </>
  );
}

/** A personal project without a gym yet: what it's for, and setting it up. */
function GymSetup({ project }: { project: Project }) {
  const [units, setUnits] = useState<UnitSystem>(unitsForLocale);
  const [saving, setSaving] = useState(false);
  const editable = canEdit(project);
  return (
    <>
      <TopBar crumbs={crumbsOf(project)} />
      <Empty>
        <span className="flex size-14 items-center justify-center rounded-2xl bg-orange-500 text-white shadow-sm">
          <DumbbellIcon aria-hidden className="size-7" />
        </span>
        <EmptyTitle>Your gym</EmptyTitle>
        <EmptyDescription className="max-w-sm">
          Log workouts set by set, beat your records, rest on a timer, and
          follow your body weight, all in one place.
        </EmptyDescription>
        {editable && (
          <div className="flex w-full max-w-64 flex-col gap-4 text-left">
            <UnitsField onChange={setUnits} value={units} />
            <Button
              disabled={saving}
              onClick={async () => {
                setSaving(true);
                await setupGym(project._id, units);
                setSaving(false);
              }}
            >
              {saving && <Spinner />}
              Set up gym
            </Button>
          </div>
        )}
      </Empty>
    </>
  );
}

/** A link to a workout that isn’t one. */
function GymMissing({ project }: { project: Project }) {
  const [, navigate] = useLocation();
  return (
    <>
      <TopBar crumbs={crumbsOf(project)} />
      <Empty>
        <EmptyTitle>Workout not found</EmptyTitle>
        <Button
          onClick={() => navigate(gymPath(project, "workouts"))}
          variant="outline"
        >
          Workouts
        </Button>
      </Empty>
    </>
  );
}

/**
 * A personal project's gym: its tabs, or one workout's page, from
 * `/p/:project/gym/:workoutId`; set up first when it has none.
 */
export function GymRoute({
  project,
  gym,
  loaded,
  workoutParam,
}: {
  project: Project;
  gym?: Gym;
  loaded: boolean;
  /** The part of the link after the gym, a workout's id. */
  workoutParam?: string;
}) {
  if (!gym) {
    return loaded ? (
      <GymSetup project={project} />
    ) : (
      <>
        <TopBar crumbs={crumbsOf(project)} />
        <main
          aria-busy
          className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 pt-4 sm:px-6"
        >
          <Skeleton className="h-9 w-80 rounded-full" />
          <Skeleton className="h-64 rounded-2xl" />
        </main>
      </>
    );
  }
  const workoutId = workoutParam ? parseWorkoutParam(workoutParam) : undefined;
  if (workoutParam) {
    return workoutId ? (
      <WorkoutPage
        gym={gym}
        key={workoutId}
        project={project}
        workoutId={workoutId as Id<"gymWorkouts">}
      />
    ) : (
      <GymMissing project={project} />
    );
  }
  return <GymHome gym={gym} project={project} />;
}
