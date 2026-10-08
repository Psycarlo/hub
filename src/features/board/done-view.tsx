import { Empty, EmptyTitle } from "@/components/ui/empty";
import { useBoard } from "@/features/board/board-context";
import { Bucket } from "@/features/board/bucket";
import { CardRow } from "@/features/board/card-tile";
import { activeSprint, isClosed } from "@/lib/model";

export function DoneView() {
  const { content, cards } = useBoard();
  const active = activeSprint(content);
  const done = cards
    .filter(
      (card) =>
        isClosed(card.status) && !(active && card.sprintId === active._id)
    )
    .toSorted((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0));

  if (done.length === 0) {
    return (
      <Empty>
        <EmptyTitle>Nothing done yet</EmptyTitle>
      </Empty>
    );
  }

  const sprints = content.sprints
    .filter((sprint) => sprint !== active)
    .toReversed();
  const known = new Set<string>(sprints.map((sprint) => sprint._id));
  const groups = [
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

  return (
    <div className="flex flex-col gap-3">
      {groups.map((group) => (
        <Bucket count={group.cards.length} key={group.id} title={group.title}>
          {group.cards.map((card) => (
            <CardRow card={card} key={card._id} />
          ))}
        </Bucket>
      ))}
    </div>
  );
}
