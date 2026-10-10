import { api } from "@convex/_generated/api";
import type { ReactionGroup } from "@convex/reactions";
import { useQuery } from "convex/react";

import type { Card } from "@/lib/model";

export type Reaction = ReactionGroup;

const NONE: Reaction[] = [];

/** Reactions on a card and its comments, each emoji once per card or comment. */
export function useReactions(card: Card): Reaction[] {
  return useQuery(api.reactions.list, { cardId: card._id }) ?? NONE;
}
