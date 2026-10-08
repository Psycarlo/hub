/** Doc pages: what both the server and the app know about them. */

import { mentionToken } from "./mentions";

const EXCERPT_LENGTH = 160;
/** Words kept before a mention, when its line is too long to show whole. */
const MENTION_LEAD = 40;
/** A table's header rule, like `| --- | :--: |`. */
const TABLE_RULE = /^\s*\|?(?:\s*:?-{3,}:?\s*\|?)+\s*$/gmu;
const MARKDOWN_SYNTAX =
  /!?\[(?<text>[^\]]*)\]\([^)]*\)|^\s{0,3}(?:#{1,6}|>|[-+*]|\d{1,9}[.)])\s+|\[[ x]\]\s|[*_~`]+|\\(?=\S)|&nbsp;/gmu;
/** A mention cut off at the end, which would show as its raw token. */
const CUT_MENTION = /<@[0-9a-z]*$/u;

export function pageTitle(page: { title: string }): string {
  return page.title.trim() || "Untitled";
}

function plainText(markdown: string): string {
  return markdown
    .replace(TABLE_RULE, "")
    .replaceAll("|", " ")
    .replace(MARKDOWN_SYNTAX, (_, link: string | undefined) => link ?? "")
    .replaceAll(/\s+/gu, " ")
    .trim();
}

// Mentions have no spaces, so starting at a word never cuts one in half.
function clip(text: string, start: number): string {
  const end = start + EXCERPT_LENGTH;
  if (start === 0 && text.length <= end) {
    return text;
  }
  const clipped = text.slice(start, end);
  return [
    start > 0 ? "…" : "",
    end < text.length ? clipped.replace(CUT_MENTION, "").trimEnd() : clipped,
    end < text.length ? "…" : "",
  ].join("");
}

/** The opening words of a page, without its markdown. Mentions stay tokens. */
export function pageExcerpt(content: string): string {
  return clip(plainText(content), 0);
}

/** The line of a page that mentions someone, without its markdown, around the mention. */
export function mentionExcerpt(content: string, userId: string): string {
  const token = mentionToken(userId);
  const text = plainText(
    content.split("\n").find((line) => line.includes(token)) ?? ""
  );
  const at = text.indexOf(token);
  const start =
    at > MENTION_LEAD ? text.lastIndexOf(" ", at - MENTION_LEAD) + 1 : 0;
  return clip(text, start);
}
