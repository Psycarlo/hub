import type { Doc, Id } from "@convex/_generated/dataModel";
import type { BoardView } from "@convex/boards";
import type { BoardLabel } from "@convex/shared/model";
import { differenceInCalendarDays, parseISO } from "date-fns";

import { plural } from "@/lib/utils";

export type { CardDefaults } from "@convex/boards";
export type {
  BoardLabel,
  Priority,
  ProjectRole,
  Status,
} from "@convex/shared/model";
export {
  CODE,
  isClosed,
  labelKey,
  MAX_CARD_FILES,
  MAX_CODE,
  MAX_COMMENT_FILES,
  MAX_LABEL_NAME,
  MAX_LABELS,
  PRIORITIES,
  priorityLabel,
  rankBetween,
  RESERVED_CODES,
  sortLabels,
  STATUSES,
  statusLabel,
  suggestCode,
} from "@convex/shared/model";

export type UserId = Id<"users">;
export type Board = BoardView;
export type Card = Doc<"cards">;
export type Sprint = Doc<"sprints">;

export interface BoardContent {
  cards: Card[];
  /** By name. */
  labels: BoardLabel[];
  sprints: Sprint[];
  nextCardNumber: number;
  nextSprintNumber: number;
}

/** The fields of a card that people change. */
export type CardFields = Pick<
  Card,
  | "title"
  | "description"
  | "status"
  | "rank"
  | "assignees"
  | "priority"
  | "due"
  | "labels"
  | "sprintId"
>;

export function cardKey(
  board: Pick<Board, "code">,
  card: Pick<Card, "number">
) {
  return `${board.code}-${card.number}`;
}

/** How long is left until a sprint's `YYYY-MM-DD` end, like "3 days left". */
export function sprintRemaining(end: string): string {
  const days = differenceInCalendarDays(parseISO(end), new Date());
  if (days > 0) {
    return `${plural(days, "day")} left`;
  }
  if (days < 0) {
    return `${plural(-days, "day")} over`;
  }
  return "Last day";
}

export function activeSprint(content: BoardContent): Sprint | undefined {
  return content.sprints.findLast((sprint) => sprint.status === "active");
}

export function upcomingSprint(content: BoardContent): Sprint | undefined {
  return content.sprints.find((sprint) => sprint.status === "future");
}
