import { api } from "@convex/_generated/api";
import { useQuery } from "convex/react";

import { convex } from "@/lib/convex";
import type { Card } from "@/lib/model";

/** How long the pointer rests on a card before its description starts loading. */
export const HOVER_INTENT_MS = 100;

/** The card's description, kept live; boards leave it out. Undefined until it loads. */
export function useCardDescription(
  card: Pick<Card, "_id">
): string | undefined {
  // Null once the card is gone, which closes it anyway.
  return useQuery(api.cards.description, { cardId: card._id }) ?? undefined;
}

/** Keeps the description of a card that may open next loaded, like those beside the open one. */
export function useWarmDescription(card: Pick<Card, "_id"> | undefined): void {
  useQuery(api.cards.description, card ? { cardId: card._id } : "skip");
}

/** Starts loading the description of a card about to open, so it shows at once. */
export function prewarmDescription(card: Pick<Card, "_id">): void {
  convex.prewarmQuery({
    args: { cardId: card._id },
    query: api.cards.description,
  });
}
