import type { Id } from "@convex/_generated/dataModel";
import { CollisionPriority } from "@dnd-kit/abstract";
import { DragDropProvider, useDroppable } from "@dnd-kit/react";
import { EllipsisIcon, PlusIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useBoard } from "@/features/board/board-context";
import { Bucket } from "@/features/board/bucket";
import { SortableCardRow } from "@/features/board/card-tile";
import { AddButton } from "@/features/board/quick-add";
import { SprintDialog } from "@/features/board/sprint-dialog";
import { useCardDrag } from "@/features/board/use-card-drag";
import {
  createSprint,
  deleteSprint,
  moveCards,
  startSprint,
} from "@/lib/actions";
import type { Card, Sprint } from "@/lib/model";
import { activeSprint, isClosed } from "@/lib/model";
import { plural } from "@/lib/utils";

const BACKLOG = "backlog";

function sprintOf(group: string): Id<"sprints"> | undefined {
  return group === BACKLOG ? undefined : (group as Id<"sprints">);
}

interface DropBucketProps {
  id: string;
  title: string;
  cards: Card[];
  actions?: ReactNode;
}

function DropBucket({ id, title, cards, actions }: DropBucketProps) {
  const { canEdit, newCard } = useBoard();
  const { ref } = useDroppable({
    accept: "card",
    collisionPriority: CollisionPriority.Low,
    id,
    type: "bucket",
  });
  return (
    <Bucket actions={actions} count={cards.length} ref={ref} title={title}>
      {cards.map((card, index) => (
        <SortableCardRow card={card} group={id} index={index} key={card._id} />
      ))}
      {canEdit && (
        <AddButton
          label="Add card"
          onClick={() => newCard({ sprintId: sprintOf(id), status: "todo" })}
        />
      )}
    </Bucket>
  );
}

function SprintActions({
  sprint,
  onStart,
}: {
  sprint: Sprint;
  onStart?: () => void;
}) {
  const { board, content } = useBoard();
  const [dialog, setDialog] = useState<"edit" | "delete">();
  const count = content.cards.filter(
    (card) => card.sprintId === sprint._id
  ).length;

  return (
    <>
      {onStart && (
        <Button
          onClick={() => {
            startSprint(board, sprint);
            onStart();
          }}
          size="sm"
          variant="outline"
        >
          Start sprint
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              aria-label={`${sprint.title} options`}
              size="icon-sm"
              variant="ghost"
            />
          }
        >
          <EllipsisIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setDialog("edit")}>
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => setDialog("delete")}
            variant="destructive"
          >
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <SprintDialog
        onOpenChange={(open) => setDialog(open ? "edit" : undefined)}
        open={dialog === "edit"}
        sprint={sprint}
      />
      <AlertDialog
        onOpenChange={(open) => setDialog(open ? "delete" : undefined)}
        open={dialog === "delete"}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {sprint.title}?</AlertDialogTitle>
            <AlertDialogDescription>
              {count === 0
                ? "This can’t be undone."
                : `${plural(count, "card")} ${count === 1 ? "moves" : "move"} to the backlog.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteSprint(sprint)}
              variant="destructive"
            >
              Delete sprint
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function BacklogView({
  onSprintStarted,
}: {
  onSprintStarted: () => void;
}) {
  const { board, canEdit, content, cards } = useBoard();
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
  const drag = useCardDrag<string>(
    { ...Object.fromEntries(planned), [BACKLOG]: backlog },
    (moves) =>
      moveCards(
        moves.map(({ card, group, rank }) => ({
          card,
          rank,
          sprintId: sprintOf(group) ?? null,
        }))
      )
  );

  return (
    <DragDropProvider {...drag.props}>
      <div className="flex flex-col gap-3">
        {future.map((sprint) => (
          <DropBucket
            actions={
              canEdit && (
                <SprintActions
                  onStart={active ? undefined : onSprintStarted}
                  sprint={sprint}
                />
              )
            }
            cards={drag.groups[sprint._id] ?? []}
            id={sprint._id}
            key={sprint._id}
            title={sprint.title}
          />
        ))}
        <DropBucket
          actions={
            canEdit && (
              <Button
                className="text-muted-foreground"
                onClick={() => createSprint(board)}
                size="sm"
                variant="ghost"
              >
                <PlusIcon />
                New sprint
              </Button>
            )
          }
          cards={drag.groups[BACKLOG] ?? []}
          id={BACKLOG}
          title="Backlog"
        />
      </div>
    </DragDropProvider>
  );
}
