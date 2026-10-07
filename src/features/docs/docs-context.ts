import type { DocPage } from "@/lib/docs";
import type { Project } from "@/lib/project";
import { projectPath, slugify } from "@/lib/project";

/** Where a project's docs live, after its tables: `/p/:project/docs`. */
export const DOCS_SEGMENT = "docs";

const PAGE_ID = /^[0-9a-z]{16,40}$/u;

export function docsPath(project: Pick<Project, "slug">): string {
  return `${projectPath(project)}/${DOCS_SEGMENT}`;
}

/** The page's link: its title for people to read, then its id, which is what counts. */
export function pagePath(
  project: Pick<Project, "slug">,
  page: Pick<DocPage, "_id" | "title">
): string {
  const slug = slugify(page.title);
  return `${docsPath(project)}/${slug ? `${slug}-` : ""}${page._id}`;
}

/** The page id at the end of a page link, whatever title came before it. */
export function parsePageParam(param: string): string | undefined {
  const id = param.toLowerCase().split("-").at(-1);
  return id && PAGE_ID.test(id) ? id : undefined;
}
