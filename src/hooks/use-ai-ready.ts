import { api } from "@convex/_generated/api";
import { useQuery } from "convex/react";

/** Whether AI tasks can run on this hub, so features offer them only then. */
export function useAiReady(): boolean {
  return useQuery(api.ai.ready) ?? false;
}
