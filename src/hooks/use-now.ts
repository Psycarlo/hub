import { useEffect, useState } from "react";

const TICK = 30_000;

function currentTime(): number {
  return Date.now();
}

/** The time, moving on every half minute so what depends on it keeps up. */
export function useNow(): number {
  const [now, setNow] = useState(currentTime);
  useEffect(() => {
    const timer = setInterval(() => setNow(currentTime()), TICK);
    return () => clearInterval(timer);
  }, []);
  return now;
}
