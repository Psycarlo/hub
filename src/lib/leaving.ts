import { convex } from "@/lib/convex";

const savers = new Set<() => void>();

/** Runs `save` when the page is hidden or left. Returns the way to stop. */
export function onLeave(save: () => void): () => void {
  savers.add(save);
  return () => savers.delete(save);
}

/** Saves everything waiting on a pause in typing, now. */
export function saveAll() {
  for (const save of savers) {
    save();
  }
}

/**
 * Typing waiting on a pause saves when the page is hidden or left, and leaving
 * while a change is still on its way to the server asks first.
 */
export function startLeaveGuard(): void {
  addEventListener("beforeunload", (event) => {
    saveAll();
    if (convex.connectionState().inflightMutations > 0) {
      event.preventDefault();
    }
  });
  addEventListener("pagehide", saveAll);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      saveAll();
    }
  });
}
