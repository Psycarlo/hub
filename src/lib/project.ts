import type { ProjectView } from "@convex/projects";
import { canEditRole, canManageRole } from "@convex/shared/model";

export { cleanSlugInput, slugify, uniqueSlug } from "@convex/shared/slug";

export type Project = ProjectView;

/** Whether the person may change what's in the project, not just read it. */
export function canEdit(project: Pick<Project, "role">): boolean {
  return canEditRole(project.role);
}

/** Whether the person may change the project's settings and people. */
export function canManage(project: Pick<Project, "role">): boolean {
  return canManageRole(project.role);
}

export function projectPath(project: Pick<Project, "slug">): string {
  return `/p/${project.slug}`;
}

/** The project a link points at, also by a link it had before. Links are unique across the hub. */
export function findProject(
  projects: Project[],
  slug: string
): Project | undefined {
  const wanted = slug.toLowerCase();
  return (
    projects.find((project) => project.slug === wanted) ??
    projects.find((project) => project.formerSlugs?.includes(wanted))
  );
}

/** Whether this is the person's own personal project. */
export function isOwnPersonal(
  project: Pick<Project, "personalFor">,
  userId: string
): boolean {
  return project.personalFor === userId;
}

/** The person's own project, kept apart from the shared ones. */
export function splitPersonal(
  projects: Project[],
  userId: string
): { personal?: Project; shared: Project[] } {
  return {
    personal: projects.find((project) => isOwnPersonal(project, userId)),
    shared: projects.filter((project) => !isOwnPersonal(project, userId)),
  };
}
