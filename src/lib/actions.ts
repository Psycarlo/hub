import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { OptimisticLocalStore } from "convex/browser";
import { toast } from "sonner";

import { convex } from "@/lib/convex";
import type { Board, Card, CardFields, Sprint } from "@/lib/model";
import type { Project } from "@/lib/project";
import { errorMessage } from "@/lib/utils";

/** Runs a change and tells the person if it fails. Resolves with its result, or undefined. */
export async function run<T>(change: Promise<T>): Promise<T | undefined> {
  try {
    return await change;
  } catch (error) {
    toast.error(errorMessage(error));
    return undefined;
  }
}

export interface BoardDraft {
  projectId: Id<"projects">;
  code: string;
  title: string;
  description: string;
  usesSprints: boolean;
}

export interface ProjectDraft {
  title: string;
  slug: string;
  description: string;
  color: Project["color"];
  members: Project["members"];
}

export interface NewProjectDraft extends ProjectDraft {
  /** A board the project starts with. */
  board?: { code: string; title: string };
}

export type NewCard = Pick<CardFields, "title" | "status" | "rank"> &
  Partial<CardFields>;

/** Card changes as the server takes them: null clears an optional field. */
type CardChanges = Partial<{
  [K in keyof CardFields]: undefined extends CardFields[K]
    ? Exclude<CardFields[K], undefined> | null
    : CardFields[K];
}>;

function toChanges(changes: Partial<CardFields>): CardChanges {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(changes)) {
    result[key] = value === undefined ? null : value;
  }
  return result as CardChanges;
}

function sortCards(cards: Card[]): Card[] {
  return cards.toSorted(
    (a, b) => a.rank - b.rank || a._creationTime - b._creationTime
  );
}

/** Shows a change to a board's cards at once, before the server confirms it. */
function patchCards(
  store: OptimisticLocalStore,
  boardId: Id<"boards">,
  patch: (cards: Card[]) => Card[]
): void {
  const content = store.getQuery(api.boards.content, { boardId });
  if (content) {
    store.setQuery(
      api.boards.content,
      { boardId },
      { ...content, cards: sortCards(patch(content.cards)) }
    );
  }
}

function applyChanges(card: Card, changes: CardChanges): Card {
  const next: Record<string, unknown> = { ...card, updatedAt: Date.now() };
  for (const [key, value] of Object.entries(changes)) {
    next[key] = value ?? undefined;
  }
  return next as Card;
}

export function createProject(draft: NewProjectDraft) {
  return run(convex.mutation(api.projects.create, draft));
}

export function updateProject(
  project: Project,
  changes: Partial<ProjectDraft>
) {
  return run(
    convex.mutation(api.projects.update, {
      projectId: project._id,
      ...changes,
    })
  );
}

export function deleteProject(project: Project) {
  return run(convex.mutation(api.projects.remove, { projectId: project._id }));
}

export function createBoard(draft: BoardDraft) {
  return run(convex.mutation(api.boards.create, draft));
}

export function updateBoard(board: Board, changes: Partial<BoardDraft>) {
  return run(
    convex.mutation(api.boards.update, { boardId: board._id, ...changes })
  );
}

export function deleteBoard(board: Board) {
  return run(convex.mutation(api.boards.remove, { boardId: board._id }));
}

export function createCard(board: Board, card: NewCard) {
  return run(
    convex.mutation(api.cards.create, {
      assignees: card.assignees ?? [],
      boardId: board._id,
      description: card.description ?? "",
      due: card.due,
      labels: card.labels ?? [],
      priority: card.priority,
      rank: card.rank,
      sprintId: card.sprintId,
      status: card.status,
      title: card.title,
    })
  );
}

export function updateCard(card: Card, changes: Partial<CardFields>) {
  const args = { cardId: card._id, ...toChanges(changes) };
  return run(
    convex.mutation(api.cards.update, args, {
      optimisticUpdate: (store) =>
        patchCards(store, card.boardId, (cards) =>
          cards.map((item) =>
            item._id === card._id
              ? applyChanges(item, toChanges(changes))
              : item
          )
        ),
    })
  );
}

export interface CardMove {
  card: Card;
  rank: number;
  status?: Card["status"];
  /** The sprint it lands in, or null for the backlog. */
  sprintId?: Id<"sprints"> | null;
}

/** Cards dropped somewhere else on their board. */
export function moveCards(moves: CardMove[]) {
  const [first] = moves;
  if (!first) {
    return Promise.resolve();
  }
  const byId = new Map(moves.map((move) => [move.card._id, move]));
  return run(
    convex.mutation(
      api.cards.move,
      {
        moves: moves.map(({ card, rank, status, sprintId }) => ({
          cardId: card._id,
          rank,
          sprintId,
          status,
        })),
      },
      {
        optimisticUpdate: (store) =>
          patchCards(store, first.card.boardId, (cards) =>
            cards.map((item) => {
              const move = byId.get(item._id);
              if (!move) {
                return item;
              }
              return applyChanges(item, {
                rank: move.rank,
                ...(move.status === undefined ? {} : { status: move.status }),
                ...(move.sprintId === undefined
                  ? {}
                  : { sprintId: move.sprintId }),
              });
            })
          ),
      }
    )
  );
}

export function deleteCard(card: Card) {
  return run(
    convex.mutation(
      api.cards.remove,
      { cardId: card._id },
      {
        optimisticUpdate: (store) =>
          patchCards(store, card.boardId, (cards) =>
            cards.filter((item) => item._id !== card._id)
          ),
      }
    )
  );
}

export function createSprint(board: Board) {
  return run(convex.mutation(api.sprints.create, { boardId: board._id }));
}

export function updateSprint(
  sprint: Sprint,
  changes: { title?: string; start?: string | null; end?: string | null }
) {
  return run(
    convex.mutation(api.sprints.update, { sprintId: sprint._id, ...changes })
  );
}

export function startSprint(board: Board, sprint?: Sprint) {
  return run(
    convex.mutation(api.sprints.start, {
      boardId: board._id,
      sprintId: sprint?._id,
    })
  );
}

export function endSprint(sprint: Sprint) {
  return run(convex.mutation(api.sprints.end, { sprintId: sprint._id }));
}

export function deleteSprint(sprint: Sprint) {
  return run(convex.mutation(api.sprints.remove, { sprintId: sprint._id }));
}

export function addComment(card: Card, content: string) {
  return run(convex.mutation(api.comments.add, { cardId: card._id, content }));
}

export function deleteComment(commentId: Id<"comments">) {
  return run(convex.mutation(api.comments.remove, { commentId }));
}
