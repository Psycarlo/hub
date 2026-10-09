import type { BoardContent, Card } from "@/lib/model";
import { activeSprint, isClosed, STATUSES } from "@/lib/model";

/** Where a card was opened from: a board's own view, or one of its sprint tabs. */
export type CardView = "board" | "backlog" | "sprint" | "done";

/** Cards a status at a time, in the order the statuses come, as columns and lists show them. */
export function groupedByStatus(cards: Card[]): Card[] {
  return STATUSES.flatMap(({ id }) =>
    cards.filter((card) => card.status === id)
  );
}

/** The open cards outside the active sprint: each future sprint's, then the rest. */
export function backlogGroups(content: BoardContent, cards: Card[]) {
  const active = activeSprint(content);
  const future = content.sprints.filter((sprint) => sprint.status === "future");
  const planned = new Map(
    future.map((sprint): [string, Card[]] => [sprint._id, []])
  );
  const backlog: Card[] = [];
  for (const card of cards) {
    if (!isClosed(card.status) && !(active && card.sprintId === active._id)) {
      const bucket = card.sprintId ? planned.get(card.sprintId) : undefined;
      (bucket ?? backlog).push(card);
    }
  }
  return { active, backlog, future, planned };
}

interface DoneGroup {
  id: string;
  title: string;
  cards: Card[];
}

/** Closed cards outside the active sprint, latest sprint first and latest closed first. */
export function doneGroups(content: BoardContent, cards: Card[]): DoneGroup[] {
  const active = activeSprint(content);
  const done = cards
    .filter(
      (card) =>
        isClosed(card.status) && !(active && card.sprintId === active._id)
    )
    .toSorted((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0));
  const sprints = content.sprints
    .filter((sprint) => sprint !== active)
    .toReversed();
  const known = new Set<string>(sprints.map((sprint) => sprint._id));
  return [
    ...sprints.map((sprint) => ({
      cards: done.filter((card) => card.sprintId === sprint._id),
      id: sprint._id as string,
      title: sprint.title,
    })),
    {
      cards: done.filter(
        (card) => !(card.sprintId && known.has(card.sprintId))
      ),
      id: "none",
      title: "No sprint",
    },
  ].filter((group) => group.cards.length > 0);
}

/** The cards in the order a view lists them, top to bottom and column by column. */
export function cardOrder(
  view: CardView,
  content: BoardContent,
  cards: Card[]
): Card[] {
  switch (view) {
    case "board": {
      return groupedByStatus(cards);
    }
    case "sprint": {
      const sprint = activeSprint(content);
      return sprint
        ? groupedByStatus(cards.filter((card) => card.sprintId === sprint._id))
        : [];
    }
    case "backlog": {
      const { backlog, future, planned } = backlogGroups(content, cards);
      return [
        ...future.flatMap((sprint) => planned.get(sprint._id) ?? []),
        ...backlog,
      ];
    }
    case "done": {
      return doneGroups(content, cards).flatMap((group) => group.cards);
    }
    default: {
      return [];
    }
  }
}

/** The cards either side of one in an order, unless the order leaves it out. */
export function cardNeighbours(
  card: Card,
  order: Card[]
): { previous?: Card; next?: Card } | undefined {
  const index = order.findIndex((item) => item._id === card._id);
  if (index === -1) {
    return undefined;
  }
  return { next: order[index + 1], previous: order[index - 1] };
}
