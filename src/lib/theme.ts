import { useSyncExternalStore } from "react";

import { playSound } from "@/lib/sounds";
import { eventPoint, readStorage, writeStorage } from "@/lib/utils";

export type Theme = "light" | "dark" | "system";

const THEME_KEY = "theme";

const media = window.matchMedia("(prefers-color-scheme: dark)");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const listeners = new Set<() => void>();

function savedTheme(): Theme {
  const saved = readStorage(THEME_KEY);
  return saved === "light" || saved === "dark" ? saved : "system";
}

let current: Theme = savedTheme();

function isDark(theme: Theme): boolean {
  return theme === "dark" || (theme === "system" && media.matches);
}

function apply(theme: Theme): void {
  const dark = isDark(theme);
  const freeze = document.createElement("style");
  freeze.textContent = "*,*::before,*::after{transition:none!important}";
  document.head.append(freeze);
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
  window.getComputedStyle(document.body);
  requestAnimationFrame(() => freeze.remove());
}

async function reveal(
  transition: ViewTransition,
  [x, y]: [number, number]
): Promise<void> {
  try {
    await transition.ready;
  } catch {
    return;
  }
  const radius = Math.hypot(
    Math.max(x, window.innerWidth - x),
    Math.max(y, window.innerHeight - y)
  );
  document.documentElement.animate(
    {
      clipPath: [
        `circle(0 at ${x}px ${y}px)`,
        `circle(${radius}px at ${x}px ${y}px)`,
      ],
    },
    {
      duration: 400,
      easing: "cubic-bezier(0.23, 1, 0.32, 1)",
      pseudoElement: "::view-transition-new(root)",
    }
  );
}

/** Spreads the new theme out from where it was picked. */
export function setTheme(theme: Theme, event: Event): void {
  playSound("switch");
  writeStorage(THEME_KEY, theme === "system" ? null : theme);
  current = theme;
  for (const listener of listeners) {
    listener();
  }
  const changed =
    isDark(theme) !== document.documentElement.classList.contains("dark");
  if (!(changed && "startViewTransition" in document)) {
    apply(theme);
    return;
  }
  const transition = document.startViewTransition(() => apply(theme));
  if (!reducedMotion.matches) {
    reveal(transition, eventPoint(event));
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The theme picked, or "system" to follow the device. */
export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, () => current);
}

function subscribeDark(listener: () => void): () => void {
  listeners.add(listener);
  media.addEventListener("change", listener);
  return () => {
    listeners.delete(listener);
    media.removeEventListener("change", listener);
  };
}

/** Whether the app shows dark, whether picked or followed from the device. */
export function useDark(): boolean {
  return useSyncExternalStore(subscribeDark, () => isDark(current));
}

export function startTheme(): void {
  apply(current);
  media.addEventListener("change", () => {
    if (current === "system") {
      apply("system");
    }
  });
}
