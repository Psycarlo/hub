import { CalendarCheckIcon, PlusIcon } from "lucide-react";
import { useState } from "react";

import { ProjectAvatar } from "@/components/project-avatar";
import { TopBar } from "@/components/top-bar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { HabitGrid, NoHabits } from "@/features/habits/habit-card";
import { HabitDialog } from "@/features/habits/habit-dialog";
import type { Habit } from "@/lib/habits";
import type { Project } from "@/lib/project";
import { canEdit, projectPath } from "@/lib/project";

/** A personal project's habits, each with today's check. */
export function HabitsPage({
  project,
  habits,
  loaded,
}: {
  project: Project;
  /** The project's habits. */
  habits: Habit[];
  loaded: boolean;
}) {
  const [creating, setCreating] = useState(false);
  const editable = canEdit(project);

  let body = <HabitGrid habits={habits} project={project} />;
  if (habits.length === 0 && !loaded) {
    body = (
      <div aria-busy className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-44 rounded-2xl" />
        <Skeleton className="h-44 rounded-2xl max-sm:hidden" />
      </div>
    );
  } else if (habits.length === 0) {
    body = <NoHabits editable={editable} onNew={() => setCreating(true)} />;
  }

  return (
    <>
      <TopBar
        crumbs={[
          {
            href: projectPath(project),
            icon: <ProjectAvatar project={project} />,
            label: project.title,
          },
          {
            icon: (
              <CalendarCheckIcon className="text-muted-foreground size-4 shrink-0" />
            ),
            label: "Habits",
          },
        ]}
      >
        {editable && habits.length > 0 && (
          <Button onClick={() => setCreating(true)} size="sm" variant="outline">
            <PlusIcon />
            New habit
          </Button>
        )}
      </TopBar>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10 px-4 pt-4 pb-10 sm:px-6">
        {body}
      </main>
      <HabitDialog
        onOpenChange={setCreating}
        open={creating}
        project={project}
      />
    </>
  );
}
