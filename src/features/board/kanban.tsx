import { CollisionPriority } from "@dnd-kit/abstract";
import { DragDropProvider, useDroppable } from "@dnd-kit/react";

import { useBoard } from "@/features/board/board-context";
import { CardTile } from "@/features/board/card-tile";
import {
  HiddenCards,
  outsideWindow,
  useDoneWindow,
} from "@/features/board/display-options";
import { AddButton } from "@/features/board/quick-add";
import { useCardDrag } from "@/features/board/use-card-drag";
import { moveCards } from "@/lib/actions";
import type { Card, Sprint, Status } from "@/lib/model";
import { STATUSES } from "@/lib/model";

interface ColumnProps {
  status: Status;
  label: string;
  cards: Card[];
  onAdd?: () => void;
}

function Column({ status, label, cards, onAdd }: ColumnProps) {
  const { ref } = useDroppable({
    accept: "card",
    collisionPriority: CollisionPriority.Low,
    id: status,
    type: "column",
  });
  return (
    <section
      className="bg-muted/60 flex flex-col gap-2 rounded-2xl p-2"
      ref={ref}
    >
      <h3 className="flex h-8 items-center gap-2 px-1.5 text-sm font-medium">
        {label}
        <span className="text-muted-foreground tabular-nums">
          {cards.length}
        </span>
      </h3>
      {cards.map((card, index) => (
        <CardTile card={card} group={status} index={index} key={card._id} />
      ))}
      {onAdd && <AddButton label="Add card" onClick={onAdd} />}
    </section>
  );
}

interface KanbanProps {
  cards: Card[];
  /** The sprint the cards are in, which new cards join. */
  sprint?: Sprint;
}

/** Cards in a column per status. */
export function Kanban({ cards, sprint }: KanbanProps) {
  const { canEdit, newCard } = useBoard();
  const columns: Record<Status, Card[]> = { done: [], progress: [], todo: [] };
  for (const card of cards) {
    columns[card.status].push(card);
  }
  const drag = useCardDrag(columns, (moves) =>
    moveCards(
      moves.map(({ card, group, rank }) => ({ card, rank, status: group }))
    )
  );

  return (
    <DragDropProvider {...drag.props}>
      <div className="-mx-4 grid grow auto-cols-[minmax(17rem,1fr)] grid-flow-col gap-3 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6">
        {STATUSES.map(({ id, label }) => (
          <Column
            cards={drag.groups[id]}
            key={id}
            label={label}
            onAdd={
              canEdit && id !== "done"
                ? () => newCard({ sprintId: sprint?._id, status: id })
                : undefined
            }
            status={id}
          />
        ))}
      </div>
    </DragDropProvider>
  );
}

/** Every card on a board without sprints, but those done before the display options reach. */
export function BoardKanban() {
  const { board, cards } = useBoard();
  const [doneWindow, setDoneWindow] = useDoneWindow(board);
  const shown = cards.filter((card) => !outsideWindow(card, doneWindow));
  return (
    <>
      <Kanban cards={shown} />
      <HiddenCards
        hidden={cards.length - shown.length}
        onChange={setDoneWindow}
        value={doneWindow}
      />
    </>
  );
}
