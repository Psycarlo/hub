/**
 * What's left once a project, board, card, table, page, portfolio, finance
 * account, habit, or Drive file or folder is deleted. The parent
 * goes first, so nobody sees it anymore; the rest is cleared here in batches
 * that stay well within a mutation's limits.
 */
import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { internalMutation } from "./_generated/server";
import { dropFile } from "./lib/files";
import { releaseBuy } from "./lib/finance";

const BATCH = 100;

/**
 * A card with its comments and the notifications pointing at it. Its files
 * and history can be many, so they're cleared afterwards in batches of their own.
 */
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
  await ctx.scheduler.runAfter(0, internal.cleanup.card, { cardId });
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
 * A page and the notifications pointing at it. The texts kept to merge its
 * edits can be large, so they're cleared afterwards in batches of their own.
 */
export async function deletePage(
  ctx: MutationCtx,
  pageId: Id<"docPages">
): Promise<void> {
  const notifications = await ctx.db
    .query("notifications")
    .withIndex("by_page_and_user", (q) => q.eq("pageId", pageId))
    .collect();
  for (const notification of notifications) {
    await ctx.db.delete(notification._id);
  }
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

/** Each file is also deleted from R2: a few per batch. */
const FILE_BATCH = 20;

export const card = internalMutation({
  args: { cardId: v.id("cards") },
  handler: async (ctx, { cardId }) => {
    const files = await ctx.db
      .query("attachments")
      .withIndex("by_card_and_comment", (q) => q.eq("cardId", cardId))
      .take(FILE_BATCH);
    for (const file of files) {
      await ctx.db.delete(file._id);
      await dropFile(ctx, file.key);
    }
    const events = await ctx.db
      .query("cardEvents")
      .withIndex("by_card_and_at", (q) => q.eq("cardId", cardId))
      .take(BATCH);
    for (const event of events) {
      await ctx.db.delete(event._id);
    }
    if (files.length === FILE_BATCH || events.length === BATCH) {
      await ctx.scheduler.runAfter(0, internal.cleanup.card, { cardId });
    }
  },
});

/**
 * A Drive file for good: its row and its R2 objects at once, then what's kept
 * about it, like its comments, in batches of their own.
 */
export async function deleteDriveFile(
  ctx: MutationCtx,
  file: Doc<"driveFiles">
): Promise<void> {
  await ctx.db.delete(file._id);
  await dropFile(ctx, file.key);
  if (file.thumbKey) {
    await dropFile(ctx, file.thumbKey);
  }
  await ctx.scheduler.runAfter(0, internal.cleanup.driveFile, {
    fileId: file._id,
  });
}

export const driveFile = internalMutation({
  args: { fileId: v.id("driveFiles") },
  handler: async (ctx, { fileId }) => {
    const events = await ctx.db
      .query("driveEvents")
      .withIndex("by_file", (q) => q.eq("fileId", fileId))
      .take(BATCH);
    const comments = await ctx.db
      .query("driveComments")
      .withIndex("by_file", (q) => q.eq("fileId", fileId))
      .take(BATCH);
    const stars = await ctx.db
      .query("driveStars")
      .withIndex("by_file", (q) => q.eq("fileId", fileId))
      .take(BATCH);
    const opens = await ctx.db
      .query("driveOpens")
      .withIndex("by_file", (q) => q.eq("fileId", fileId))
      .take(BATCH);
    const notifications = await ctx.db
      .query("notifications")
      .withIndex("by_file_and_user", (q) => q.eq("fileId", fileId))
      .take(BATCH);
    const batches = [events, comments, stars, opens, notifications];
    for (const row of batches.flat()) {
      await ctx.db.delete(row._id);
    }
    if (batches.some((batch) => batch.length === BATCH)) {
      await ctx.scheduler.runAfter(0, internal.cleanup.driveFile, { fileId });
    }
  },
});

/**
 * A Drive folder for good, with everything inside it. Folders inside are let
 * go of and cleared on their own, so each batch finds only what's left here.
 */
export const driveFolder = internalMutation({
  args: { folderId: v.id("driveFolders") },
  handler: async (ctx, { folderId }) => {
    const folder = await ctx.db.get(folderId);
    if (!folder) {
      return;
    }
    const files = await ctx.db
      .query("driveFiles")
      .withIndex("by_project_and_folder", (q) =>
        q.eq("projectId", folder.projectId).eq("folderId", folderId)
      )
      .take(FILE_BATCH);
    for (const file of files) {
      await deleteDriveFile(ctx, file);
    }
    const folders = await ctx.db
      .query("driveFolders")
      .withIndex("by_project_and_parent", (q) =>
        q.eq("projectId", folder.projectId).eq("parentId", folderId)
      )
      .take(BATCH);
    for (const inside of folders) {
      await ctx.db.patch(inside._id, {
        deleting: true,
        parentId: undefined,
        trashedAt: undefined,
      });
      await ctx.scheduler.runAfter(0, internal.cleanup.driveFolder, {
        folderId: inside._id,
      });
    }
    if (files.length > 0 || folders.length > 0) {
      await ctx.scheduler.runAfter(0, internal.cleanup.driveFolder, {
        folderId,
      });
      return;
    }
    const stars = await ctx.db
      .query("driveStars")
      .withIndex("by_folder", (q) => q.eq("folderId", folderId))
      .collect();
    for (const star of stars) {
      await ctx.db.delete(star._id);
    }
    await ctx.db.delete(folderId);
  },
});

export const board = internalMutation({
  args: { boardId: v.id("boards") },
  handler: async (ctx, { boardId }) => {
    const cards = await ctx.db
      .query("cards")
      .withIndex("by_board", (q) => q.eq("boardId", boardId))
      .take(BATCH / 4);
    for (const item of cards) {
      await deleteCard(ctx, item._id);
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
      await releaseBuy(ctx, transaction.projectId, transaction._id);
      // The other side of a send between portfolios stays, now to or from outside.
      if (transaction.transfer) {
        const other = await ctx.db.get(transaction.transfer.transactionId);
        if (other) {
          await ctx.db.patch(other._id, { transfer: undefined });
        }
      }
    }
    if (transactions.length === BATCH) {
      await ctx.scheduler.runAfter(0, internal.cleanup.portfolio, {
        portfolioId,
      });
    }
  },
});

export const financeAccount = internalMutation({
  args: { accountId: v.id("financeAccounts") },
  handler: async (ctx, { accountId }) => {
    const entries = await ctx.db
      .query("financeEntries")
      .withIndex("by_account_and_date", (q) => q.eq("accountId", accountId))
      .take(BATCH);
    for (const entry of entries) {
      await ctx.db.delete(entry._id);
      // The other side of a transfer stays, now money out or in on its own.
      if (entry.transfer) {
        const other = await ctx.db.get(entry.transfer.entryId);
        if (other) {
          await ctx.db.patch(other._id, { transfer: undefined });
        }
      }
    }
    const recurring = await ctx.db
      .query("financeRecurring")
      .withIndex("by_account", (q) => q.eq("accountId", accountId))
      .take(BATCH);
    for (const item of recurring) {
      await ctx.db.delete(item._id);
    }
    const months = await ctx.db
      .query("financeMonths")
      .withIndex("by_account_and_month", (q) => q.eq("accountId", accountId))
      .take(BATCH);
    for (const month of months) {
      await ctx.db.delete(month._id);
    }
    if (
      entries.length === BATCH ||
      recurring.length === BATCH ||
      months.length === BATCH
    ) {
      await ctx.scheduler.runAfter(0, internal.cleanup.financeAccount, {
        accountId,
      });
    }
  },
});

export const habit = internalMutation({
  args: { habitId: v.id("habits") },
  handler: async (ctx, { habitId }) => {
    const logs = await ctx.db
      .query("habitLogs")
      .withIndex("by_habit_and_date", (q) => q.eq("habitId", habitId))
      .take(BATCH);
    for (const log of logs) {
      await ctx.db.delete(log._id);
    }
    if (logs.length === BATCH) {
      await ctx.scheduler.runAfter(0, internal.cleanup.habit, { habitId });
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
    const accounts = await ctx.db
      .query("financeAccounts")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .take(BATCH);
    for (const item of accounts) {
      await ctx.db.delete(item._id);
      await ctx.scheduler.runAfter(0, internal.cleanup.financeAccount, {
        accountId: item._id,
      });
    }
    const settings = await ctx.db
      .query("financeSettings")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .collect();
    for (const item of settings) {
      await ctx.db.delete(item._id);
    }
    const habits = await ctx.db
      .query("habits")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .take(BATCH);
    for (const item of habits) {
      await ctx.db.delete(item._id);
      await ctx.scheduler.runAfter(0, internal.cleanup.habit, {
        habitId: item._id,
      });
    }
    // Every file of the Drive goes, wherever it sits, so its folders can go as they are.
    const files = await ctx.db
      .query("driveFiles")
      .withIndex("by_project_and_folder", (q) => q.eq("projectId", projectId))
      .take(FILE_BATCH);
    for (const file of files) {
      await deleteDriveFile(ctx, file);
    }
    const folders =
      files.length > 0
        ? []
        : await ctx.db
            .query("driveFolders")
            .withIndex("by_project_and_parent", (q) =>
              q.eq("projectId", projectId)
            )
            .take(BATCH);
    for (const folder of folders) {
      const stars = await ctx.db
        .query("driveStars")
        .withIndex("by_folder", (q) => q.eq("folderId", folder._id))
        .collect();
      for (const star of stars) {
        await ctx.db.delete(star._id);
      }
      await ctx.db.delete(folder._id);
    }
    if (
      boards.length > 0 ||
      tables.length > 0 ||
      pages.length > 0 ||
      portfolios.length > 0 ||
      accounts.length > 0 ||
      habits.length > 0 ||
      files.length > 0 ||
      folders.length > 0
    ) {
      await ctx.scheduler.runAfter(0, internal.cleanup.project, { projectId });
    }
  },
});
