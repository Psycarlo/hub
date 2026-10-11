import type { Project } from "@/lib/project";
import { projectPath } from "@/lib/project";

/** Where a personal project's log lives, after its tables: `/p/:project/log`. */
export const LOG_SEGMENT = "log";

/**
 * The project's log. `day` opens it on that day rather than today, and
 * `topic` on that topic's days alone.
 */
export function logPath(
  project: Pick<Project, "slug">,
  { day, topic }: { day?: string; topic?: string } = {}
): string {
  const params = new URLSearchParams();
  if (day) {
    params.set("day", day);
  }
  if (topic) {
    params.set("topic", topic);
  }
  const query = params.toString();
  return `${projectPath(project)}/${LOG_SEGMENT}${query ? `?${query}` : ""}`;
}
