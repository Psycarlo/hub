import { api } from "@convex/_generated/api";
import { useQuery } from "convex/react";

import type { ProjectContent } from "@/lib/crm";
import { resolveContent } from "@/lib/crm";
import type { Project } from "@/lib/project";

/** CRM tables and records of a project, kept live. */
export function useProjectContent(project: Project): {
  content: ProjectContent | undefined;
  loaded: boolean;
} {
  const raw = useQuery(api.crm.project, { projectId: project._id });
  return {
    content: raw ? resolveContent(raw) : undefined,
    loaded: raw !== undefined,
  };
}
