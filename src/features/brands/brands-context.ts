import type { Brand } from "@/lib/brands";
import type { Project } from "@/lib/project";
import { projectPath, slugify } from "@/lib/project";

/** Where a project's brands live, after its tables: `/p/:project/brands`. */
export const BRANDS_SEGMENT = "brands";

const BRAND_ID = /^[0-9a-z]{16,40}$/u;

export function brandsPath(project: Pick<Project, "slug">): string {
  return `${projectPath(project)}/${BRANDS_SEGMENT}`;
}

/** The brand's link: its name for people to read, then its id, which is what counts. */
export function brandPath(
  project: Pick<Project, "slug">,
  brand: Pick<Brand, "_id" | "title">
): string {
  const slug = slugify(brand.title);
  return `${brandsPath(project)}/${slug ? `${slug}-` : ""}${brand._id}`;
}

/** The brand id at the end of a brand link, whatever name came before it. */
export function parseBrandParam(param: string): string | undefined {
  const id = param.toLowerCase().split("-").at(-1);
  return id && BRAND_ID.test(id) ? id : undefined;
}
