import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";

import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import type { ProjectRole } from "../shared/model";
import { canEditRole, canManageRole } from "../shared/model";

/** What someone needs to do in a project: read it, change what's in it, or run it. */
export type Need = "view" | "edit" | "manage";

/** The signed-in person, unless they're signed out or their access was taken away. */
export async function currentUser(ctx: QueryCtx): Promise<Doc<"users"> | null> {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    return null;
  }
  const user = await ctx.db.get(userId);
  return user && !user.deactivated ? user : null;
}

export async function requireUser(ctx: QueryCtx): Promise<Doc<"users">> {
  const user = await currentUser(ctx);
  if (!user) {
    throw new ConvexError("Sign in to continue.");
  }
  return user;
}

export function isAdmin(user: Doc<"users">): boolean {
  return user.role === "admin";
}

export async function requireAdmin(ctx: QueryCtx): Promise<Doc<"users">> {
  const user = await requireUser(ctx);
  if (!isAdmin(user)) {
    throw new ConvexError("Only admins can do this.");
  }
  return user;
}

/**
 * The person's role on the project. Admins own every shared project; others
 * need to be on it. A personal project belongs to its owner alone: admins
 * don't see it, and whoever the owner shares it with can edit or view at most.
 */
export async function roleIn(
  ctx: QueryCtx,
  user: Doc<"users">,
  project: Doc<"projects">
): Promise<ProjectRole | null> {
  if (project.personalFor === user._id) {
    return "owner";
  }
  if (!project.personalFor && isAdmin(user)) {
    return "owner";
  }
  const membership = await ctx.db
    .query("projectMembers")
    .withIndex("by_project_and_user", (q) =>
      q.eq("projectId", project._id).eq("userId", user._id)
    )
    .unique();
  const role = membership?.role ?? null;
  return project.personalFor && role === "owner" ? "editor" : role;
}

export function allows(role: ProjectRole | null, need: Need): boolean {
  if (role === null) {
    return false;
  }
  if (need === "manage") {
    return canManageRole(role);
  }
  return need === "edit" ? canEditRole(role) : true;
}

const REFUSALS: Record<Need, string> = {
  edit: "You can only view this project.",
  manage: "Only the project’s owners can do this.",
  view: "You’re not on this project.",
};

export interface ProjectAccess {
  user: Doc<"users">;
  project: Doc<"projects">;
  role: ProjectRole;
}

export async function requireProject(
  ctx: QueryCtx,
  projectId: Id<"projects">,
  need: Need
): Promise<ProjectAccess> {
  const user = await requireUser(ctx);
  const project = await ctx.db.get(projectId);
  const role = project ? await roleIn(ctx, user, project) : null;
  if (!(project && role)) {
    throw new ConvexError(
      "This project doesn’t exist or isn’t shared with you."
    );
  }
  if (!allows(role, need)) {
    throw new ConvexError(REFUSALS[need]);
  }
  return { project, role, user };
}

/**
 * Projects the person can see: their personal project, the ones they're on,
 * and for admins every shared project.
 */
export async function visibleProjects(
  ctx: QueryCtx,
  user: Doc<"users">
): Promise<{ project: Doc<"projects">; role: ProjectRole }[]> {
  const candidates = new Map<Id<"projects">, Doc<"projects">>();
  const own = await ctx.db
    .query("projects")
    .withIndex("by_personal_for", (q) => q.eq("personalFor", user._id))
    .first();
  if (own) {
    candidates.set(own._id, own);
  }
  const memberships = await ctx.db
    .query("projectMembers")
    .withIndex("by_user", (q) => q.eq("userId", user._id))
    .collect();
  for (const membership of memberships) {
    const project = await ctx.db.get(membership.projectId);
    if (project) {
      candidates.set(project._id, project);
    }
  }
  if (isAdmin(user)) {
    // Every shared project; other people's personal ones stay theirs.
    const projects = await ctx.db.query("projects").collect();
    for (const project of projects) {
      if (!project.personalFor) {
        candidates.set(project._id, project);
      }
    }
  }
  const visible: { project: Doc<"projects">; role: ProjectRole }[] = [];
  for (const project of candidates.values()) {
    const role = await roleIn(ctx, user, project);
    if (role) {
      visible.push({ project, role });
    }
  }
  return visible;
}

export async function requireBoard(
  ctx: QueryCtx,
  boardId: Id<"boards">,
  need: Need
): Promise<ProjectAccess & { board: Doc<"boards"> }> {
  const board = await ctx.db.get(boardId);
  if (!board) {
    throw new ConvexError("This board doesn’t exist anymore.");
  }
  return { ...(await requireProject(ctx, board.projectId, need)), board };
}

export async function requireCard(
  ctx: QueryCtx,
  cardId: Id<"cards">,
  need: Need
): Promise<ProjectAccess & { board: Doc<"boards">; card: Doc<"cards"> }> {
  const card = await ctx.db.get(cardId);
  if (!card) {
    throw new ConvexError("This card doesn’t exist anymore.");
  }
  return { ...(await requireBoard(ctx, card.boardId, need)), card };
}

export async function requireSprint(
  ctx: QueryCtx,
  sprintId: Id<"sprints">,
  need: Need
): Promise<ProjectAccess & { board: Doc<"boards">; sprint: Doc<"sprints"> }> {
  const sprint = await ctx.db.get(sprintId);
  if (!sprint) {
    throw new ConvexError("This sprint doesn’t exist anymore.");
  }
  return { ...(await requireBoard(ctx, sprint.boardId, need)), sprint };
}

export async function requireTable(
  ctx: QueryCtx,
  tableId: Id<"crmTables">,
  need: Need
): Promise<ProjectAccess & { table: Doc<"crmTables"> }> {
  const table = await ctx.db.get(tableId);
  if (!table) {
    throw new ConvexError("This table doesn’t exist anymore.");
  }
  return { ...(await requireProject(ctx, table.projectId, need)), table };
}

export async function requireRecord(
  ctx: QueryCtx,
  recordId: Id<"crmRecords">,
  need: Need
): Promise<
  ProjectAccess & { table: Doc<"crmTables">; record: Doc<"crmRecords"> }
> {
  const record = await ctx.db.get(recordId);
  if (!record) {
    throw new ConvexError("This record doesn’t exist anymore.");
  }
  return { ...(await requireTable(ctx, record.tableId, need)), record };
}

export async function requirePage(
  ctx: QueryCtx,
  pageId: Id<"docPages">,
  need: Need
): Promise<ProjectAccess & { page: Doc<"docPages"> }> {
  const page = await ctx.db.get(pageId);
  if (!page) {
    throw new ConvexError("This page doesn’t exist anymore.");
  }
  return { ...(await requireProject(ctx, page.projectId, need)), page };
}

export async function requirePortfolio(
  ctx: QueryCtx,
  portfolioId: Id<"portfolios">,
  need: Need
): Promise<ProjectAccess & { portfolio: Doc<"portfolios"> }> {
  const portfolio = await ctx.db.get(portfolioId);
  if (!portfolio) {
    throw new ConvexError("This portfolio doesn’t exist anymore.");
  }
  return {
    ...(await requireProject(ctx, portfolio.projectId, need)),
    portfolio,
  };
}

export async function requireTransaction(
  ctx: QueryCtx,
  transactionId: Id<"portfolioTransactions">,
  need: Need
): Promise<
  ProjectAccess & {
    portfolio: Doc<"portfolios">;
    transaction: Doc<"portfolioTransactions">;
  }
> {
  const transaction = await ctx.db.get(transactionId);
  if (!transaction) {
    throw new ConvexError("This transaction doesn’t exist anymore.");
  }
  return {
    ...(await requirePortfolio(ctx, transaction.portfolioId, need)),
    transaction,
  };
}

export async function requireAccount(
  ctx: QueryCtx,
  accountId: Id<"financeAccounts">,
  need: Need
): Promise<ProjectAccess & { account: Doc<"financeAccounts"> }> {
  const account = await ctx.db.get(accountId);
  if (!account) {
    throw new ConvexError("This account doesn’t exist anymore.");
  }
  return { ...(await requireProject(ctx, account.projectId, need)), account };
}

export async function requireEntry(
  ctx: QueryCtx,
  entryId: Id<"financeEntries">,
  need: Need
): Promise<
  ProjectAccess & {
    account: Doc<"financeAccounts">;
    entry: Doc<"financeEntries">;
  }
> {
  const entry = await ctx.db.get(entryId);
  if (!entry) {
    throw new ConvexError("This entry doesn’t exist anymore.");
  }
  return { ...(await requireAccount(ctx, entry.accountId, need)), entry };
}

export async function requireRecurring(
  ctx: QueryCtx,
  recurringId: Id<"financeRecurring">,
  need: Need
): Promise<
  ProjectAccess & {
    account: Doc<"financeAccounts">;
    recurring: Doc<"financeRecurring">;
  }
> {
  const recurring = await ctx.db.get(recurringId);
  if (!recurring) {
    throw new ConvexError("This monthly entry doesn’t exist anymore.");
  }
  return {
    ...(await requireAccount(ctx, recurring.accountId, need)),
    recurring,
  };
}

export async function requireHabit(
  ctx: QueryCtx,
  habitId: Id<"habits">,
  need: Need
): Promise<ProjectAccess & { habit: Doc<"habits"> }> {
  const habit = await ctx.db.get(habitId);
  if (!habit) {
    throw new ConvexError("This habit doesn’t exist anymore.");
  }
  return { ...(await requireProject(ctx, habit.projectId, need)), habit };
}

/**
 * The access check's result, or null when the thing is gone or no longer
 * shared. Live queries for one card, record or board use it, so a screen open
 * while a teammate deletes it simply empties instead of failing.
 */
export async function ifVisible<T>(check: Promise<T>): Promise<T | null> {
  try {
    return await check;
  } catch (error) {
    if (error instanceof ConvexError) {
      return null;
    }
    throw error;
  }
}

/** Whether the user, active and on the project, may read it. */
export async function canSee(
  ctx: QueryCtx,
  userId: Id<"users">,
  projectId: Id<"projects">
): Promise<boolean> {
  const user = await ctx.db.get(userId);
  if (!user || user.deactivated) {
    return false;
  }
  const project = await ctx.db.get(projectId);
  return project !== null && (await roleIn(ctx, user, project)) !== null;
}
