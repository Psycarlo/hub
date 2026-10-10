import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { OptimisticLocalStore } from "convex/browser";
import { toast } from "sonner";

import { convex } from "@/lib/convex";
import type {
  Board,
  BoardLabel,
  Card,
  CardDefaults,
  CardFields,
  Sprint,
  Status,
} from "@/lib/model";
import { sortLabels, statusKind } from "@/lib/model";
import type { Project } from "@/lib/project";
import { playSound } from "@/lib/sounds";
import type { Upload } from "@/lib/upload";
import { uploadAttachment } from "@/lib/upload";
import { errorMessage } from "@/lib/utils";

/** Runs a change and tells the person if it fails. Resolves with its result, or undefined. */
export async function run<T>(change: Promise<T>): Promise<T | undefined> {
  try {
    return await change;
  } catch (error) {
    playSound("error");
    toast.error(errorMessage(error));
    return undefined;
  }
}

export interface BoardDraft {
  projectId: Id<"projects">;
  code: string;
  title: string;
  description: string;
  statuses: Status[];
  usesSprints: boolean;
}

/** Labels changed in a board's settings: only those, so ones added meanwhile stay. */
export interface LabelChanges {
  changed: BoardLabel[];
  removed: string[];
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

function sortCards<T extends Card>(cards: T[]): T[] {
  return cards.toSorted(
    (a, b) => a.rank - b.rank || a._creationTime - b._creationTime
  );
}

/**
 * Shows a change to a board's cards at once, before the server confirms it.
 * Cards there may carry fields the app doesn't read, which a patch keeps.
 */
function patchCards(
  store: OptimisticLocalStore,
  boardId: Id<"boards">,
  patch: <T extends Card>(cards: T[]) => T[]
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

function applyChanges<T extends Card>(card: T, changes: CardChanges): T {
  const next: Record<string, unknown> = { ...card, updatedAt: Date.now() };
  for (const [key, value] of Object.entries(changes)) {
    next[key] = value ?? undefined;
  }
  return next as T;
}

export function createProject(draft: NewProjectDraft) {
  playSound("sparkle");
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
  playSound("whoosh");
  return run(convex.mutation(api.projects.remove, { projectId: project._id }));
}

export function createBoard(draft: BoardDraft) {
  playSound("sparkle");
  return run(convex.mutation(api.boards.create, draft));
}

export function updateBoard(
  board: Board,
  changes: Partial<BoardDraft> & {
    labels?: LabelChanges;
    cardDefaults?: CardDefaults;
  }
) {
  return run(
    convex.mutation(api.boards.update, { boardId: board._id, ...changes })
  );
}

/** Adds a label to the board, shown at once so cards can wear it right away. */
export function createLabel(board: Board, label: BoardLabel) {
  const query = { boardId: board._id };
  return run(
    convex.mutation(
      api.boards.addLabel,
      { ...query, label },
      {
        optimisticUpdate: (store) => {
          const content = store.getQuery(api.boards.content, query);
          if (content && !content.labels.some(({ id }) => id === label.id)) {
            store.setQuery(api.boards.content, query, {
              ...content,
              labels: sortLabels([...content.labels, label]),
            });
          }
        },
      }
    )
  );
}

export function deleteBoard(board: Board) {
  playSound("whoosh");
  return run(convex.mutation(api.boards.remove, { boardId: board._id }));
}

/** Adds a card, with any files uploaded for it attached. */
export function createCard(board: Board, card: NewCard, files: Upload[] = []) {
  playSound("pop");
  return run(
    convex.mutation(api.cards.create, {
      assignees: card.assignees ?? [],
      boardId: board._id,
      description: card.description ?? "",
      due: card.due,
      files,
      labels: card.labels ?? [],
      priority: card.priority,
      rank: card.rank,
      sprintId: card.sprintId,
      status: card.status,
      title: card.title,
    })
  );
}

/** Whether a card going to `status` from `from` is it being finished. */
function finishes(from: Card["status"], status?: Card["status"]): boolean {
  return (
    status !== undefined &&
    statusKind(status) === "completed" &&
    statusKind(from) !== "completed"
  );
}

export function updateCard(card: Card, changes: Partial<CardFields>) {
  if (finishes(card.status, changes.status)) {
    playSound("complete");
  }
  const args = { cardId: card._id, ...toChanges(changes) };
  // The board leaves descriptions out; the open card reads its own.
  const { description, ...fields } = changes;
  return run(
    convex.mutation(api.cards.update, args, {
      optimisticUpdate: (store) => {
        patchCards(store, card.boardId, (cards) =>
          cards.map((item) =>
            item._id === card._id ? applyChanges(item, toChanges(fields)) : item
          )
        );
        const query = { cardId: card._id };
        if (
          description !== undefined &&
          store.getQuery(api.cards.description, query) !== undefined
        ) {
          store.setQuery(api.cards.description, query, description);
        }
      },
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
  playSound(
    moves.some(({ card, status }) => finishes(card.status, status))
      ? "complete"
      : "drop"
  );
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
  playSound("whoosh");
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
  playSound("rise");
  return run(
    convex.mutation(api.sprints.start, {
      boardId: board._id,
      sprintId: sprint?._id,
    })
  );
}

export function endSprint(sprint: Sprint) {
  playSound("complete");
  return run(convex.mutation(api.sprints.end, { sprintId: sprint._id }));
}

export function deleteSprint(sprint: Sprint) {
  return run(convex.mutation(api.sprints.remove, { sprintId: sprint._id }));
}

export interface CommentDraft {
  content: string;
  files: Upload[];
  /** The comment it replies to. */
  parentId?: Id<"comments">;
}

export function addComment(card: Card, comment: CommentDraft) {
  playSound("swoosh");
  return run(
    convex.mutation(api.comments.add, { cardId: card._id, ...comment })
  );
}

export function deleteComment(commentId: Id<"comments">) {
  return run(convex.mutation(api.comments.remove, { commentId }));
}

/** Deletes an upload that won't be attached after all. */
export async function discardUpload(key: string): Promise<void> {
  try {
    await convex.mutation(api.attachments.discard, { key });
  } catch {
    // Quietly: nothing's lost if the file stays.
  }
}

async function uploadToCard(card: Card, file: File): Promise<void> {
  const upload = await uploadAttachment(file);
  try {
    await convex.mutation(api.attachments.add, {
      cardId: card._id,
      file: upload,
    });
  } catch (error) {
    // Not attached, so nothing would ever point at the upload.
    discardUpload(upload.key);
    throw error;
  }
}

/** Uploads a file and attaches it to the card. Resolves once it shows there, or failed. */
export async function attachFile(card: Card, file: File): Promise<void> {
  await run(uploadToCard(card, file));
}

export function removeAttachment(attachmentId: Id<"attachments">) {
  return run(convex.mutation(api.attachments.remove, { attachmentId }));
}
