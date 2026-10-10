import type { CueName, PlayOptions } from "@foleyjs/core";
import { play, set } from "@foleyjs/core";
import { useSyncExternalStore } from "react";

import { readStorage, writeStorage } from "@/lib/utils";

const SOUNDS_KEY = "sounds";

const listeners = new Set<() => void>();

let current = readStorage(SOUNDS_KEY) === "on";

// Rounded and a little quieter than the default, so it sits under the work.
set({ theme: "soft", volume: 0.5 });

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

/** Plays a cue for something that just happened, if sounds are on on this device. */
export function playSound(sound: CueName, options?: PlayOptions): void {
  if (current) {
    play(sound, options);
  }
}

/** Turns sounds on or off on this device, with a cue for turning them on. */
export function setSounds(on: boolean): void {
  if (on === current) {
    return;
  }
  writeStorage(SOUNDS_KEY, on ? "on" : null);
  current = on;
  notify();
  playSound("on");
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Whether the app plays sounds on this device. */
export function useSounds(): boolean {
  return useSyncExternalStore(subscribe, () => current);
}

// Another tab changing it changes it here too.
window.addEventListener("storage", (event) => {
  if (event.key !== SOUNDS_KEY && event.key !== null) {
    return;
  }
  const on = readStorage(SOUNDS_KEY) === "on";
  if (on !== current) {
    current = on;
    notify();
  }
});
