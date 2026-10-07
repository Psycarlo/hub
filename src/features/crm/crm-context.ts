import type { Id } from "@convex/_generated/dataModel";
import { createContext, use } from "react";

import type { CrmRecord, CrmTable, ProjectContent } from "@/lib/crm";
import type { Project } from "@/lib/project";
import { projectPath } from "@/lib/project";

export interface CrmScope {
  project: Project;
  content: ProjectContent;
  table: CrmTable;
  /** Records of `table`, in rank order. */
  records: CrmRecord[];
  me: Id<"users">;
  /** Whether the person may change records, not just read them. */
  canEdit: boolean;
  /** Everyone on the project, who records can be assigned to. */
  people: Id<"users">[];
  /** Opens a record of this table without leaving the current view. */
  recordHref: (record: Pick<CrmRecord, "_id">) => string;
}

export const CrmContext = createContext<CrmScope | null>(null);

export function useCrm(): CrmScope {
  const scope = use(CrmContext);
  if (!scope) {
    throw new Error("useCrm needs a CrmContext provider.");
  }
  return scope;
}

export function tablePath(
  project: Pick<Project, "slug">,
  table: Pick<CrmTable, "slug">
): string {
  return `${projectPath(project)}/${table.slug}`;
}

export function recordPath(
  project: Pick<Project, "slug">,
  table: Pick<CrmTable, "slug">,
  record: Pick<CrmRecord, "_id">,
  query?: URLSearchParams
): string {
  const search = query?.toString();
  return `${tablePath(project, table)}/${record._id}${search ? `?${search}` : ""}`;
}

/** Where a linked record lives, which may be another table of the project. */
export function relatedPath(
  project: Project,
  content: ProjectContent,
  id: string
): string | undefined {
  const record = content.byId.get(id);
  const table = content.tables.find((item) => item._id === record?.tableId);
  return record && table ? recordPath(project, table, record) : undefined;
}
