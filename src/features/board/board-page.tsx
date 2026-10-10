import { cn } from "cn";
import { Settings2Icon, SquareKanbanIcon } from "lucide-react";
import type { ReactNode } from "react";
import {
  Activity,
  use,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Redirect, useLocation, useSearchParams } from "wouter";

import { IconButton } from "@/components/icon-button";
import { ProjectAvatar } from "@/components/project-avatar";
import type { Crumb } from "@/components/top-bar";
import { TopBar } from "@/components/top-bar";
import { FluidTooltip } from "@/components/ui/fluid-tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AssigneeFilter } from "@/features/board/assignee-filter";
import { BacklogView } from "@/features/board/backlog-view";
import { BoardCards } from "@/features/board/board-cards";
import type { BoardScope } from "@/features/board/board-context";
import {
  BoardContext,
  boardPath,
  cardPath,
} from "@/features/board/board-context";
import type { CardView } from "@/features/board/card-order";
import {
  cardNeighbours,
  cardOrder,
  groupedByStatus,
} from "@/features/board/card-order";
import { outsideWindow, useDoneWindow } from "@/features/board/display-options";
import { DoneView } from "@/features/board/done-view";
import type { BoardLayout } from "@/features/board/layout-switch";
import { LayoutSwitch, useBoardLayout } from "@/features/board/layout-switch";
import { SprintView } from "@/features/board/sprint-view";
import { BoardDialog } from "@/features/boards/board-dialog";
import { CardPage, CardPageSkeleton } from "@/features/card/card-page";
import type { NewCardDefaults } from "@/features/card/new-card-dialog";
import { NewCardDialog } from "@/features/card/new-card-dialog";
import { useBoardContent } from "@/hooks/use-board-content";
import { useWarmDescription } from "@/hooks/use-card-description";
import { useMe } from "@/hooks/use-users";
import type { Board, Card } from "@/lib/model";
import type { Project } from "@/lib/project";
import { canEdit, canManage, projectPath } from "@/lib/project";

const TABS = ["backlog", "sprint", "done"] as const;
const DEFAULT_TAB = "sprint";

type Tab = (typeof TABS)[number];

function parseTab(value: string | null): Tab {
  return TABS.find((tab) => tab === value) ?? DEFAULT_TAB;
}

function tabQuery(tab: Tab): URLSearchParams {
  return new URLSearchParams(tab === DEFAULT_TAB ? {} : { tab });
}

/** The way to a board, which links back to it while one of its cards is open. */
export function boardCrumbs(
  label: string,
  project?: Project,
  href?: string
): Crumb[] {
  const crumb: Crumb = {
    href,
    icon: (
      <SquareKanbanIcon className="text-muted-foreground size-4 shrink-0" />
    ),
    label,
  };
  return project
    ? [
        {
          href: projectPath(project),
          icon: <ProjectAvatar project={project} />,
          label: project.title,
        },
        crumb,
      ]
    : [crumb];
}

/**
 * A card opens at its top, and leaving it scrolls back to where the board was
 * left: the board stays mounted under the card, but the page scroll is shared.
 */
function useBoardScroll(cardNumber?: number) {
  const open = useRef(cardNumber !== undefined);
  const boardScroll = useRef(0);
  useEffect(() => {
    const save = () => {
      if (!open.current) {
        boardScroll.current = window.scrollY;
      }
    };
    window.addEventListener("scroll", save, { passive: true });
    return () => window.removeEventListener("scroll", save);
  }, []);
  useLayoutEffect(() => {
    open.current = cardNumber !== undefined;
    window.scrollTo(0, open.current ? 0 : boardScroll.current);
  }, [cardNumber]);
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
  layout: BoardLayout;
  /** Shown beside the tabs. */
  actions: ReactNode;
}

/** Backlog, sprint and done, for a board that plans in sprints. */
function SprintTabs({
  tab,
  onTabChange,
  ready,
  layout,
  actions,
}: SprintTabsProps) {
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
        {ready ? <SprintView /> : <BoardSkeleton list={layout === "list"} />}
      </TabsContent>
      <TabsContent className="flex flex-col" value="done">
        {ready ? <DoneView /> : <BoardSkeleton list />}
      </TabsContent>
    </Tabs>
  );
}

interface OpenCardProps {
  board: Board;
  number: number;
  crumbs: Crumb[];
  boardHref: string;
  /** The tab the card was opened from, which its previous and next follow. */
  tab: Tab;
  /** Whether the board's cards have loaded. */
  loaded: boolean;
  onLeave: () => void;
}

/**
 * The cards either side of one, as the view it was opened from lists them.
 * A card that view leaves out, like one opened from the inbox, steps through
 * the whole board instead.
 */
function useNeighbours(board: Board, tab: Tab, card: Card | undefined) {
  const scope = use(BoardContext);
  // A board without sprints has the one view.
  const view: CardView = board.usesSprints ? tab : "board";
  // Read as the card opens, so it matches the board just left.
  const [doneWindow] = useDoneWindow(board);
  if (!(scope && card)) {
    return {};
  }
  const shown =
    view === "board"
      ? scope.cards.filter((item) => !outsideWindow(item, doneWindow))
      : scope.cards;
  return (
    cardNeighbours(card, cardOrder(view, scope.content, shown)) ??
    cardNeighbours(card, groupedByStatus(scope.content.cards)) ??
    {}
  );
}

/** The card a link points at, or back to the board once it turns out to be gone. */
function OpenCard({
  board,
  number,
  crumbs,
  boardHref,
  tab,
  loaded,
  onLeave,
}: OpenCardProps) {
  const scope = use(BoardContext);
  const card = scope?.content.cards.find((item) => item.number === number);
  const { previous, next } = useNeighbours(board, tab, card);
  // Stepping with K and J shows the next description at once.
  useWarmDescription(previous);
  useWarmDescription(next);
  if (scope && card) {
    return (
      <CardPage
        card={card}
        crumbs={crumbs}
        key={card._id}
        nextHref={next && scope.cardHref(next)}
        onLeave={onLeave}
        previousHref={previous && scope.cardHref(previous)}
      />
    );
  }
  return loaded ? (
    <Redirect replace to={boardHref} />
  ) : (
    <CardPageSkeleton crumbs={crumbs} />
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
  const [layout, setLayout] = useBoardLayout(board);
  // Kept after closing so the dialog keeps its content while it animates out.
  const [adding, setAdding] = useState<{
    open: boolean;
    defaults: NewCardDefaults;
  }>();

  const tab = parseTab(params.get("tab"));
  // A board without sprints has one view, so its links keep no tab.
  const query = board.usesSprints ? tabQuery(tab) : new URLSearchParams();
  const boardHref = boardPath(project, board, query);
  const cardOpen = cardNumber !== undefined;
  const crumbs = boardCrumbs(
    board.title,
    project,
    cardOpen ? boardHref : undefined
  );
  const people = project.members.map((member) => member.userId);
  useBoardScroll(cardNumber);

  const showTab = (value: Tab) => setParams(tabQuery(value));

  const leaveCard = () => {
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
        layout,
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
  // Where the cards show by status, in the board's layout; the backlog and
  // done tabs are lists of their own.
  const byStatus = !board.usesSprints || tab === "sprint";
  // The kanban fills the screen under the 3.5rem top bar, so its columns
  // scroll on their own and the page stays put. Lists scroll the page.
  const fitsScreen = byStatus && layout === "kanban";

  const actions = (
    <div className="ml-auto flex items-center gap-2">
      <AssigneeFilter
        members={people}
        onChange={setAssignee}
        value={assignee}
      />
      <FluidTooltip.Group>
        {byStatus && <LayoutSwitch onChange={setLayout} value={layout} />}
        {canEdit(project) && canChangeBoard && (
          <IconButton label="Board settings" onClick={() => setEditing(true)}>
            <Settings2Icon />
          </IconButton>
        )}
      </FluidTooltip.Group>
    </div>
  );

  return (
    <BoardContext value={scope}>
      {!cardOpen && <TopBar crumbs={crumbs} />}
      {/* Kept under an open card, so leaving it finds the board as it was. */}
      <Activity mode={cardOpen ? "hidden" : "visible"}>
        <main
          className={cn(
            "flex grow flex-col px-4 sm:px-6",
            fitsScreen ? "h-[calc(100dvh-3.5rem)] min-h-96 pb-4" : "pb-8"
          )}
        >
          {board.usesSprints ? (
            <SprintTabs
              actions={actions}
              layout={layout}
              onTabChange={showTab}
              ready={scope !== null}
              tab={tab}
            />
          ) : (
            <div className="flex min-h-0 grow flex-col gap-4">
              {actions}
              {scope ? (
                <BoardCards />
              ) : (
                <BoardSkeleton list={layout === "list"} />
              )}
            </div>
          )}
        </main>
      </Activity>
      {cardNumber !== undefined && (
        <OpenCard
          board={board}
          boardHref={boardHref}
          crumbs={crumbs}
          loaded={loaded}
          number={cardNumber}
          onLeave={leaveCard}
          tab={tab}
        />
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
