import { CalendarCheckIcon, Settings2Icon } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "wouter";

import { IconButton } from "@/components/icon-button";
import { ProjectAvatar } from "@/components/project-avatar";
import { TopBar } from "@/components/top-bar";
import { CheckButton } from "@/features/habits/check-button";
import { HabitCalendar } from "@/features/habits/habit-calendar";
import { StreakChip } from "@/features/habits/habit-card";
import { HabitDialog } from "@/features/habits/habit-dialog";
import {
  HABIT_ICON_COMPONENTS,
  HabitBadge,
} from "@/features/habits/habit-icon";
import { habitsPath } from "@/features/habits/habits-context";
import { Heatmap } from "@/features/habits/heatmap";
import { useHabitCounts, useStreaks } from "@/hooks/use-habits";
import { useToday } from "@/hooks/use-today";
import { useMe } from "@/hooks/use-users";
import { monthOf, parseMonth } from "@/lib/finance";
import { logHabit } from "@/lib/habit-actions";
import type { Habit } from "@/lib/habits";
import { addDays, describeHabit } from "@/lib/habits";
import type { Project } from "@/lib/project";
import { canEdit, canManage, projectPath } from "@/lib/project";

/** Weeks the year's grid reaches back, to the same week a year ago. */
const YEAR_WEEKS = 53;

/** One habit: its year at a glance, its streak, and its days month by month. */
export function HabitPage({
  project,
  habit,
}: {
  project: Project;
  habit: Habit;
}) {
  const me = useMe();
  const today = useToday();
  const current = monthOf(today);
  const [params, setParams] = useSearchParams();
  const month = parseMonth(params.get("month")) ?? current;
  const [settings, setSettings] = useState(false);
  const editable = canEdit(project);
  const manageable =
    editable && (canManage(project) || habit.createdBy === me._id);
  // The year's grid, and the calendar's month when it's further back.
  const yearAgo = addDays(today, -7 * YEAR_WEEKS);
  const monthStart = `${month}-01`;
  const counts = useHabitCounts(
    project,
    monthStart < yearAgo ? monthStart : yearAgo,
    habit
  );
  const streak = useStreaks(project, today)?.get(habit._id);
  const log = editable
    ? (date: string, count: number) => logHabit(habit, date, count)
    : undefined;
  const Icon = HABIT_ICON_COMPONENTS[habit.icon];

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
            href: habitsPath(project),
            icon: (
              <CalendarCheckIcon className="text-muted-foreground size-4 shrink-0" />
            ),
            label: "Habits",
          },
          {
            icon: <Icon className="text-muted-foreground size-4 shrink-0" />,
            label: habit.title,
          },
        ]}
      />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 pt-4 pb-10 sm:px-6">
        <header className="flex items-start gap-4">
          <HabitBadge habit={habit} size="lg" />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h2 className="text-2xl font-semibold tracking-tight">
              {habit.title}
            </h2>
            {habit.description && (
              <p className="text-muted-foreground text-sm">
                {habit.description}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {manageable && (
              <IconButton
                label="Habit settings"
                onClick={() => setSettings(true)}
              >
                <Settings2Icon />
              </IconButton>
            )}
            <CheckButton
              count={counts.get(habit._id, today)}
              habit={habit}
              onCount={log && ((count) => log(today, count))}
              size="lg"
            />
          </div>
        </header>
        <section
          aria-label="Year"
          className="bg-card shadow-surface flex flex-col gap-4 rounded-2xl p-4 sm:p-5"
        >
          <Heatmap
            counts={counts}
            habit={habit}
            labeled
            maxWeeks={YEAR_WEEKS}
            minCell={9}
            today={today}
          />
          <div className="flex items-center gap-2">
            <StreakChip color={habit.color} days={streak} />
            <span className="text-muted-foreground min-w-0 truncate text-xs">
              {describeHabit(habit)}
            </span>
          </div>
        </section>
        <HabitCalendar
          counts={counts}
          habit={habit}
          month={month}
          onCount={log}
          onMonthChange={(next) =>
            setParams(next === current ? {} : { month: next })
          }
          today={today}
        />
      </main>
      {manageable && (
        <HabitDialog
          habit={habit}
          onOpenChange={setSettings}
          open={settings}
          project={project}
        />
      )}
    </>
  );
}
