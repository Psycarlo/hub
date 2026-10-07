import { ConvexError, v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { mutation } from "./_generated/server";
import { deleteCard } from "./cleanup";
import { canSee, requireBoard, requireCard } from "./lib/access";
import { vLabel, vPriority, vStatus } from "./lib/validators";
import { LABELS } from "./shared/model";

const DAY = /^\d{4}-\d{2}-\d{2}$/u;
const MAX_TITLE = 300;
const MAX_DESCRIPTION = 50_000;

function cleanDue(due: string | null | undefined): string | undefined {
  if (!due) {
    return undefined;
  }
  if (!DAY.test(due)) {
    throw new ConvexError("Due dates are written YYYY-MM-DD.");
  }
  return due;
}

function cleanLabels(labels: Doc<"cards">["labels"]): Doc<"cards">["labels"] {
  return LABELS.filter((label) => labels.includes(label));
}

async function checkSprint(
  ctx: QueryCtx,
  boardId: Id<"boards">,
  sprintId: Id<"sprints"> | null | undefined
): Promise<Id<"sprints"> | undefined> {
  if (!sprintId) {
    return undefined;
  }
  const sprint = await ctx.db.get(sprintId);
  if (sprint?.boardId !== boardId) {
    throw new ConvexError("That sprint isn’t on this board.");
  }
  return sprintId;
}

/**
 * Assignees must be able to see the card. Someone assigned before they left
 * the project may stay, so editing other fields doesn't fail on them.
 */
async function checkPeople(
  ctx: QueryCtx,
  projectId: Id<"projects">,
  people: Id<"users">[],
  already: Id<"users">[] = []
): Promise<Id<"users">[]> {
  const unique = [...new Set(people)];
  for (const userId of unique) {
    if (!(already.includes(userId) || (await canSee(ctx, userId, projectId)))) {
      throw new ConvexError("Only people on the project can be assigned.");
    }
  }
  return unique;
}

export const create = mutation({
  args: {
    assignees: v.array(v.id("users")),
    boardId: v.id("boards"),
    description: v.string(),
    due: v.optional(v.string()),
    labels: v.array(vLabel),
    priority: v.optional(vPriority),
    rank: v.number(),
    sprintId: v.optional(v.id("sprints")),
    status: vStatus,
    title: v.string(),
  },
  handler: async (ctx, args) => {
    const { board, user } = await requireBoard(ctx, args.boardId, "edit");
    const title = args.title.trim().slice(0, MAX_TITLE);
    if (!title) {
      throw new ConvexError("Give the card a title.");
    }
    const number = board.nextCardNumber;
    await ctx.db.patch(board._id, { nextCardNumber: number + 1 });
    const cardId = await ctx.db.insert("cards", {
      assignees: await checkPeople(ctx, board.projectId, args.assignees),
      boardId: board._id,
      createdBy: user._id,
      description: args.description.slice(0, MAX_DESCRIPTION),
      due: cleanDue(args.due),
      labels: cleanLabels(args.labels),
      number,
      priority: args.priority,
      rank: args.rank,
      sprintId: await checkSprint(ctx, board._id, args.sprintId),
      status: args.status,
      title,
      updatedAt: Date.now(),
    });
    return { _id: cardId, number };
  },
});

export const update = mutation({
  args: {
    assignees: v.optional(v.array(v.id("users"))),
    cardId: v.id("cards"),
    description: v.optional(v.string()),
    due: v.optional(v.union(v.string(), v.null())),
    labels: v.optional(v.array(vLabel)),
    priority: v.optional(v.union(vPriority, v.null())),
    rank: v.optional(v.number()),
    sprintId: v.optional(v.union(v.id("sprints"), v.null())),
    status: v.optional(vStatus),
    title: v.optional(v.string()),
  },
  handler: async (ctx, { cardId, ...changes }) => {
    const { board, card } = await requireCard(ctx, cardId, "edit");
    const patch: Partial<Doc<"cards">> = { updatedAt: Date.now() };
    if (changes.title !== undefined) {
      const title = changes.title.trim().slice(0, MAX_TITLE);
      if (title) {
        patch.title = title;
      }
    }
    if (changes.description !== undefined) {
      patch.description = changes.description.slice(0, MAX_DESCRIPTION);
    }
    if (changes.status !== undefined) {
      patch.status = changes.status;
    }
    if (changes.rank !== undefined) {
      patch.rank = changes.rank;
    }
    if (changes.assignees !== undefined) {
      patch.assignees = await checkPeople(
        ctx,
        board.projectId,
        changes.assignees,
        card.assignees
      );
    }
    if (changes.priority !== undefined) {
      patch.priority = changes.priority ?? undefined;
    }
    if (changes.due !== undefined) {
      patch.due = cleanDue(changes.due);
    }
    if (changes.labels !== undefined) {
      patch.labels = cleanLabels(changes.labels);
    }
    if (changes.sprintId !== undefined) {
      patch.sprintId = await checkSprint(ctx, card.boardId, changes.sprintId);
    }
    await ctx.db.patch(cardId, patch);
  },
});

/** Cards dropped somewhere else on a board: a new rank, and maybe a new column or sprint. */
export const move = mutation({
  args: {
    moves: v.array(
      v.object({
        cardId: v.id("cards"),
        rank: v.number(),
        sprintId: v.optional(v.union(v.id("sprints"), v.null())),
        status: v.optional(vStatus),
      })
    ),
  },
  handler: async (ctx, { moves }) => {
    const [first] = moves;
    if (!first) {
      return;
    }
    const { board } = await requireCard(ctx, first.cardId, "edit");
    const now = Date.now();
    for (const { cardId, rank, sprintId, status } of moves) {
      const card = await ctx.db.get(cardId);
      if (card?.boardId !== board._id) {
        throw new ConvexError("Cards can only move within their board.");
      }
      const patch: Partial<Doc<"cards">> = { rank, updatedAt: now };
      if (status !== undefined) {
        patch.status = status;
      }
      if (sprintId !== undefined) {
        patch.sprintId = await checkSprint(ctx, board._id, sprintId);
      }
      await ctx.db.patch(cardId, patch);
    }
  },
});

export const remove = mutation({
  args: { cardId: v.id("cards") },
  handler: async (ctx, { cardId }) => {
    await requireCard(ctx, cardId, "edit");
    await deleteCard(ctx, cardId);
  },
});
