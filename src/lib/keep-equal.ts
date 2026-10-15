function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

/** Which item of a list one is: a document by its `_id`, anything else by its place. */
function keyOf(item: unknown, index: number): unknown {
  return isRecord(item) && typeof item._id === "string" ? item._id : index;
}

/**
 * `next`, but reusing whatever part of `previous` it equals, so what didn't
 * change keeps its identity and memoized components skip it. A live query
 * hands back all new objects on every change, even for one field of one card.
 * Lists match documents by `_id`, so a card that moved is still the same card.
 */
export function keepEqual<T>(previous: unknown, next: T): T {
  if (Object.is(previous, next)) {
    return next;
  }
  if (Array.isArray(previous) && Array.isArray(next)) {
    const before = new Map(
      previous.map((item, index) => [keyOf(item, index), item])
    );
    let same = previous.length === next.length;
    const kept = next.map((item: unknown, index) => {
      const match = keepEqual(before.get(keyOf(item, index)), item);
      same &&= match === previous[index];
      return match;
    });
    return (same ? previous : kept) as T;
  }
  if (isRecord(previous) && isRecord(next)) {
    const keys = Object.keys(next);
    let same = keys.length === Object.keys(previous).length;
    const kept: Record<string, unknown> = {};
    for (const key of keys) {
      kept[key] = keepEqual(previous[key], next[key]);
      same &&= Object.hasOwn(previous, key) && kept[key] === previous[key];
    }
    return (same ? previous : kept) as T;
  }
  return next;
}
