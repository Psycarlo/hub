import type { Habit } from "@/lib/habits";
import type { Project } from "@/lib/project";
import { projectPath, slugify } from "@/lib/project";

/** Where a personal project's habits live, after its tables: `/p/:project/habits`. */
export const HABITS_SEGMENT = "habits";

const HABIT_ID = /^[0-9a-z]{16,40}$/u;

export function habitsPath(project: Pick<Project, "slug">): string {
  return `${projectPath(project)}/${HABITS_SEGMENT}`;
}

/**
 * The habit's link: its name for people to read, then its id, which is what
 * counts. `month` opens its calendar on that month rather than the current one.
 */
export function habitPath(
  project: Pick<Project, "slug">,
  habit: Pick<Habit, "_id" | "title">,
  month?: string
): string {
  const slug = slugify(habit.title);
  const path = `${habitsPath(project)}/${slug ? `${slug}-` : ""}${habit._id}`;
  return month ? `${path}?month=${month}` : path;
}

/** The habit id at the end of a habit link, whatever name came before it. */
export function parseHabitParam(param: string): string | undefined {
  const id = param.toLowerCase().split("-").at(-1);
  return id && HABIT_ID.test(id) ? id : undefined;
}
