import { cn } from "cn";
import { Settings2Icon } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { Redirect, useLocation, useSearchParams } from "wouter";

import { IconButton } from "@/components/icon-button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AssigneeFilter } from "@/features/board/assignee-filter";
import { BacklogView } from "@/features/board/backlog-view";
import type { BoardScope } from "@/features/board/board-context";
import {
  BoardContext,
  boardPath,
  cardPath,
} from "@/features/board/board-context";
import { DoneView } from "@/features/board/done-view";
import { BoardKanban } from "@/features/board/kanban";
import { SprintView } from "@/features/board/sprint-view";
import { BoardDialog } from "@/features/boards/board-dialog";
import { CardDialog } from "@/features/card/card-dialog";
import type { NewCardDefaults } from "@/features/card/new-card-dialog";
import { NewCardDialog } from "@/features/card/new-card-dialog";
import { useBoardContent } from "@/hooks/use-board-content";
import { useMe } from "@/hooks/use-users";
import type { Board, Card } from "@/lib/model";
import type { Project } from "@/lib/project";
import { canEdit, canManage } from "@/lib/project";

const TABS = ["backlog", "sprint", "done"] as const;
const DEFAULT_TAB = "sprint";

type Tab = (typeof TABS)[number];

function parseTab(value: string | null): Tab {
  return TABS.find((tab) => tab === value) ?? DEFAULT_TAB;
}

function tabQuery(tab: Tab): URLSearchParams {
  return new URLSearchParams(tab === DEFAULT_TAB ? {} : { tab });
}

// Keeps the last opened card so the dialog can animate out after it closes.
function useSelectedCard(cards: Card[] | undefined, cardNumber?: number) {
  const [lastCard, setLastCard] = useState<Card>();
  const selected =
    cardNumber === undefined
      ? undefined
      : cards?.find((card) => card.number === cardNumber);
  if (selected && selected !== lastCard) {
    setLastCard(selected);
  }
  return { selected, shown: selected ?? lastCard };
}

export function BoardSkeleton({ list = false }: { list?: boolean }) {
  if (list) {
    return (
      <div aria-busy className="flex flex-col gap-3">
        <Skeleton className="h-32 rounded-2xl" />
        <Skeleton className="h-48 rounded-2xl" />
      </div>
    );
  }
  return (
    <div aria-busy className="grid min-h-64 grow gap-3 sm:grid-cols-3">
      <Skeleton className="rounded-2xl" />
      <Skeleton className="rounded-2xl max-sm:hidden" />
      <Skeleton className="rounded-2xl max-sm:hidden" />
    </div>
  );
}

interface SprintTabsProps {
  tab: Tab;
  onTabChange: (tab: Tab) => void;
  /** Whether the board's cards have loaded. */
  ready: boolean;
  /** Shown beside the tabs. */
  actions: ReactNode;
}

/** Backlog, sprint and done, for a board that plans in sprints. */
function SprintTabs({ tab, onTabChange, ready, actions }: SprintTabsProps) {
  return (
    <Tabs
      className="min-h-0 grow gap-4"
      onValueChange={onTabChange}
      value={tab}
    >
      <div className="flex flex-wrap items-center gap-3">
        <TabsList>
          <TabsTrigger value="backlog">Backlog</TabsTrigger>
          <TabsTrigger value="sprint">Sprint</TabsTrigger>
          <TabsTrigger value="done">Done</TabsTrigger>
        </TabsList>
        {actions}
      </div>
      <TabsContent className="flex flex-col" value="backlog">
        {ready ? (
          <BacklogView onSprintStarted={() => onTabChange("sprint")} />
        ) : (
          <BoardSkeleton list />
        )}
      </TabsContent>
      <TabsContent className="flex min-h-0 flex-col" value="sprint">
        {ready ? <SprintView /> : <BoardSkeleton />}
      </TabsContent>
      <TabsContent className="flex flex-col" value="done">
        {ready ? <DoneView /> : <BoardSkeleton list />}
      </TabsContent>
    </Tabs>
  );
}

interface BoardPageProps {
  board: Board;
  project: Project;
  projects: Project[];
  cardNumber?: number;
}

export function BoardPage({
  board,
  project,
  projects,
  cardNumber,
}: BoardPageProps) {
  const me = useMe();
  const { content, loaded } = useBoardContent(board);
  const [params, setParams] = useSearchParams();
  const [, navigate] = useLocation();
  const [assignee, setAssignee] = useState<string>();
  const [editing, setEditing] = useState(false);
  // Kept after closing so the dialog keeps its content while it animates out.
  const [adding, setAdding] = useState<{
    open: boolean;
    defaults: NewCardDefaults;
  }>();

  const tab = parseTab(params.get("tab"));
  // A board without sprints has one view, so its links keep no tab.
  const query = board.usesSprints ? tabQuery(tab) : new URLSearchParams();
  const boardHref = boardPath(project, board, query);
  const { selected, shown: shownCard } = useSelectedCard(
    content?.cards,
    cardNumber
  );
  const people = project.members.map((member) => member.userId);

  const showTab = (value: Tab) => setParams(tabQuery(value));

  const closeCard = () => {
    if (history.state?.fromBoard) {
      history.back();
    } else {
      navigate(boardHref, { replace: true });
    }
  };

  const scope: BoardScope | null = content
    ? {
        board,
        canEdit: canEdit(project),
        cardHref: (card) => cardPath(project, board, card, query),
        cards: assignee
          ? content.cards.filter((card) =>
              card.assignees.some((person) => person === assignee)
            )
          : content.cards,
        content,
        me: me._id,
        newCard: (placement) =>
          setAdding({
            defaults: {
              ...placement,
              assignees: people.filter((person) => person === assignee),
            },
            open: true,
          }),
        people,
        project,
      }
    : null;
  const canChangeBoard = canManage(project) || board.createdBy === me._id;
  // The kanban fills the screen under the 3.5rem top bar, so its columns
  // scroll on their own and the page stays put. Lists scroll the page.
  const fitsScreen = !board.usesSprints || tab === "sprint";

  const actions = (
    <div className="ml-auto flex items-center gap-2">
      <AssigneeFilter
        members={people}
        onChange={setAssignee}
        value={assignee}
      />
      {canEdit(project) && canChangeBoard && (
        <IconButton label="Board settings" onClick={() => setEditing(true)}>
          <Settings2Icon />
        </IconButton>
      )}
    </div>
  );

  return (
    <BoardContext value={scope}>
      <main
        className={cn(
          "flex grow flex-col px-4 sm:px-6",
          fitsScreen ? "h-[calc(100dvh-3.5rem)] min-h-96 pb-4" : "pb-8"
        )}
      >
        {board.usesSprints ? (
          <SprintTabs
            actions={actions}
            onTabChange={showTab}
            ready={scope !== null}
            tab={tab}
          />
        ) : (
          <div className="flex min-h-0 grow flex-col gap-4">
            {actions}
            {scope ? <BoardKanban /> : <BoardSkeleton />}
          </div>
        )}
      </main>
      {scope && shownCard && (
        <CardDialog
          card={shownCard}
          onClose={closeCard}
          open={selected !== undefined}
        />
      )}
      {loaded && cardNumber !== undefined && !shownCard && (
        <Redirect replace to={boardHref} />
      )}
      {scope && adding && (
        <NewCardDialog
          defaults={adding.defaults}
          onOpenChange={(open) => setAdding({ ...adding, open })}
          open={adding.open}
        />
      )}
      <BoardDialog
        board={board}
        labels={content?.labels}
        onOpenChange={setEditing}
        open={editing}
        projects={projects}
      />
    </BoardContext>
  );
}
