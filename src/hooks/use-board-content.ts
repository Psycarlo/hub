import { api } from "@convex/_generated/api";
import { useQuery } from "convex/react";
import { useState } from "react";

import { keepEqual } from "@/lib/keep-equal";
import type { Board, BoardContent } from "@/lib/model";

/**
 * Cards and sprints of a board, kept live. Cards that didn't change keep their
 * identity across updates, so dropping a card re-renders that card, not every
 * card on the board.
 */
export function useBoardContent(board: Board): {
  content: BoardContent | undefined;
  loaded: boolean;
} {
  // Null once the board is gone; the page then falls back to "not found".
  const latest = useQuery(api.boards.content, { boardId: board._id });
  const [kept, setKept] = useState({ content: latest, latest });
  let { content } = kept;
  if (kept.latest !== latest) {
    content = keepEqual(kept.content, latest);
    setKept({ content, latest });
  }
  return { content: content ?? undefined, loaded: latest !== undefined };
}
