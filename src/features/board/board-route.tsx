import { Link, Redirect, useLocation, useSearch } from "wouter";

import { TopBar } from "@/components/top-bar";
import { buttonVariants } from "@/components/ui/button";
import { Empty, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { boardPath, cardPath } from "@/features/board/board-context";
import {
  BoardPage,
  BoardSkeleton,
  boardCrumbs,
} from "@/features/board/board-page";
import type { Board } from "@/lib/model";
import type { Project } from "@/lib/project";

// Up to 10 characters: boards made before the 7-character cap keep their codes.
const SLUG = /^(?<code>[A-Z][A-Z0-9]{0,9})(?:-(?<number>\d+))?$/u;

/** The board a code points at, also by a code it had before. Codes are unique across the hub. */
export function findBoard(boards: Board[], code: string): Board | undefined {
  return (
    boards.find((board) => board.code === code) ??
    boards.find((board) => board.formerCodes?.includes(code))
  );
}

/** Splits a path segment like `HUB-12` into the board code and card number. */
export function parseSlug(
  value: string
): { code: string; number?: number } | undefined {
  const groups = SLUG.exec(value.toUpperCase())?.groups;
  if (!groups?.code) {
    return undefined;
  }
  return {
    code: groups.code,
    number: groups.number ? Number(groups.number) : undefined,
  };
}

interface BoardRouteProps {
  /** The `HUB` or `HUB-12` part of the link. */
  slug: string;
  boards: Board[];
  projects: Project[];
  /** Whether boards and projects have loaded. */
  loaded: boolean;
}

/**
 * A board, or a card open on it. Short links like `/HUB-12`, old codes and
 * boards since moved all land on the board's path in its project now.
 */
export function BoardRoute({
  slug,
  boards,
  projects,
  loaded,
}: BoardRouteProps) {
  const [location] = useLocation();
  const search = useSearch();
  const parsed = parseSlug(slug);
  if (!parsed) {
    return <Redirect replace to="/" />;
  }
  const board = findBoard(boards, parsed.code);
  const project = projects.find((item) => item._id === board?.projectId);

  if (board && project) {
    const path =
      parsed.number === undefined
        ? boardPath(project, board)
        : cardPath(project, board, { number: parsed.number });
    if (location !== path) {
      return <Redirect replace to={search ? `${path}?${search}` : path} />;
    }
    return (
      <BoardPage
        board={board}
        cardNumber={parsed.number}
        key={board._id}
        project={project}
        projects={projects}
      />
    );
  }
  return (
    <>
      <TopBar crumbs={boardCrumbs(parsed.code)} />
      {loaded ? (
        <Empty>
          <EmptyTitle>Board not found</EmptyTitle>
          <Link className={buttonVariants({ variant: "outline" })} href="/">
            Home
          </Link>
        </Empty>
      ) : (
        <main aria-busy className="flex grow flex-col gap-4 px-4 pb-8 sm:px-6">
          <Skeleton className="h-9 w-64 rounded-full" />
          <BoardSkeleton />
        </main>
      )}
    </>
  );
}
