import { useBoard } from "@/features/board/board-context";
import type { DoneWindow } from "@/features/board/display-options";
import { HiddenCards, outsideWindow } from "@/features/board/display-options";
import { Kanban } from "@/features/board/kanban";
import { CardList } from "@/features/board/list-view";
import type { Card, Sprint } from "@/lib/model";

interface StatusCardsProps {
  cards: Card[];
  /** The sprint the cards are in, which new cards join. */
  sprint?: Sprint;
}

/** Cards by status, in the board's layout: columns or a list. */
export function StatusCards({ cards, sprint }: StatusCardsProps) {
  const { layout } = useBoard();
  return layout === "list" ? (
    <CardList cards={cards} sprint={sprint} />
  ) : (
    <Kanban cards={cards} sprint={sprint} />
  );
}

interface BoardCardsProps {
  doneWindow: DoneWindow;
  onDoneWindowChange: (value: DoneWindow) => void;
}

/** Every card on a board without sprints, but those closed before the display options reach. */
export function BoardCards({
  doneWindow,
  onDoneWindowChange,
}: BoardCardsProps) {
  const { cards } = useBoard();
  const shown = cards.filter((card) => !outsideWindow(card, doneWindow));
  return (
    <>
      <StatusCards cards={shown} />
      <HiddenCards
        hidden={cards.length - shown.length}
        onChange={onDoneWindowChange}
        value={doneWindow}
      />
    </>
  );
}
