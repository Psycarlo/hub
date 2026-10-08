import { useRef, useState } from "react";

import { readDraft, writeDraft } from "@/lib/drafts";

export interface StoredDraft<T> {
  draft: T;
  /** Whether it opened with a draft left from before. */
  restored: boolean;
  change: (changes: Partial<T>) => void;
  /** Back to blank, and the kept draft forgotten. */
  discard: () => void;
}

/**
 * Writing kept in this browser as it changes, so closing or reloading before
 * it's sent doesn't lose it. A draft that `isBlank` isn't kept. The key is
 * read once: give the component a `key` to switch to another.
 */
export function useStoredDraft<T extends object>(
  key: string,
  blank: T,
  isBlank: (draft: T) => boolean
): StoredDraft<T> {
  // oxlint-disable-next-line react/hook-use-state -- read once, never set
  const [opened] = useState(() => {
    const kept = readDraft(key, blank);
    return kept && !isBlank(kept) ? kept : undefined;
  });
  const [draft, setDraft] = useState(opened ?? blank);
  // Changes can come before the next render, like an editor's on unmount.
  const latest = useRef(draft);

  const keep = (next: T) => {
    latest.current = next;
    writeDraft(key, isBlank(next) ? null : next);
    setDraft(next);
  };

  return {
    change: (changes) => keep({ ...latest.current, ...changes }),
    discard: () => keep(blank),
    draft,
    restored: opened !== undefined,
  };
}
