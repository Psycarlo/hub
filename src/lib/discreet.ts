import { useSyncExternalStore } from "react";

import { playSound } from "@/lib/sounds";
import { eventPoint, readStorage, writeStorage } from "@/lib/utils";

const DISCREET_KEY = "discreet";
/** What stands in for a hidden amount's digits, the same however many there are. */
export const MASK = "••••";
/** From an amount's first digit to its last, with a compact suffix like `K` or `Mio.`. */
const DIGITS = /\d(?:[\d\s.,'’]*\d)?(?:\s?\p{L}+\.?)?/u;

const listeners = new Set<() => void>();

let current = readStorage(DISCREET_KEY) === "on";
let origin: [number, number] | undefined;

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

/** Hides or shows portfolio amounts on this device; `event` is where the change starts from. */
export function setDiscreet(on: boolean, event?: Event): void {
  if (on === current) {
    return;
  }
  writeStorage(DISCREET_KEY, on ? "on" : null);
  current = on;
  origin = event ? eventPoint(event) : undefined;
  notify();
  playSound(on ? "off" : "on");
}

/** Where the last change was made from, so it can spread out from there. */
export function discreetOrigin(): [number, number] | undefined {
  return origin;
}

/** An amount around its digits: `$1,234.56` is `$`, `1,234.56` and nothing. */
export function splitAmount(text: string): [string, string, string] {
  const match = DIGITS.exec(text);
  if (!match) {
    return ["", text, ""];
  }
  const end = match.index + match[0].length;
  return [text.slice(0, match.index), match[0], text.slice(end)];
}

/** An amount with its digits hidden, keeping its currency: `$••••`, `₿••••`. */
export function maskAmount(text: string): string {
  const [before, , after] = splitAmount(text);
  return `${before}${MASK}${after}`;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Whether portfolio amounts are hidden on this device. */
export function useDiscreet(): boolean {
  return useSyncExternalStore(subscribe, () => current);
}

// Another tab changing it changes it here too.
window.addEventListener("storage", (event) => {
  if (event.key !== DISCREET_KEY && event.key !== null) {
    return;
  }
  const on = readStorage(DISCREET_KEY) === "on";
  if (on !== current) {
    current = on;
    origin = undefined;
    notify();
  }
});
