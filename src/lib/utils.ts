import { ConvexError } from "convex/values";

/** What went wrong, in words fit for a toast. */
export function errorMessage(error: unknown): string {
  if (error instanceof ConvexError) {
    return typeof error.data === "string"
      ? error.data
      : "Something went wrong.";
  }
  return error instanceof Error ? error.message : String(error);
}

export function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

export function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStorage(key: string, value: string | null): void {
  try {
    if (value === null) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, value);
    }
  } catch {
    // Storage blocked: state just won't survive a reload.
  }
}
