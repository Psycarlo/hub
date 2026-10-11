/** How changes to a card compare and combine, for its history and the news about it. */
import type { CardChange } from "./validators";

export function sameMembers(
  a: readonly string[],
  b: readonly string[]
): boolean {
  const members = new Set(a);
  return a.length === b.length && b.every((item) => members.has(item));
}

/** Whether the change leaves the card as it was, like a status set and set back. */
export function changesNothing(change: CardChange): boolean {
  switch (change.kind) {
    case "attachments": {
      return change.names.length === 0;
    }
    case "description": {
      return false;
    }
    case "assignees": {
      return sameMembers(change.from, change.to);
    }
    case "labels": {
      return sameMembers(
        change.from.map(({ id }) => id),
        change.to.map(({ id }) => id)
      );
    }
    case "sprint": {
      return change.from?.id === change.to?.id;
    }
    default: {
      return change.from === change.to;
    }
  }
}

/** The later change folded into the earlier one, when both are to the same thing. */
export function fold(
  earlier: CardChange,
  later: CardChange
): CardChange | undefined {
  if (earlier.kind !== later.kind) {
    return undefined;
  }
  // Each case reads `earlier` as the same kind of change as `later`, as checked above.
  switch (later.kind) {
    case "attachments": {
      const { names, removed } = earlier as typeof later;
      return removed === later.removed
        ? { ...later, names: [...names, ...later.names] }
        : undefined;
    }
    case "description": {
      return later;
    }
    default: {
      // From where the first change started to where the last one ended.
      return { ...later, from: (earlier as typeof later).from } as CardChange;
    }
  }
}
