import type { Doc } from "@convex/_generated/dataModel";
import { format, parseISO } from "date-fns";

import { addDays } from "@/lib/habits";
import type { Color } from "@/lib/palette";
import type { Project } from "@/lib/project";
import { canEdit, canManage } from "@/lib/project";

export { addDays, isDay } from "@convex/shared/habits";
export {
  MAX_LOG_NOTE,
  MAX_TOPICS,
  MAX_TOPIC_TITLE,
  TOPIC_ICONS,
} from "@convex/shared/log";
export type { TopicIcon } from "@convex/shared/log";
export type { LogDay, LogOverview } from "@convex/log";

export type LogTopic = Doc<"logTopics">;

/** The project a topic stands for, while the person can still see it. */
export function linkedProject(
  topic: Pick<LogTopic, "linkedProjectId">,
  projects: readonly Project[]
): Project | undefined {
  return topic.linkedProjectId
    ? projects.find((project) => project._id === topic.linkedProjectId)
    : undefined;
}

/** The hub's projects no topic stands for yet, archived ones included. */
export function unlinkedProjects(
  projects: readonly Project[],
  topics: readonly Pick<LogTopic, "linkedProjectId">[]
): Project[] {
  const taken = new Set(topics.map((topic) => topic.linkedProjectId));
  return projects.filter(
    (project) => !(project.personalFor || taken.has(project._id))
  );
}

/** Whether the person may change the topic: whoever made it, or manages the project. */
export function canChangeTopic(
  project: Project,
  topic: Pick<LogTopic, "createdBy">,
  userId: string
): boolean {
  return canEdit(project) && (canManage(project) || topic.createdBy === userId);
}

/** The log's own color, where it isn't one topic's: its widget, streak and year. */
export const LOG_COLOR: Color = "purple";

/** A day said short, the way the log heads it: "Today", "Yesterday", "Fri, Oct 10". */
export function dayLabel(date: string, today: string): string {
  if (date === today) {
    return "Today";
  }
  if (date === addDays(today, -1)) {
    return "Yesterday";
  }
  const day = parseISO(date);
  return format(
    day,
    date.slice(0, 4) === today.slice(0, 4) ? "EEE, MMM d" : "EEE, MMM d, yyyy"
  );
}

/** A day in full: "Saturday, October 11". */
export function fullDay(date: string): string {
  return format(parseISO(date), "EEEE, MMMM d");
}
