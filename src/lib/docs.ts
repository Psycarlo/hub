import type { PageSummary } from "@convex/docs";

export { pageTitle } from "@convex/shared/docs";

/** A page as the tree shows it, without its text. */
export type DocPage = PageSummary;

export interface DocsContent {
  /** Every page, parents before their children, siblings in order. */
  pages: DocPage[];
  /** Pages at the top of the project's docs, in order. */
  roots: DocPage[];
  byId: Map<string, DocPage>;
  /** Pages under each page, in order. */
  children: Map<string, DocPage[]>;
}

export const EMPTY_DOCS: DocsContent = {
  byId: new Map(),
  children: new Map(),
  pages: [],
  roots: [],
};

function bySiblingOrder(a: DocPage, b: DocPage): number {
  return (
    a.rank - b.rank ||
    a._creationTime - b._creationTime ||
    a._id.localeCompare(b._id)
  );
}

// A page whose parent is gone shows at the top instead of disappearing.
function placeable(page: DocPage, byId: Map<string, DocPage>): boolean {
  return page.parentId === undefined || byId.has(page.parentId);
}

/** One project's pages as a tree. */
export function resolveDocs(pages: DocPage[]): DocsContent {
  const raw = new Map(pages.map((page) => [page._id, page]));
  const placed = pages.map((page) =>
    placeable(page, raw) ? page : { ...page, parentId: undefined }
  );
  const byId = new Map(placed.map((page) => [page._id, page]));
  const children = new Map<string, DocPage[]>();
  const roots: DocPage[] = [];
  for (const page of placed.toSorted(bySiblingOrder)) {
    if (page.parentId) {
      children.set(page.parentId, [
        ...(children.get(page.parentId) ?? []),
        page,
      ]);
    } else {
      roots.push(page);
    }
  }
  const ordered: DocPage[] = [];
  const visit = (page: DocPage) => {
    ordered.push(page);
    for (const child of children.get(page._id) ?? []) {
      visit(child);
    }
  };
  for (const root of roots) {
    visit(root);
  }
  return { byId, children, pages: ordered, roots };
}

/** Every project's pages as trees, by project id. */
export function docsByProject(pages: DocPage[]): Map<string, DocsContent> {
  const grouped = new Map<string, DocPage[]>();
  for (const page of pages) {
    grouped.set(page.projectId, [...(grouped.get(page.projectId) ?? []), page]);
  }
  return new Map(
    [...grouped].map(([projectId, list]) => [projectId, resolveDocs(list)])
  );
}

/** The pages above this one, from the top down. */
export function ancestors(content: DocsContent, page: DocPage): DocPage[] {
  const chain: DocPage[] = [];
  const seen = new Set<string>();
  for (
    let parent = page.parentId && content.byId.get(page.parentId);
    parent && !seen.has(parent._id);
    parent = parent.parentId && content.byId.get(parent.parentId)
  ) {
    seen.add(parent._id);
    chain.unshift(parent);
  }
  return chain;
}

/** Every page under this one, at any depth. */
export function descendants(content: DocsContent, page: DocPage): DocPage[] {
  return (content.children.get(page._id) ?? []).flatMap((child) => [
    child,
    ...descendants(content, child),
  ]);
}

/** Whether `page` may move under `parent`: never under itself. */
export function canMoveUnder(
  content: DocsContent,
  page: DocPage,
  parent: string | undefined
): boolean {
  return (
    parent === undefined ||
    (parent !== page._id &&
      !descendants(content, page).some((item) => item._id === parent))
  );
}
