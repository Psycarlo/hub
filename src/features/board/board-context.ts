import type { Id } from "@convex/_generated/dataModel";
import { createContext, use } from "react";

import type { BoardLayout } from "@/features/board/layout-switch";
import type { Board, BoardContent, Card, CardFields } from "@/lib/model";
import { cardKey } from "@/lib/model";
import type { Project } from "@/lib/project";
import { projectPath } from "@/lib/project";

/** History state that lets leaving a card's page be a plain back navigation. */
export const OPENED_FROM_BOARD = { fromBoard: true };

/** Where a new card starts, from the column or list it was added in. */
export type CardPlacement = Pick<CardFields, "status" | "sprintId">;

export interface BoardScope {
  board: Board;
  /** The project the board sits in; its people are the board's people. */
  project: Project;
  content: BoardContent;
  cards: Card[];
  /** Whether the cards show as a column per status or a list. */
  layout: BoardLayout;
  me: Id<"users">;
  /** Whether the person may change cards and sprints, not just read them. */
  canEdit: boolean;
  /** Everyone on the project, who can be assigned and mentioned. */
  people: Id<"users">[];
  cardHref: (card: Card) => string;
  /** Opens the new card dialog. */
  newCard: (placement: CardPlacement) => void;
}

export const BoardContext = createContext<BoardScope | null>(null);

export function useBoard(): BoardScope {
  const scope = use(BoardContext);
  if (!scope) {
    throw new Error("useBoard needs a BoardContext provider.");
  }
  return scope;
}

export const BOARDS_SEGMENT = "boards";

/** A board, or one of its cards: `/p/acme/boards/HUB` or `/p/acme/boards/HUB-12`. */
export const BOARD_ROUTE = `/p/:project/${BOARDS_SEGMENT}/:slug` as const;

function boardsBase(project: Pick<Project, "slug">): string {
  return `${projectPath(project)}/${BOARDS_SEGMENT}`;
}

function withQuery(path: string, query?: URLSearchParams): string {
  const search = query?.toString();
  return search ? `${path}?${search}` : path;
}

/** A board's path in its project, with any query to keep, like the open tab. */
export function boardPath(
  project: Pick<Project, "slug">,
  board: Pick<Board, "code">,
  query?: URLSearchParams
): string {
  return withQuery(`${boardsBase(project)}/${board.code}`, query);
}

/** A card's path by its number, with any query to keep, like the open tab. */
export function cardPath(
  project: Pick<Project, "slug">,
  board: Pick<Board, "code">,
  card: Pick<Card, "number">,
  query?: URLSearchParams
): string {
  return withQuery(`${boardsBase(project)}/${cardKey(board, card)}`, query);
}
