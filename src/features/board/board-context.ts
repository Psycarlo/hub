import type { Id } from "@convex/_generated/dataModel";
import { createContext, use } from "react";

import type { Board, BoardContent, Card, CardFields } from "@/lib/model";
import { cardKey } from "@/lib/model";
import type { Project } from "@/lib/project";

/** History state that lets the card dialog close with a plain back navigation. */
export const OPENED_FROM_BOARD = { fromBoard: true };

/** Where a new card starts, from the column or list it was added in. */
export type CardPlacement = Pick<CardFields, "status" | "sprintId">;

export interface BoardScope {
  board: Board;
  /** The project the board sits in; its people are the board's people. */
  project: Project;
  content: BoardContent;
  cards: Card[];
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

export function boardPath(board: Pick<Board, "code">): string {
  return `/${board.code}`;
}

/** A card's path by its number, with any query to keep, like the open tab. */
export function cardPath(
  board: Pick<Board, "code">,
  card: Pick<Card, "number">,
  query?: URLSearchParams
): string {
  const search = query?.toString();
  return `/${cardKey(board, card)}${search ? `?${search}` : ""}`;
}
