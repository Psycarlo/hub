import { format } from "date-fns";
import { useSyncExternalStore } from "react";

const MINUTE = 60_000;

function subscribeMinute(onChange: () => void): () => void {
  const timer = setInterval(onChange, MINUTE);
  return () => clearInterval(timer);
}

/** Today as `YYYY-MM-DD`, like due dates, turning over with the page left open. */
export function useToday(): string {
  return useSyncExternalStore(subscribeMinute, () =>
    format(new Date(), "yyyy-MM-dd")
  );
}
