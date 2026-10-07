import { ConvexError, v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import type { ProjectAccess } from "./lib/access";
import {
  ifVisible,
  requireBoard,
  requireProject,
  requireUser,
  visibleProjects,
} from "./lib/access";
import { canManageRole, codeProblem } from "./shared/model";

const MAX_TITLE = 80;
const MAX_DESCRIPTION = 500;

export type BoardView = Pick<
  Doc<"boards">,
  | "_id"
  | "_creationTime"
  | "projectId"
  | "code"
  | "title"
  | "description"
  | "createdBy"
>;

function toView(board: Doc<"boards">): BoardView {
  return {
    _creationTime: board._creationTime,
    _id: board._id,
    code: board.code,
    createdBy: board.createdBy,
    description: board.description,
    projectId: board.projectId,
    title: board.title,
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
    return boards.map((board) => ({ _id: board._id, code: board.code }));
  },
});

/** Cards and sprints of a board. */
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
      nextCardNumber: board.nextCardNumber,
      nextSprintNumber: board.nextSprintNumber,
      sprints: sprints.toSorted((a, b) => a.number - b.number),
    };
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
  return code;
}

/** Board settings are for whoever made the board, and the project's owners. */
function canManageBoard(
  access: ProjectAccess & { board: Doc<"boards"> }
): boolean {
  return (
    canManageRole(access.role) || access.board.createdBy === access.user._id
  );
}

export const create = mutation({
  args: {
    code: v.string(),
    description: v.string(),
    projectId: v.id("projects"),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    const { user } = await requireProject(ctx, args.projectId, "edit");
    const code = await freeCode(ctx, args.code);
    const boardId = await ctx.db.insert("boards", {
      code,
      createdBy: user._id,
      description: args.description.trim().slice(0, MAX_DESCRIPTION),
      nextCardNumber: 1,
      nextSprintNumber: 1,
      projectId: args.projectId,
      title: cleanTitle(args.title),
    });
    return { _id: boardId, code };
  },
});

export const update = mutation({
  args: {
    boardId: v.id("boards"),
    code: v.optional(v.string()),
    description: v.optional(v.string()),
    projectId: v.optional(v.id("projects")),
    title: v.optional(v.string()),
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
      patch.code = await freeCode(ctx, changes.code, boardId);
    }
    if (changes.description !== undefined) {
      patch.description = changes.description.trim().slice(0, MAX_DESCRIPTION);
    }
    if (
      changes.projectId !== undefined &&
      changes.projectId !== board.projectId
    ) {
      // Moving a board takes being able to add boards where it goes.
      await requireProject(ctx, changes.projectId, "edit");
      patch.projectId = changes.projectId;
    }
    await ctx.db.patch(boardId, patch);
    return { code: patch.code ?? board.code };
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
