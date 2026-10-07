import { api } from "@convex/_generated/api";
import { useQuery } from "convex/react";

import type { Board, BoardContent } from "@/lib/model";

/** Cards and sprints of a board, kept live. */
export function useBoardContent(board: Board): {
  content: BoardContent | undefined;
  loaded: boolean;
} {
  // Null once the board is gone; the page then falls back to "not found".
  const content = useQuery(api.boards.content, { boardId: board._id });
  return { content: content ?? undefined, loaded: content !== undefined };
}
