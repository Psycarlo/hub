import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { BoardLabel } from "../shared/model";
import { BURST_MS, isClosed, legacyLabels } from "../shared/model";
import type { CardChange } from "./validators";

function sameMembers(a: readonly string[], b: readonly string[]): boolean {
  const members = new Set(a);
  return a.length === b.length && b.every((item) => members.has(item));
}

/** The labels as the card's history keeps them: whole, should one be renamed or deleted. */
function labelsOf(board: Doc<"boards">, ids: readonly string[]): BoardLabel[] {
  const known = board.labels ?? legacyLabels([{ labels: ids }]);
  return ids.flatMap((id) => known.find((label) => label.id === id) ?? []);
}

async function sprintOf(ctx: QueryCtx, sprintId: Id<"sprints"> | undefined) {
  const sprint = sprintId ? await ctx.db.get(sprintId) : null;
  return sprint ? { id: sprint._id, title: sprint.title } : undefined;
}

/** What a patch changes on a card, as its history tells it. A new rank isn't a change. */
async function changesOf(
  ctx: QueryCtx,
  board: Doc<"boards">,
  card: Doc<"cards">,
  patch: Partial<Doc<"cards">>
): Promise<CardChange[]> {
  const changes: CardChange[] = [];
  if (patch.title !== undefined && patch.title !== card.title) {
    changes.push({ from: card.title, kind: "title", to: patch.title });
  }
  if (
    patch.description !== undefined &&
    patch.description !== card.description
  ) {
    changes.push({ kind: "description" });
  }
  if (patch.status !== undefined && patch.status !== card.status) {
    changes.push({ from: card.status, kind: "status", to: patch.status });
  }
  // Optional fields are cleared by a patch that names them without a value.
  if ("priority" in patch && patch.priority !== card.priority) {
    changes.push({ from: card.priority, kind: "priority", to: patch.priority });
  }
  if ("due" in patch && patch.due !== card.due) {
    changes.push({ from: card.due, kind: "due", to: patch.due });
  }
  if (
    patch.assignees !== undefined &&
    !sameMembers(patch.assignees, card.assignees)
  ) {
    changes.push({
      from: card.assignees,
      kind: "assignees",
      to: patch.assignees,
    });
  }
  if (patch.labels !== undefined && !sameMembers(patch.labels, card.labels)) {
    changes.push({
      from: labelsOf(board, card.labels),
      kind: "labels",
      to: labelsOf(board, patch.labels),
    });
  }
  if ("sprintId" in patch && patch.sprintId !== card.sprintId) {
    changes.push({
      from: await sprintOf(ctx, card.sprintId),
      kind: "sprint",
      to: await sprintOf(ctx, patch.sprintId),
    });
  }
  return changes;
}

/** Whether the change leaves the card as it was, like a status set and set back. */
function changesNothing(change: CardChange): boolean {
  switch (change.kind) {
    case "attachments": {
      return change.names.length === 0;
    }
    case "description": {
      return false;
    }
    case "assignees": {
      return sameMembers(change.from, change.to);
    }
    case "labels": {
      return sameMembers(
        change.from.map(({ id }) => id),
        change.to.map(({ id }) => id)
      );
    }
    case "sprint": {
      return change.from?.id === change.to?.id;
    }
    default: {
      return change.from === change.to;
    }
  }
}

/** The later change folded into the earlier one, when both are to the same thing. */
function fold(earlier: CardChange, later: CardChange): CardChange | undefined {
  if (earlier.kind !== later.kind) {
    return undefined;
  }
  // Each case reads `earlier` as the same kind of change as `later`, as checked above.
  switch (later.kind) {
    case "attachments": {
      const { names, removed } = earlier as typeof later;
      return removed === later.removed
        ? { ...later, names: [...names, ...later.names] }
        : undefined;
    }
    case "description": {
      return later;
    }
    default: {
      // From where the first change started to where the last one ended.
      return { ...later, from: (earlier as typeof later).from } as CardChange;
    }
  }
}

/**
 * When the card's latest comment was made, or 0 without one. Replies don't
 * count: the activity shows them in their thread, not where they fall in time.
 */
async function lastCommented(
  ctx: QueryCtx,
  cardId: Id<"cards">
): Promise<number> {
  const comments = ctx.db
    .query("comments")
    .withIndex("by_card", (q) => q.eq("cardId", cardId))
    .order("desc");
  for await (const { _creationTime, parentId } of comments) {
    if (!parentId) {
      return _creationTime;
    }
  }
  return 0;
}

/**
 * Adds a change to the card's history. The activity tells someone's burst of
 * changes as one, so a change to a field they already changed in the burst
 * folds into that one: picking labels one by one reads as one change, and a
 * change undone drops out.
 */
export async function recordChange(
  ctx: MutationCtx,
  cardId: Id<"cards">,
  actorId: Id<"users">,
  change: CardChange
): Promise<void> {
  const at = Date.now();
  const commented = await lastCommented(ctx, cardId);
  const recent = ctx.db
    .query("cardEvents")
    .withIndex("by_card_and_at", (q) => q.eq("cardId", cardId))
    .order("desc");
  // The burst, newest first, ends at someone else's change, a comment or a pause.
  let after = at;
  for await (const event of recent) {
    if (
      event.actorId !== actorId ||
      event.at <= commented ||
      after - event.at > BURST_MS
    ) {
      break;
    }
    const folded = fold(event.change, change);
    if (folded) {
      await (changesNothing(folded)
        ? ctx.db.delete(event._id)
        : ctx.db.patch(event._id, { at, change: folded }));
      return;
    }
    after = event.at;
  }
  if (!changesNothing(change)) {
    await ctx.db.insert("cardEvents", { actorId, at, cardId, change });
  }
}

/**
 * When the card closed, should the patch close it; cleared should it reopen it.
 * Moving between closed statuses, say from done to canceled, keeps the stamp.
 */
function doneStamp(
  card: Doc<"cards">,
  patch: Partial<Doc<"cards">>
): Pick<Doc<"cards">, "doneAt"> | undefined {
  if (
    patch.status === undefined ||
    isClosed(patch.status) === isClosed(card.status)
  ) {
    return undefined;
  }
  return { doneAt: isClosed(patch.status) ? Date.now() : undefined };
}

/** Patches a card, adding what that changes to its history. */
export async function patchCard(
  ctx: MutationCtx,
  actorId: Id<"users">,
  board: Doc<"boards">,
  card: Doc<"cards">,
  patch: Partial<Doc<"cards">>
): Promise<void> {
  for (const change of await changesOf(ctx, board, card, patch)) {
    await recordChange(ctx, card._id, actorId, change);
  }
  await ctx.db.patch(card._id, { ...patch, ...doneStamp(card, patch) });
}
