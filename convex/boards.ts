import { ConvexError, v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import type { ProjectAccess } from "./lib/access";
import {
  ifVisible,
  requireBoard,
  requireProject,
  requireUser,
  visibleProjects,
} from "./lib/access";
import { vBoardLabel } from "./lib/validators";
import type { BoardLabel, Status } from "./shared/model";
import {
  canManageRole,
  codeProblem,
  isClosed,
  LABEL_ID,
  labelKey,
  legacyLabels,
  MAX_LABEL_NAME,
  MAX_LABELS,
  sortLabels,
  STATUSES,
} from "./shared/model";

const MAX_TITLE = 80;
const MAX_DESCRIPTION = 500;

export type BoardView = Pick<
  Doc<"boards">,
  | "_id"
  | "_creationTime"
  | "projectId"
  | "code"
  | "formerCodes"
  | "title"
  | "description"
  | "createdBy"
  | "usesSprints"
>;

function toView(board: Doc<"boards">): BoardView {
  return {
    _creationTime: board._creationTime,
    _id: board._id,
    code: board.code,
    createdBy: board.createdBy,
    description: board.description,
    formerCodes: board.formerCodes,
    projectId: board.projectId,
    title: board.title,
    usesSprints: board.usesSprints,
  };
}

/** Boards in every project the signed-in person can see. */
export const list = query({
  args: {},
  handler: async (ctx): Promise<BoardView[]> => {
    const user = await requireUser(ctx);
    const projects = await visibleProjects(ctx, user);
    const boards = await Promise.all(
      projects.map(({ project }) =>
        ctx.db
          .query("boards")
          .withIndex("by_project", (q) => q.eq("projectId", project._id))
          .collect()
      )
    );
    return boards
      .flat()
      .map(toView)
      .toSorted(
        (a, b) => a.title.localeCompare(b.title) || a._id.localeCompare(b._id)
      );
  },
});

/** Every board code in use, also on projects the person isn't on, since links share them. */
export const codes = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    const boards = await ctx.db.query("boards").collect();
    return boards.map((board) => ({
      _id: board._id,
      code: board.code,
      formerCodes: board.formerCodes ?? [],
    }));
  },
});

/** Cards, sprints and labels of a board. */
export const content = query({
  args: { boardId: v.id("boards") },
  handler: async (ctx, { boardId }) => {
    const access = await ifVisible(requireBoard(ctx, boardId, "view"));
    if (!access) {
      return null;
    }
    const { board } = access;
    const [cards, sprints] = await Promise.all([
      ctx.db
        .query("cards")
        .withIndex("by_board", (q) => q.eq("boardId", boardId))
        .collect(),
      ctx.db
        .query("sprints")
        .withIndex("by_board", (q) => q.eq("boardId", boardId))
        .collect(),
    ]);
    return {
      cards: cards.toSorted(
        (a, b) => a.rank - b.rank || a._creationTime - b._creationTime
      ),
      labels: sortLabels(board.labels ?? legacyLabels(cards)),
      nextCardNumber: board.nextCardNumber,
      nextSprintNumber: board.nextSprintNumber,
      sprints: sprints.toSorted((a, b) => a.number - b.number),
    };
  },
});

export interface BoardProgress {
  boardId: Id<"boards">;
  /** Cards not closed yet, backlog included. */
  open: number;
  /** The sprint under way, with how its cards stand. Only on boards that use sprints. */
  sprint?: Pick<Doc<"sprints">, "title" | "end"> & Record<Status, number>;
}

/** The sprint under way on a board that uses sprints: the latest, should more than one be. */
async function sprintUnderWay(
  ctx: QueryCtx,
  board: Doc<"boards">
): Promise<Doc<"sprints"> | undefined> {
  if (!board.usesSprints) {
    return undefined;
  }
  const sprints = await ctx.db
    .query("sprints")
    .withIndex("by_board", (q) => q.eq("boardId", board._id))
    .collect();
  return sprints
    .filter((sprint) => sprint.status === "active")
    .toSorted((a, b) => a.number - b.number)
    .at(-1);
}

/** How each board of a project stands: cards still open, and the sprint under way. */
export const progress = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }): Promise<BoardProgress[]> => {
    if (!(await ifVisible(requireProject(ctx, projectId, "view")))) {
      return [];
    }
    const boards = await ctx.db
      .query("boards")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .collect();
    return await Promise.all(
      boards.map(async (board) => {
        const [cards, active] = await Promise.all([
          ctx.db
            .query("cards")
            .withIndex("by_board", (q) => q.eq("boardId", board._id))
            .collect(),
          sprintUnderWay(ctx, board),
        ]);
        const counts = Object.fromEntries(
          STATUSES.map(({ id }) => [id, 0])
        ) as Record<Status, number>;
        for (const card of cards) {
          if (active && card.sprintId === active._id) {
            counts[card.status] += 1;
          }
        }
        return {
          boardId: board._id,
          open: cards.filter((card) => !isClosed(card.status)).length,
          sprint: active && { end: active.end, title: active.title, ...counts },
        };
      })
    );
  },
});

function cleanTitle(title: string): string {
  const trimmed = title.trim().slice(0, MAX_TITLE);
  if (!trimmed) {
    throw new ConvexError("Give the board a name.");
  }
  return trimmed;
}

async function freeCode(
  ctx: QueryCtx,
  raw: string,
  except?: Id<"boards">
): Promise<string> {
  const code = raw.trim().toUpperCase();
  const problem = codeProblem(code);
  if (problem) {
    throw new ConvexError(problem);
  }
  const taken = await ctx.db
    .query("boards")
    .withIndex("by_code", (q) => q.eq("code", code))
    .first();
  if (taken && taken._id !== except) {
    throw new ConvexError("Another board uses this code.");
  }
  // Few boards, so a scan beats keeping an index of old codes.
  const boards = await ctx.db.query("boards").collect();
  if (
    boards.some(
      (board) => board._id !== except && board.formerCodes?.includes(code)
    )
  ) {
    throw new ConvexError("Another board’s old links use this code.");
  }
  return code;
}

function cardsOf(
  ctx: QueryCtx,
  boardId: Id<"boards">
): Promise<Doc<"cards">[]> {
  return ctx.db
    .query("cards")
    .withIndex("by_board", (q) => q.eq("boardId", boardId))
    .collect();
}

/** A board's labels, from the colors its cards wear when it has no list of its own yet. */
async function labelsOf(
  ctx: QueryCtx,
  board: Doc<"boards">
): Promise<BoardLabel[]> {
  return board.labels ?? legacyLabels(await cardsOf(ctx, board._id));
}

/** The labels with `removed` gone and `changed` renamed, recolored or added. */
function mergeLabels(
  labels: BoardLabel[],
  changed: BoardLabel[],
  removed: string[]
): BoardLabel[] {
  const gone = new Set(removed);
  const merged = labels.filter(({ id }) => !gone.has(id));
  const kept = changed.filter(({ id }) => !gone.has(id));
  for (const { color, id, name: raw } of kept) {
    const name = raw.trim().slice(0, MAX_LABEL_NAME);
    if (!name) {
      throw new ConvexError("Give every label a name.");
    }
    const label = { color, id, name };
    const index = merged.findIndex((existing) => existing.id === id);
    if (index !== -1) {
      merged[index] = label;
    } else if (LABEL_ID.test(id)) {
      merged.push(label);
    } else {
      throw new ConvexError("That label can’t be added.");
    }
  }
  const names = new Set<string>();
  for (const { name } of merged) {
    if (names.has(labelKey(name))) {
      throw new ConvexError(`There’s already a label named “${name}”.`);
    }
    names.add(labelKey(name));
  }
  if (merged.length > MAX_LABELS) {
    throw new ConvexError(`A board can have up to ${MAX_LABELS} labels.`);
  }
  return merged;
}

/** Board settings are for whoever made the board, and the project's owners. */
function canManageBoard(
  access: ProjectAccess & { board: Doc<"boards"> }
): boolean {
  return (
    canManageRole(access.role) || access.board.createdBy === access.user._id
  );
}

/** Adds a board to a project, under a code no other board has. Checks no access. */
export async function insertBoard(
  ctx: MutationCtx,
  board: Pick<
    Doc<"boards">,
    "code" | "createdBy" | "description" | "projectId" | "title" | "usesSprints"
  >
): Promise<{ _id: Id<"boards">; code: string }> {
  const code = await freeCode(ctx, board.code);
  const boardId = await ctx.db.insert("boards", {
    code,
    createdBy: board.createdBy,
    description: board.description.trim().slice(0, MAX_DESCRIPTION),
    labels: [],
    nextCardNumber: 1,
    nextSprintNumber: 1,
    projectId: board.projectId,
    title: cleanTitle(board.title),
    usesSprints: board.usesSprints,
  });
  return { _id: boardId, code };
}

export const create = mutation({
  args: {
    code: v.string(),
    description: v.string(),
    projectId: v.id("projects"),
    title: v.string(),
    usesSprints: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { user } = await requireProject(ctx, args.projectId, "edit");
    return await insertBoard(ctx, { ...args, createdBy: user._id });
  },
});

export const update = mutation({
  args: {
    boardId: v.id("boards"),
    code: v.optional(v.string()),
    description: v.optional(v.string()),
    /** Only what changed, so labels added from cards meanwhile stay. */
    labels: v.optional(
      v.object({ changed: v.array(vBoardLabel), removed: v.array(v.string()) })
    ),
    projectId: v.optional(v.id("projects")),
    title: v.optional(v.string()),
    usesSprints: v.optional(v.boolean()),
  },
  handler: async (ctx, { boardId, ...changes }) => {
    const access = await requireBoard(ctx, boardId, "edit");
    if (!canManageBoard(access)) {
      throw new ConvexError(
        "Only whoever made the board and the project’s owners can change it."
      );
    }
    const { board } = access;
    const patch: Partial<Doc<"boards">> = {};
    if (changes.title !== undefined) {
      patch.title = cleanTitle(changes.title);
    }
    if (changes.code !== undefined && changes.code !== board.code) {
      const code = await freeCode(ctx, changes.code, boardId);
      patch.code = code;
      // Links and card keys shared under the old code keep finding the board.
      patch.formerCodes = [
        ...(board.formerCodes ?? []).filter((former) => former !== code),
        board.code,
      ];
    }
    if (changes.description !== undefined) {
      patch.description = changes.description.trim().slice(0, MAX_DESCRIPTION);
    }
    // Turning sprints off keeps them, so turning them back on picks up where they were.
    if (changes.usesSprints !== undefined) {
      patch.usesSprints = changes.usesSprints;
    }
    if (
      changes.projectId !== undefined &&
      changes.projectId !== board.projectId
    ) {
      // Moving a board takes being able to add boards where it goes.
      await requireProject(ctx, changes.projectId, "edit");
      patch.projectId = changes.projectId;
    }
    if (changes.labels !== undefined) {
      const { changed, removed } = changes.labels;
      patch.labels = mergeLabels(await labelsOf(ctx, board), changed, removed);
      // Cards let go of deleted labels, which a new label never takes the id of.
      const gone = new Set(removed);
      for (const card of await cardsOf(ctx, boardId)) {
        if (card.labels.some((id) => gone.has(id))) {
          await ctx.db.patch(card._id, {
            labels: card.labels.filter((id) => !gone.has(id)),
          });
        }
      }
    }
    await ctx.db.patch(boardId, patch);
    return { code: patch.code ?? board.code };
  },
});

/** A new label on a board, which anyone who can edit its cards may add. */
export const addLabel = mutation({
  args: { boardId: v.id("boards"), label: vBoardLabel },
  handler: async (ctx, { boardId, label }) => {
    const { board } = await requireBoard(ctx, boardId, "edit");
    const labels = await labelsOf(ctx, board);
    if (labels.some(({ id }) => id === label.id)) {
      return;
    }
    await ctx.db.patch(boardId, { labels: mergeLabels(labels, [label], []) });
  },
});

/** Deletes the board for everyone, with its cards and sprints. */
export const remove = mutation({
  args: { boardId: v.id("boards") },
  handler: async (ctx, { boardId }) => {
    const access = await requireBoard(ctx, boardId, "edit");
    if (!canManageBoard(access)) {
      throw new ConvexError(
        "Only whoever made the board and the project’s owners can delete it."
      );
    }
    await ctx.db.delete(boardId);
    await ctx.scheduler.runAfter(0, internal.cleanup.board, { boardId });
  },
});
