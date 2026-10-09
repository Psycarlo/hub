import { api } from "@convex/_generated/api";
import { useQuery } from "convex/react";
import { useMemo } from "react";

import type { Habit } from "@/lib/habits";
import type { Project } from "@/lib/project";

/** How many times each habit was done each day. */
export interface HabitCounts {
  get: (habitId: string, date: string) => number;
  /** False until they're in. */
  loaded: boolean;
}

/**
 * What the project's habits logged from `from` on, or only `habit`'s, kept
 * live; nothing while there's no project yet.
 */
export function useHabitCounts(
  project: Pick<Project, "_id"> | undefined,
  from: string,
  habit?: Pick<Habit, "_id">
): HabitCounts {
  const days = useQuery(
    api.habits.days,
    project ? { from, habitId: habit?._id, projectId: project._id } : "skip"
  );
  return useMemo(() => {
    const counts = new Map(
      days?.map((day) => [`${day.habitId}:${day.date}`, day.count])
    );
    return {
      get: (habitId, date) => counts.get(`${habitId}:${date}`) ?? 0,
      loaded: days !== undefined,
    };
  }, [days]);
}

/** Each of the project's habits' run of days done, by habit id; undefined while loading. */
export function useStreaks(
  project: Pick<Project, "_id"> | undefined,
  today: string
): ReadonlyMap<string, number> | undefined {
  const streaks = useQuery(
    api.habits.streaks,
    project ? { projectId: project._id, today } : "skip"
  );
  return useMemo(
    () =>
      streaks
        ? new Map(streaks.map(({ habitId, days }) => [habitId, days]))
        : undefined,
    [streaks]
  );
}
