import { api } from "@convex/_generated/api";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";

import type { Card } from "@/lib/model";

export type Comment = FunctionReturnType<typeof api.comments.list>[number];

const NONE: Comment[] = [];

/** Comments on a card, oldest first. */
export function useComments(card: Card): Comment[] {
  return useQuery(api.comments.list, { cardId: card._id }) ?? NONE;
}
