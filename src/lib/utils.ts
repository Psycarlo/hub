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

/** Where on screen an event happened: the pointer, or the middle of what was pressed. */
export function eventPoint(event: Event): [number, number] {
  // Keyboard presses arrive as synthetic clicks with no pointer position.
  if (event instanceof MouseEvent && event.isTrusted) {
    return [event.clientX, event.clientY];
  }
  const { x, y, width, height } = (
    event.target as Element
  ).getBoundingClientRect();
  return [x + width / 2, y + height / 2];
}

const BYTE_UNITS = ["B", "KB", "MB", "GB"] as const;
const fineSize = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });
const wholeSize = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 0,
});

/** A file's size as people read it, like "2.4 MB" or "820 KB". */
export function formatBytes(bytes: number): string {
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < BYTE_UNITS.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${(size < 10 ? fineSize : wholeSize).format(size)} ${BYTE_UNITS[unit]}`;
}
