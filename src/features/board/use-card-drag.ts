import { move } from "@dnd-kit/helpers";
import type {
  DragEndEvent,
  DragMoveEvent,
  DragOverEvent,
  DragStartEvent,
} from "@dnd-kit/react";
import { KeyboardSensor, PointerSensor } from "@dnd-kit/react";
import { useEffect, useMemo, useRef, useState } from "react";

import { createDragTilt } from "@/features/board/drag-tilt";
import type { Card } from "@/lib/model";
import { rankBetween } from "@/lib/model";

/** Anything ordered by rank within a group: cards, CRM records. */
interface Ranked {
  _id: string;
  rank: number;
}

export interface CardMove<K extends string, T extends Ranked = Card> {
  card: T;
  group: K;
  rank: number;
}

type Groups<K extends string, T> = Record<K, T[]>;

// Enter follows the card link, so only Space picks a card up.
const SENSORS = [
  PointerSensor,
  KeyboardSensor.configure({
    keyboardCodes: {
      ...KeyboardSensor.defaults.keyboardCodes,
      start: ["Space"],
    },
  }),
];

function rerank<K extends string, T extends Ranked>(
  cards: T[],
  index: number,
  group: K
): CardMove<K, T>[] {
  const card = cards[index];
  if (!card) {
    return [];
  }
  const before = cards[index - 1]?.rank;
  const after = cards[index + 1]?.rank;
  const rank = rankBetween(before, after);
  if (
    (before === undefined || before < rank) &&
    (after === undefined || rank < after)
  ) {
    return [{ card, group, rank }];
  }
  // Tied or exhausted ranks leave no room in between, so space the group out again.
  return cards.flatMap((item, position) =>
    item === card || item.rank !== position + 1
      ? [{ card: item, group, rank: position + 1 }]
      : []
  );
}

/** Each group as the ids of its items, the shape dnd-kit's `move` rearranges. */
type IdGroups<K extends string> = Record<K, string[]>;

function idsOf<K extends string, T extends Ranked>(
  groups: Groups<K, T>
): IdGroups<K> {
  const ids = {} as IdGroups<K>;
  for (const group of Object.keys(groups) as K[]) {
    ids[group] = groups[group].map((item) => item._id);
  }
  return ids;
}

/**
 * Keeps a local copy of the groups while dragging and reports the new ranks on
 * drop. A card dragged by pointer tilts with its movement.
 */
export function useCardDrag<K extends string, T extends Ranked = Card>(
  groups: Groups<K, T>,
  onMove: (moves: CardMove<K, T>[]) => void
) {
  const [dragIds, setDragIds] = useState<IdGroups<K> | null>(null);
  const latest = useRef<IdGroups<K> | null>(null);
  const tilt = useMemo(() => createDragTilt(), []);
  const byId = new Map(
    Object.values<T[]>(groups)
      .flat()
      .map((item) => [item._id, item])
  );

  // The items in the order the drag left them; ones gone meanwhile drop out.
  const resolve = (ids: IdGroups<K>): Groups<K, T> => {
    const resolved = {} as Groups<K, T>;
    for (const group of Object.keys(groups) as K[]) {
      resolved[group] = (ids[group] ?? []).flatMap((id) => {
        const item = byId.get(id);
        return item ? [item] : [];
      });
    }
    return resolved;
  };

  useEffect(() => tilt.stop, [tilt]);

  const update = (next: IdGroups<K> | null) => {
    latest.current = next;
    setDragIds(next);
  };

  const start = (event: DragStartEvent) => {
    update(idsOf(groups));
    const { activatorEvent, position, source } = event.operation;
    if (!(activatorEvent instanceof KeyboardEvent)) {
      tilt.start(source?.element, position.current);
    }
  };

  const drop = (event: DragEndEvent) => {
    tilt.stop();
    const final = latest.current ? resolve(latest.current) : null;
    update(null);
    const id = event.operation.source?.id;
    if (event.canceled || !final || id === undefined) {
      return;
    }
    for (const group of Object.keys(final) as K[]) {
      const index = final[group].findIndex((card) => card._id === id);
      if (index !== -1) {
        if (groups[group][index]?._id !== id) {
          onMove(rerank(final[group], index, group));
        }
        return;
      }
    }
  };

  return {
    groups: dragIds ? resolve(dragIds) : groups,
    props: {
      onDragEnd: drop,
      onDragMove: ({ operation }: DragMoveEvent) =>
        tilt.move(operation.source?.element, operation.position.current),
      onDragOver: (event: DragOverEvent) =>
        update(move(latest.current ?? idsOf(groups), event) as IdGroups<K>),
      onDragStart: start,
      sensors: SENSORS,
    },
  };
}
