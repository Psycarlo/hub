/**
 * What a notification says. The inbox shows it after the name of whoever did
 * it; pushes and system notifications show it as plain text. No browser APIs
 * here: the server words its pushes the same way.
 */
import type { CardChange } from "../lib/validators";
import { pageTitle } from "./docs";
import type { EntryKind } from "./finance";
import { splitMentions } from "./mentions";
import { priorityLabel, statusLabel } from "./model";

/** Why someone hears about a card. */
export const CARD_NEWS = [
  "mention",
  "comment",
  "change",
  "due",
  "overdue",
] as const;
export type CardNews = (typeof CARD_NEWS)[number];

/** Why someone hears about a Drive file. */
export const FILE_NEWS = ["mention", "comment"] as const;
export type FileNews = (typeof FILE_NEWS)[number];

/** Reminders of a finance entry still to pay or receive, as its due day nears. */
export const ENTRY_NEWS = ["soon", "tomorrow", "today"] as const;
export type EntryNews = (typeof ENTRY_NEWS)[number];

/** How many days before an entry's due day each reminder goes out. */
export const ENTRY_REMINDER_DAYS: Record<EntryNews, number> = {
  soon: 3,
  today: 0,
  tomorrow: 1,
};

/** Changes to a card that its followers hear about; the rest only show in its activity. */
export const NEWS_CHANGES: readonly CardChange["kind"][] = [
  "status",
  "assignees",
  "priority",
  "due",
];

/** How long a push waits, so a comment deleted or a change undone at once never goes out. */
export const PUSH_DELAY_MS = 30_000;

/** Characters of a comment quoted in a push. */
const QUOTE_LENGTH = 140;

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** A notification as it's told, whatever it points at. */
export type NewsItem = {
  /** Missing on reminders, which nobody sent. */
  actorId?: string;
  project: { title: string };
} & (
  | {
      kind: "card";
      reason: CardNews;
      changes?: CardChange[];
      content?: string;
      due?: string;
      board: { code: string };
      card: { number: number; title: string };
    }
  | { kind: "page"; content: string; page: { title: string } }
  | { kind: "file"; reason: FileNews; content: string; file: { name: string } }
  | { kind: "project" }
  | {
      kind: "entry";
      reason: EntryNews;
      due: string;
      entry: { name: string; cents: number; kind: EntryKind };
      account: { currency: string };
    }
);

/** Display names, by user id. */
export type Names = (userId: string) => string;

/** "A", "A and B", or "A, B and C". */
export function joinWords(words: string[]): string {
  if (words.length <= 1) {
    return words.join("");
  }
  return `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`;
}

/** Days since 1970 of a `YYYY-MM-DD` date, to count the days between two. */
function dayNumber(date: string): number {
  const [year = 1970, month = 1, day = 1] = date.split("-").map(Number);
  return Date.UTC(year, month - 1, day) / 86_400_000;
}

/** "Mar 3", from `YYYY-MM-DD`. */
function shortDay(date: string): string {
  const [, month = 1, day = 1] = date.split("-").map(Number);
  return `${MONTHS[month - 1] ?? ""} ${day}`;
}

/** "Due tomorrow", "Due today", "Overdue", or the day it's due, as of `today` (`YYYY-MM-DD`). */
export function dueWords(due: string, today: string): string {
  const days = dayNumber(due) - dayNumber(today);
  if (days < 0) {
    return "Overdue";
  }
  if (days === 0) {
    return "Due today";
  }
  return days === 1 ? "Due tomorrow" : `Due ${shortDay(due)}`;
}

/** Cents as money, like "€950.00"; its code where the currency isn't known. */
function money(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en", { currency, style: "currency" }).format(
      cents / 100
    );
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

/** "€950.00 to pay · Due tomorrow": what an entry comes to, and when. */
function entryWords(
  item: Extract<NewsItem, { kind: "entry" }>,
  today: string
): string {
  const verb = item.entry.kind === "credit" ? "to receive" : "to pay";
  return `${money(item.entry.cents, item.account.currency)} ${verb} · ${dueWords(item.due, today)}`;
}

/** The card's changes as the recipient reads them, what's about them first. */
function changeWords(
  changes: CardChange[],
  recipient: string,
  names: Names
): string[] {
  const mine: string[] = [];
  const rest: string[] = [];
  for (const change of changes) {
    switch (change.kind) {
      case "status": {
        rest.push(`moved it to ${statusLabel(change.to)}`);
        break;
      }
      case "assignees": {
        const added: string[] = change.to.filter(
          (id) => !change.from.includes(id)
        );
        const removed: string[] = change.from.filter(
          (id) => !change.to.includes(id)
        );
        const others = (people: string[]) =>
          joinWords(people.filter((id) => id !== recipient).map(names));
        if (added.includes(recipient)) {
          mine.push("assigned you");
        }
        if (removed.includes(recipient)) {
          mine.push("unassigned you");
        }
        if (others(added)) {
          rest.push(`assigned ${others(added)}`);
        }
        if (others(removed)) {
          rest.push(`unassigned ${others(removed)}`);
        }
        break;
      }
      case "priority": {
        rest.push(
          change.to
            ? `set the priority to ${priorityLabel(change.to)}`
            : "removed the priority"
        );
        break;
      }
      case "due": {
        rest.push(
          change.to
            ? `set the due date to ${shortDay(change.to)}`
            : "removed the due date"
        );
        break;
      }
      default: {
        rest.push("changed it");
      }
    }
  }
  return [...mine, ...rest];
}

/**
 * What happened, after the name of whoever did it: "mentioned you",
 * "moved it to Done and assigned you". A reminder has no one, so it reads
 * whole: "Due tomorrow".
 */
export function notificationWords(
  item: NewsItem,
  recipient: string,
  names: Names,
  today: string
): string {
  switch (item.kind) {
    case "card": {
      switch (item.reason) {
        case "mention": {
          return "mentioned you";
        }
        case "comment": {
          return "commented";
        }
        case "change": {
          return joinWords(changeWords(item.changes ?? [], recipient, names));
        }
        default: {
          return item.due ? dueWords(item.due, today) : "Coming due";
        }
      }
    }
    case "file": {
      return item.reason === "comment" ? "commented" : "mentioned you";
    }
    case "project": {
      return "added you to the project";
    }
    case "entry": {
      return entryWords(item, today);
    }
    default: {
      return "mentioned you";
    }
  }
}

/** The words quoted with it, with mentions as tokens: the comment, or the line that mentions them. */
export function notificationQuote(item: NewsItem): string | undefined {
  return "content" in item && item.content ? item.content : undefined;
}

/** What it's about: the card by its key and title, or the page, file, entry or project by name. */
export function notificationTitle(item: NewsItem): string {
  switch (item.kind) {
    case "card": {
      return `${item.board.code}-${item.card.number} ${item.card.title || "Untitled"}`;
    }
    case "page": {
      return pageTitle(item.page);
    }
    case "file": {
      return item.file.name;
    }
    case "entry": {
      return item.entry.name;
    }
    default: {
      return item.project.title;
    }
  }
}

/** Text with each mention as `@Name`, for places that only show plain text. */
export function plainMentions(content: string, names: Names): string {
  return splitMentions(content)
    .map((segment) =>
      segment.type === "text" ? segment.text : `@${names(segment.userId)}`
    )
    .join("");
}

function clip(text: string, length: number): string {
  return text.length > length ? `${text.slice(0, length).trimEnd()}…` : text;
}

/** A push or system notification's text: the subject as the title, then who did what. */
export function notificationMessage(
  item: NewsItem,
  recipient: string,
  names: Names,
  today: string
): { title: string; body: string } {
  const words = notificationWords(item, recipient, names, today);
  const said = item.actorId ? `${names(item.actorId)} ${words}` : words;
  const quote = notificationQuote(item);
  const text = quote
    ? clip(
        plainMentions(quote, names).replaceAll(/\s+/gu, " ").trim(),
        QUOTE_LENGTH
      )
    : "";
  return {
    body: text ? `${said}: ${text}` : said,
    title: notificationTitle(item),
  };
}
