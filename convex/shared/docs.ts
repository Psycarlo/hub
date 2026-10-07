/** Doc pages: what both the server and the app know about them. */

const EXCERPT_LENGTH = 160;
/** A table's header rule, like `| --- | :--: |`. */
const TABLE_RULE = /^\s*\|?(?:\s*:?-{3,}:?\s*\|?)+\s*$/gmu;
const MARKDOWN_SYNTAX =
  /!?\[(?<text>[^\]]*)\]\([^)]*\)|^\s{0,3}(?:#{1,6}|>|[-+*]|\d{1,9}[.)])\s+|\[[ x]\]\s|[*_~`]+|\\(?=\S)|&nbsp;/gmu;

export function pageTitle(page: { title: string }): string {
  return page.title.trim() || "Untitled";
}

/** The opening words of a page, without its markdown. */
export function pageExcerpt(content: string): string {
  const text = content
    .replace(TABLE_RULE, "")
    .replaceAll("|", " ")
    .replace(MARKDOWN_SYNTAX, (_, link: string | undefined) => link ?? "")
    .replaceAll(/\s+/gu, " ")
    .trim();
  return text.length > EXCERPT_LENGTH
    ? `${text.slice(0, EXCERPT_LENGTH).trimEnd()}…`
    : text;
}
