import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

// A page's text lives in its newest revision, so lists of pages needn't read
// it. Pages saved before still hold it themselves, until
// migrations:movePageText moves it.

/** Whether the page has any text, as lists show it. */
export function hasText(page: Doc<"docPages">): boolean {
  return page.hasContent ?? (page.content ?? "").trim() !== "";
}

/** The page's text as it is now, in markdown. */
export async function textOf(
  ctx: QueryCtx,
  page: Doc<"docPages">
): Promise<string> {
  if (page.content !== undefined) {
    return page.content;
  }
  const newest = await ctx.db
    .query("docRevisions")
    .withIndex("by_page_and_revision", (q) =>
      q.eq("pageId", page._id).eq("revision", page.revision)
    )
    .unique();
  return newest?.content ?? "";
}
