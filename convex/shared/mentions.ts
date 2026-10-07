/**
 * Mentions in comments are stored as `<@userId>` tokens, so names can change
 * without breaking them. No browser APIs here: the server reads them too, to
 * notify the people mentioned.
 */

const TOKEN = /<@(?<id>[0-9a-z]+)>/gu;
const SYNTAX = /[$()*+.?[\\\]^{|}]/gu;

/** Someone picked from the mention list while writing, by the name shown. */
export interface Mention {
  name: string;
  userId: string;
}

export type MentionSegment =
  | { type: "text"; text: string }
  | { type: "mention"; userId: string };

export function mentionToken(userId: string): string {
  return `<@${userId}>`;
}

/** Splits content into plain text and the people it mentions, in order. */
export function splitMentions(content: string): MentionSegment[] {
  const segments: MentionSegment[] = [];
  let last = 0;
  for (const match of content.matchAll(TOKEN)) {
    const [token] = match;
    const userId = match.groups?.id;
    if (!userId) {
      continue;
    }
    if (match.index > last) {
      segments.push({ text: content.slice(last, match.index), type: "text" });
    }
    segments.push({ type: "mention", userId });
    last = match.index + token.length;
  }
  if (last < content.length) {
    segments.push({ text: content.slice(last), type: "text" });
  }
  return segments;
}

/** Everyone mentioned in the content, once each. */
export function mentionedUsers(content: string): string[] {
  return [
    ...new Set(
      splitMentions(content).flatMap((segment) =>
        segment.type === "mention" ? [segment.userId] : []
      )
    ),
  ];
}

export function mentions(content: string, userId: string): boolean {
  return mentionedUsers(content).includes(userId);
}

/**
 * Turns every `@Name` the writer picked into its token. Longer names win, so
 * `@Ana Lu` is never read as `@Ana`, and a name the writer edited after
 * picking it stays plain text.
 */
export function encodeMentions(text: string, picked: Mention[]): string {
  const byName = new Map<string, string>();
  for (const { name, userId } of picked) {
    if (!byName.has(name)) {
      byName.set(name, userId);
    }
  }
  if (byName.size === 0) {
    return text;
  }
  const names = [...byName.keys()]
    .toSorted((a, b) => b.length - a.length)
    .map((name) => name.replaceAll(SYNTAX, String.raw`\$&`));
  const pattern = new RegExp(
    `@(?<name>${names.join("|")})(?![\\p{L}\\p{N}_])`,
    "gu"
  );
  return text.replace(pattern, (match, name: string) => {
    const userId = byName.get(name);
    return userId ? mentionToken(userId) : match;
  });
}
