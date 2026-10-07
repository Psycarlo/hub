import type { Doc, Id } from "@convex/_generated/dataModel";
import type { BoardView } from "@convex/boards";

export type {
  Label,
  Priority,
  ProjectRole,
  Status,
} from "@convex/shared/model";
export {
  CODE,
  LABELS,
  PRIORITIES,
  rankBetween,
  RESERVED_CODES,
  STATUSES,
  statusLabel,
} from "@convex/shared/model";

export type UserId = Id<"users">;
export type Board = BoardView;
export type Card = Doc<"cards">;
export type Sprint = Doc<"sprints">;

export interface BoardContent {
  cards: Card[];
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

export function activeSprint(content: BoardContent): Sprint | undefined {
  return content.sprints.findLast((sprint) => sprint.status === "active");
}

export function upcomingSprint(content: BoardContent): Sprint | undefined {
  return content.sprints.find((sprint) => sprint.status === "future");
}
