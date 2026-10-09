import type { Account } from "@/lib/finance";
import type { Project } from "@/lib/project";
import { projectPath, slugify } from "@/lib/project";

/** Where a project's finance lives, after its tables: `/p/:project/finance`. */
export const FINANCE_SEGMENT = "finance";

const ACCOUNT_ID = /^[0-9a-z]{16,40}$/u;

export function financePath(project: Pick<Project, "slug">): string {
  return `${projectPath(project)}/${FINANCE_SEGMENT}`;
}

/**
 * The account's link: its name for people to read, then its id, which is
 * what counts. `month` opens on that month rather than the current one.
 */
export function accountPath(
  project: Pick<Project, "slug">,
  account: Pick<Account, "_id" | "title">,
  month?: string
): string {
  const slug = slugify(account.title);
  const path = `${financePath(project)}/${slug ? `${slug}-` : ""}${account._id}`;
  return month ? `${path}?month=${month}` : path;
}

/** The account id at the end of an account link, whatever name came before it. */
export function parseAccountParam(param: string): string | undefined {
  const id = param.toLowerCase().split("-").at(-1);
  return id && ACCOUNT_ID.test(id) ? id : undefined;
}
