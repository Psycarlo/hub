import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { OptimisticLocalStore } from "convex/browser";

import { run } from "@/lib/actions";
import { convex } from "@/lib/convex";
import type { Habit, HabitIcon } from "@/lib/habits";
import { isDone } from "@/lib/habits";
import type { Color } from "@/lib/palette";
import { playSound } from "@/lib/sounds";

export interface HabitDraft {
  title: string;
  description: string;
  icon: HabitIcon;
  color: Color;
  /** Days of the week it's due, Sunday as 0. */
  days: number[];
  /** Times a day that make the day done. */
  goal: number;
}

function patchHabits(
  store: OptimisticLocalStore,
  patch: (habits: Habit[]) => Habit[]
): void {
  const habits = store.getQuery(api.habits.list, {});
  if (habits) {
    store.setQuery(api.habits.list, {}, patch(habits));
  }
}

/** Starts a habit in the project, from the person's today; resolves with its id. */
export function createHabit(
  projectId: Id<"projects">,
  draft: HabitDraft,
  today: string
) {
  return run(
    convex.mutation(api.habits.create, { projectId, today, ...draft })
  );
}

export function updateHabit(habit: Habit, changes: Partial<HabitDraft>) {
  return run(
    convex.mutation(
      api.habits.update,
      { habitId: habit._id, ...changes },
      {
        optimisticUpdate: (store) =>
          patchHabits(store, (habits) =>
            habits.map((item) =>
              item._id === habit._id ? { ...item, ...changes } : item
            )
          ),
      }
    )
  );
}

export function deleteHabit(habit: Habit) {
  return run(
    convex.mutation(
      api.habits.remove,
      { habitId: habit._id },
      {
        optimisticUpdate: (store) =>
          patchHabits(store, (habits) =>
            habits.filter((item) => item._id !== habit._id)
          ),
      }
    )
  );
}

/** Plays the cue for a day's count going from `from` to `to`: done, taken back, or one more. */
export function playCount(habit: Habit, from: number, to: number): void {
  if (to < from) {
    playSound("off");
  } else if (isDone(to, habit.goal) && !isDone(from, habit.goal)) {
    playSound("complete");
  } else {
    playSound("tap");
  }
}

/** Sets how many times the habit was done on a day, shown at once wherever that day is loaded. */
export function logHabit(habit: Habit, date: string, count: number) {
  return run(
    convex.mutation(
      api.habits.log,
      { count, date, habitId: habit._id },
      {
        optimisticUpdate: (store) => {
          for (const { args, value } of store.getAllQueries(api.habits.days)) {
            if (
              !value ||
              args.projectId !== habit.projectId ||
              (args.habitId !== undefined && args.habitId !== habit._id) ||
              date < args.from
            ) {
              continue;
            }
            const others = value.filter(
              (day) => !(day.habitId === habit._id && day.date === date)
            );
            store.setQuery(
              api.habits.days,
              args,
              count > 0
                ? [...others, { count, date, habitId: habit._id }]
                : others
            );
          }
        },
      }
    )
  );
}
