/** The log: what both the server and the app know about it. */

import { addDays } from "./habits";

/** What a topic can show as its icon, by name. */
export const TOPIC_ICONS = [
  "folder",
  "briefcase",
  "rocket",
  "code",
  "terminal",
  "bug",
  "server",
  "phone",
  "globe",
  "design",
  "palette",
  "pen",
  "doc",
  "book",
  "learn",
  "research",
  "idea",
  "brain",
  "chart",
  "target",
  "megaphone",
  "mail",
  "meeting",
  "deal",
  "store",
  "company",
  "slides",
  "camera",
  "video",
  "mic",
  "music",
  "game",
  "build",
  "home",
  "heart",
  "bitcoin",
] as const;

export type TopicIcon = (typeof TOPIC_ICONS)[number];

export const MAX_TOPIC_TITLE = 80;
/** A line on what was done, not an essay: the log stays one glance a day. */
export const MAX_LOG_NOTE = 200;
export const MAX_TOPICS = 50;

/**
 * Counts the days in a row anything was logged, up to `today`, fed the logged
 * days newest first, a day as often as it has entries. Today, still open,
 * only adds once something's logged, and doesn't break the run before then.
 */
export class LogStreak {
  days = 0;
  private readonly today: string;
  /** The day the next entry should fall on to keep the run going. */
  private day: string;
  private ended = false;

  constructor(today: string) {
    this.today = today;
    this.day = today;
  }

  /** Takes the next logged day back; false once the run has ended, so the rest can go unread. */
  add(date: string): boolean {
    if (this.ended || date > this.day) {
      // Later than today, or another entry on a day already counted.
      return !this.ended;
    }
    if (date !== this.day && this.day === this.today) {
      // Nothing yet today: the run can still go on from yesterday.
      this.day = addDays(this.today, -1);
    }
    if (date !== this.day) {
      this.ended = true;
      return false;
    }
    this.days += 1;
    this.day = addDays(date, -1);
    return true;
  }
}
