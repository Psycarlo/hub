/**
 * What's left once a project, board, table, page or portfolio is deleted. The parent
 * goes first, so nobody sees it anymore; the rest is cleared here in batches
 * that stay well within a mutation's limits.
 */
import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { internalMutation } from "./_generated/server";

const BATCH = 100;

/** A card with its comments and the notifications pointing at it. */
export async function deleteCard(
  ctx: MutationCtx,
  cardId: Id<"cards">
): Promise<void> {
  const comments = await ctx.db
    .query("comments")
    .withIndex("by_card", (q) => q.eq("cardId", cardId))
    .collect();
  for (const comment of comments) {
    await ctx.db.delete(comment._id);
  }
  const notifications = await ctx.db
    .query("notifications")
    .withIndex("by_card", (q) => q.eq("cardId", cardId))
    .collect();
  for (const notification of notifications) {
    await ctx.db.delete(notification._id);
  }
  await ctx.db.delete(cardId);
}

/** A record with what was logged on it. */
export async function deleteRecord(
  ctx: MutationCtx,
  recordId: Id<"crmRecords">
): Promise<void> {
  const activity = await ctx.db
    .query("crmActivity")
    .withIndex("by_record", (q) => q.eq("recordId", recordId))
    .collect();
  for (const entry of activity) {
    await ctx.db.delete(entry._id);
  }
  await ctx.db.delete(recordId);
}

/**
 * A page. The texts kept to merge its edits can be large, so they're
 * cleared afterwards in batches of their own.
 */
export async function deletePage(
  ctx: MutationCtx,
  pageId: Id<"docPages">
): Promise<void> {
  await ctx.db.delete(pageId);
  await ctx.scheduler.runAfter(0, internal.cleanup.revisions, { pageId });
}

/** Revisions are up to a page's length each: a few per batch. */
const REVISION_BATCH = 10;

export const revisions = internalMutation({
  args: { pageId: v.id("docPages") },
  handler: async (ctx, { pageId }) => {
    const batch = await ctx.db
      .query("docRevisions")
      .withIndex("by_page_and_revision", (q) => q.eq("pageId", pageId))
      .take(REVISION_BATCH);
    for (const revision of batch) {
      await ctx.db.delete(revision._id);
    }
    if (batch.length === REVISION_BATCH) {
      await ctx.scheduler.runAfter(0, internal.cleanup.revisions, { pageId });
    }
  },
});

export const board = internalMutation({
  args: { boardId: v.id("boards") },
  handler: async (ctx, { boardId }) => {
    const cards = await ctx.db
      .query("cards")
      .withIndex("by_board", (q) => q.eq("boardId", boardId))
      .take(BATCH / 4);
    for (const card of cards) {
      await deleteCard(ctx, card._id);
    }
    const sprints = await ctx.db
      .query("sprints")
      .withIndex("by_board", (q) => q.eq("boardId", boardId))
      .take(BATCH);
    for (const sprint of sprints) {
      await ctx.db.delete(sprint._id);
    }
    if (cards.length > 0 || sprints.length > 0) {
      await ctx.scheduler.runAfter(0, internal.cleanup.board, { boardId });
    }
  },
});

export const table = internalMutation({
  args: { tableId: v.id("crmTables") },
  handler: async (ctx, { tableId }) => {
    const records = await ctx.db
      .query("crmRecords")
      .withIndex("by_table", (q) => q.eq("tableId", tableId))
      .take(BATCH / 4);
    for (const record of records) {
      await deleteRecord(ctx, record._id);
    }
    if (records.length > 0) {
      await ctx.scheduler.runAfter(0, internal.cleanup.table, { tableId });
    }
  },
});

export const portfolio = internalMutation({
  args: { portfolioId: v.id("portfolios") },
  handler: async (ctx, { portfolioId }) => {
    const transactions = await ctx.db
      .query("portfolioTransactions")
      .withIndex("by_portfolio_and_at", (q) => q.eq("portfolioId", portfolioId))
      .take(BATCH);
    for (const transaction of transactions) {
      await ctx.db.delete(transaction._id);
    }
    if (transactions.length === BATCH) {
      await ctx.scheduler.runAfter(0, internal.cleanup.portfolio, {
        portfolioId,
      });
    }
  },
});

export const project = internalMutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const boards = await ctx.db
      .query("boards")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .take(BATCH);
    for (const item of boards) {
      await ctx.db.delete(item._id);
      await ctx.scheduler.runAfter(0, internal.cleanup.board, {
        boardId: item._id,
      });
    }
    const tables = await ctx.db
      .query("crmTables")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .take(BATCH);
    for (const item of tables) {
      await ctx.db.delete(item._id);
      await ctx.scheduler.runAfter(0, internal.cleanup.table, {
        tableId: item._id,
      });
    }
    const pages = await ctx.db
      .query("docPages")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .take(BATCH / 4);
    for (const page of pages) {
      await deletePage(ctx, page._id);
    }
    const portfolios = await ctx.db
      .query("portfolios")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .take(BATCH);
    for (const item of portfolios) {
      await ctx.db.delete(item._id);
      await ctx.scheduler.runAfter(0, internal.cleanup.portfolio, {
        portfolioId: item._id,
      });
    }
    if (
      boards.length > 0 ||
      tables.length > 0 ||
      pages.length > 0 ||
      portfolios.length > 0
    ) {
      await ctx.scheduler.runAfter(0, internal.cleanup.project, { projectId });
    }
  },
});
