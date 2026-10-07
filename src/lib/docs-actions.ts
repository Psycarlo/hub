import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { OptimisticLocalStore } from "convex/browser";

import { run } from "@/lib/actions";
import { convex } from "@/lib/convex";
import type { DocPage, DocsContent } from "@/lib/docs";
import { descendants } from "@/lib/docs";
import { rankBetween } from "@/lib/model";

function patchTree(
  store: OptimisticLocalStore,
  patch: (pages: DocPage[]) => DocPage[]
): void {
  const pages = store.getQuery(api.docs.tree, {});
  if (pages) {
    store.setQuery(api.docs.tree, {}, patch(pages));
  }
}

/** Starts a page, last under `parentId`, and resolves with its id. */
export function createPage(
  projectId: Id<"projects">,
  page: {
    parentId?: Id<"docPages">;
    title?: string;
    icon?: string;
    content?: string;
  } = {}
) {
  return run(convex.mutation(api.docs.create, { projectId, ...page }));
}

/** Changes the title or icon of a page. */
export function updatePage(
  page: Pick<DocPage, "_id">,
  changes: { title?: string; icon?: string }
) {
  return run(
    convex.mutation(
      api.docs.update,
      { pageId: page._id, ...changes },
      {
        optimisticUpdate: (store) => {
          patchTree(store, (pages) =>
            pages.map((item) =>
              item._id === page._id ? { ...item, ...changes } : item
            )
          );
          const open = store.getQuery(api.docs.get, { pageId: page._id });
          if (open) {
            store.setQuery(
              api.docs.get,
              { pageId: page._id },
              { ...open, ...changes }
            );
          }
        },
      }
    )
  );
}

/**
 * Moves the page under `parentId` (or to the top), between the pages
 * `before` and `after` there, or last when neither is given.
 */
export function movePage(
  docs: DocsContent,
  page: DocPage,
  parentId?: Id<"docPages">,
  { before, after }: { before?: DocPage; after?: DocPage } = {}
) {
  const siblings = (
    parentId ? (docs.children.get(parentId) ?? []) : docs.roots
  ).filter((item) => item._id !== page._id);
  const rank =
    before || after
      ? rankBetween(before?.rank, after?.rank)
      : (siblings.at(-1)?.rank ?? 0) + 1;
  return run(
    convex.mutation(
      api.docs.move,
      {
        afterId: after?._id,
        beforeId: before?._id,
        pageId: page._id,
        parentId: parentId ?? null,
      },
      {
        optimisticUpdate: (store) =>
          patchTree(store, (pages) =>
            pages.map((item) =>
              item._id === page._id ? { ...item, parentId, rank } : item
            )
          ),
      }
    )
  );
}

/** Deletes the page and every page under it. */
export function deletePage(docs: DocsContent, page: DocPage) {
  const gone = new Set(
    [page, ...descendants(docs, page)].map((item) => item._id)
  );
  return run(
    convex.mutation(
      api.docs.remove,
      { pageId: page._id },
      {
        optimisticUpdate: (store) =>
          patchTree(store, (pages) =>
            pages.filter((item) => !gone.has(item._id))
          ),
      }
    )
  );
}
