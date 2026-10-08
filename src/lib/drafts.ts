import { readStorage, writeStorage } from "@/lib/utils";

const PREFIX = "hub-draft:";
/** Drafts left this long are taken as abandoned. */
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

interface Stored {
  savedAt: number;
  draft: unknown;
}

function isStored(value: unknown): value is Stored {
  return (
    typeof value === "object" &&
    value !== null &&
    "savedAt" in value &&
    typeof value.savedAt === "number" &&
    "draft" in value &&
    typeof value.draft === "object" &&
    value.draft !== null
  );
}

function parse(raw: string | null): Stored | undefined {
  if (raw === null) {
    return undefined;
  }
  try {
    const value: unknown = JSON.parse(raw);
    return isStored(value) && Date.now() - value.savedAt < MAX_AGE_MS
      ? value
      : undefined;
  } catch {
    return undefined;
  }
}

/** The draft kept under `key`, as far as it still has the fields of `blank`. */
export function readDraft<T extends object>(
  key: string,
  blank: T
): T | undefined {
  const stored = parse(readStorage(PREFIX + key));
  return stored && { ...blank, ...(stored.draft as Partial<T>) };
}

/** Keeps the draft in this browser, or forgets it with `null`. */
export function writeDraft(key: string, draft: object | null): void {
  writeStorage(
    PREFIX + key,
    draft && JSON.stringify({ draft, savedAt: Date.now() } satisfies Stored)
  );
}

/** Forgets drafts that are too old or unreadable. */
export function pruneDrafts(): void {
  try {
    const keys = Array.from({ length: localStorage.length }, (_, index) =>
      localStorage.key(index)
    );
    for (const key of keys) {
      if (key?.startsWith(PREFIX) && !parse(readStorage(key))) {
        writeStorage(key, null);
      }
    }
  } catch {
    // Storage blocked: there are no drafts to prune.
  }
}
