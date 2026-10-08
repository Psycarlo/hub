import { api } from "@convex/_generated/api";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";

import type { Card } from "@/lib/model";

export type Attachment = FunctionReturnType<
  typeof api.attachments.list
>[number];

const NONE: Attachment[] = [];

/** Files attached to a card itself, oldest first. */
export function useAttachments(card: Card): Attachment[] {
  return useQuery(api.attachments.list, { cardId: card._id }) ?? NONE;
}
