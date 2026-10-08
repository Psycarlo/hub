import { ConvexError, v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { mutation } from "./_generated/server";
import { requireBoard, requireSprint } from "./lib/access";
import { patchCard } from "./lib/history";
import { isClosed, statusKind } from "./shared/model";

const DAY = /^\d{4}-\d{2}-\d{2}$/u;
const SPRINT_DAYS = 15;
const DAY_MS = 86_400_000;
const MAX_TITLE = 80;

function isoDay(offsetDays = 0): string {
  return new Date(Date.now() + offsetDays * DAY_MS).toISOString().slice(0, 10);
}

function cleanDay(day: string | null | undefined): string | undefined {
  if (!day) {
    return undefined;
  }
  if (!DAY.test(day)) {
    throw new ConvexError("Dates are written YYYY-MM-DD.");
  }
  return day;
}

async function newSprint(
  ctx: MutationCtx,
  board: Doc<"boards">,
  fields: Partial<Pick<Doc<"sprints">, "status" | "start" | "end">> = {}
): Promise<Id<"sprints">> {
  const number = board.nextSprintNumber;
  await ctx.db.patch(board._id, { nextSprintNumber: number + 1 });
  return await ctx.db.insert("sprints", {
    boardId: board._id,
    number,
    status: "future",
    title: `Sprint ${number}`,
    ...fields,
  });
}

async function boardSprints(ctx: MutationCtx, boardId: Id<"boards">) {
  const sprints = await ctx.db
    .query("sprints")
    .withIndex("by_board", (q) => q.eq("boardId", boardId))
    .collect();
  return sprints.toSorted((a, b) => a.number - b.number);
}

/** Sprints are only planned and started on boards that use them. */
function requireSprints(board: Doc<"boards">): void {
  if (!board.usesSprints) {
    throw new ConvexError("This board doesn’t use sprints.");
  }
}

export const create = mutation({
  args: { boardId: v.id("boards") },
  handler: async (ctx, { boardId }) => {
    const { board } = await requireBoard(ctx, boardId, "edit");
    requireSprints(board);
    return await newSprint(ctx, board);
  },
});

export const update = mutation({
  args: {
    end: v.optional(v.union(v.string(), v.null())),
    sprintId: v.id("sprints"),
    start: v.optional(v.union(v.string(), v.null())),
    title: v.optional(v.string()),
  },
  handler: async (ctx, { sprintId, title, start, end }) => {
    const { sprint } = await requireSprint(ctx, sprintId, "edit");
    const patch: Partial<Doc<"sprints">> = {};
    if (title !== undefined) {
      patch.title = title.trim().slice(0, MAX_TITLE) || sprint.title;
    }
    if (start !== undefined) {
      patch.start = cleanDay(start);
    }
    if (end !== undefined) {
      patch.end = cleanDay(end);
    }
    await ctx.db.patch(sprintId, patch);
  },
});

/** Starts the sprint, or a new one, running for the next two weeks. */
export const start = mutation({
  args: { boardId: v.id("boards"), sprintId: v.optional(v.id("sprints")) },
  handler: async (ctx, { boardId, sprintId }) => {
    const { board } = await requireBoard(ctx, boardId, "edit");
    requireSprints(board);
    const sprints = await boardSprints(ctx, boardId);
    if (sprints.some((sprint) => sprint.status === "active")) {
      throw new ConvexError("End the active sprint first.");
    }
    const dates = {
      end: isoDay(SPRINT_DAYS),
      start: isoDay(),
      status: "active" as const,
    };
    if (!sprintId) {
      return await newSprint(ctx, board, dates);
    }
    const sprint = sprints.find((item) => item._id === sprintId);
    if (!sprint) {
      throw new ConvexError("That sprint isn’t on this board.");
    }
    await ctx.db.patch(sprintId, dates);
    return sprintId;
  },
});

/**
 * Open cards roll over to the next future sprint, those under way back to todo;
 * closed cards stay with the ended one.
 */
export const end = mutation({
  args: { sprintId: v.id("sprints") },
  handler: async (ctx, { sprintId }) => {
    const { board, sprint, user } = await requireSprint(ctx, sprintId, "edit");
    if (sprint.status !== "active") {
      throw new ConvexError("Only the active sprint can end.");
    }
    const cards = await ctx.db
      .query("cards")
      .withIndex("by_sprint", (q) => q.eq("sprintId", sprint._id))
      .collect();
    const unfinished = cards.filter((card) => !isClosed(card.status));
    const sprints = await boardSprints(ctx, board._id);
    let next = sprints.find(
      (item) => item.status === "future" && item._id !== sprintId
    )?._id;
    if (unfinished.length > 0 && !next) {
      next = await newSprint(ctx, board);
    }
    const now = Date.now();
    for (const card of unfinished) {
      await patchCard(ctx, user._id, board, card, {
        sprintId: next,
        ...(statusKind(card.status) === "started" ? { status: "todo" } : {}),
        updatedAt: now,
      });
    }
    await ctx.db.patch(sprintId, { status: "ended" });
  },
});

/** Deletes the sprint; its cards go back to the backlog. */
export const remove = mutation({
  args: { sprintId: v.id("sprints") },
  handler: async (ctx, { sprintId }) => {
    const { board, sprint, user } = await requireSprint(ctx, sprintId, "edit");
    const cards = await ctx.db
      .query("cards")
      .withIndex("by_sprint", (q) => q.eq("sprintId", sprint._id))
      .collect();
    for (const card of cards) {
      await patchCard(ctx, user._id, board, card, { sprintId: undefined });
    }
    await ctx.db.delete(sprintId);
  },
});
