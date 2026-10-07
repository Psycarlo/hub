import type { Portfolio } from "@/lib/portfolio";
import type { Project } from "@/lib/project";
import { projectPath, slugify } from "@/lib/project";

/** Where a project's portfolios live, after its tables: `/p/:project/portfolios`. */
export const PORTFOLIOS_SEGMENT = "portfolios";

const PORTFOLIO_ID = /^[0-9a-z]{16,40}$/u;

export function portfoliosPath(project: Pick<Project, "slug">): string {
  return `${projectPath(project)}/${PORTFOLIOS_SEGMENT}`;
}

/** The portfolio's link: its name for people to read, then its id, which is what counts. */
export function portfolioPath(
  project: Pick<Project, "slug">,
  portfolio: Pick<Portfolio, "_id" | "title">
): string {
  const slug = slugify(portfolio.title);
  return `${portfoliosPath(project)}/${slug ? `${slug}-` : ""}${portfolio._id}`;
}

/** The portfolio id at the end of a portfolio link, whatever name came before it. */
export function parsePortfolioParam(param: string): string | undefined {
  const id = param.toLowerCase().split("-").at(-1);
  return id && PORTFOLIO_ID.test(id) ? id : undefined;
}
