import { useSyncExternalStore } from "react";

/** Chrome's offer to install the hub, which only it and Edge make. */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<unknown>;
}

/** Whether the hub runs as an installed app, rather than in a browser tab. */
export const installed: boolean =
  window.matchMedia("(display-mode: standalone)").matches ||
  // Older iOS says so here instead.
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

/** iPhones and iPads, where any browser installs through the share sheet instead. */
export const installsFromShareSheet: boolean =
  /iPhone|iPad|iPod/u.test(navigator.userAgent) ||
  // iPadOS asks for desktop sites, so it reads as a Mac with a touch screen.
  (/Macintosh/u.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

let offer: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Asks the browser to install the hub, or null when it hasn't offered to. */
export function useInstall(): (() => Promise<void>) | null {
  const current = useSyncExternalStore(subscribe, () => offer);
  if (!current) {
    return null;
  }
  return async () => {
    // An offer works once; the browser makes a new one if it's turned down.
    offer = null;
    notify();
    await current.prompt();
  };
}

async function register(): Promise<void> {
  try {
    await navigator.serviceWorker.register("/sw.js", {
      updateViaCache: "none",
    });
  } catch {
    // The hub works without it, only not offline.
  }
}

/**
 * Registers the service worker, in builds only: in development it would cache
 * what Vite serves. Also keeps the browser's install offer for Settings.
 */
export function startPwa(): void {
  addEventListener("beforeinstallprompt", (event) => {
    offer = event as InstallPromptEvent;
    notify();
  });
  addEventListener("appinstalled", () => {
    offer = null;
    notify();
  });
  if (!(import.meta.env.PROD && "serviceWorker" in navigator)) {
    return;
  }
  // After the page has loaded, so the worker's own fetching doesn't slow it.
  if (document.readyState === "complete") {
    register();
  } else {
    addEventListener("load", register, { once: true });
  }
}
