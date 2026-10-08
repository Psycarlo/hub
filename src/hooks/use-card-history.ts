import { api } from "@convex/_generated/api";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";

import type { Card } from "@/lib/model";

export type CardEvent = FunctionReturnType<typeof api.cards.history>[number];

const NONE: CardEvent[] = [];

/** What's been changed on a card, oldest first. */
export function useCardHistory(card: Card): CardEvent[] {
  return useQuery(api.cards.history, { cardId: card._id }) ?? NONE;
}
