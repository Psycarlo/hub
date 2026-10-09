import { ConvexError, v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import type { ProjectAccess } from "./lib/access";
import {
  ifVisible,
  requireHabit,
  requireProject,
  requireUser,
  visibleProjects,
} from "./lib/access";
import { vColor, vHabitIcon } from "./lib/validators";
import {
  MAX_GOAL,
  MAX_HABITS,
  MAX_HABIT_DESCRIPTION,
  MAX_HABIT_TITLE,
  Streak,
  WEEKDAYS,
  addDays,
  isDay,
} from "./shared/habits";
import { canManageRole } from "./shared/model";

/** One day of a habit, as the grids read it. */
export interface HabitDay {
  habitId: Id<"habits">;
  date: string;
  count: number;
}

export interface HabitStreak {
  habitId: Id<"habits">;
  /** Days in a row it was done, up to today. */
  days: number;
}

/** Habits in every project the signed-in person can see, oldest first. */
export const list = query({
  args: {},
  handler: async (ctx): Promise<Doc<"habits">[]> => {
    const user = await requireUser(ctx);
    const projects = await visibleProjects(ctx, user);
    const perProject = await Promise.all(
      projects.map(({ project }) =>
        ctx.db
          .query("habits")
          .withIndex("by_project", (q) => q.eq("projectId", project._id))
          .collect()
      )
    );
    return perProject
      .flat()
      .toSorted((a, b) => a._creationTime - b._creationTime);
  },
});

/**
 * What the project's habits logged from `from` on, or only `habitId`'s; null
 * once the project is gone or no longer shared.
 */
export const days = query({
  args: {
    from: v.string(),
    habitId: v.optional(v.id("habits")),
    projectId: v.id("projects"),
  },
  handler: async (
    ctx,
    { from, habitId, projectId }
  ): Promise<HabitDay[] | null> => {
    const access = await ifVisible(requireProject(ctx, projectId, "view"));
    if (!(access && isDay(from))) {
      return null;
    }
    const rows = habitId
      ? await ctx.db
          .query("habitLogs")
          .withIndex("by_habit_and_date", (q) =>
            q.eq("habitId", habitId).gte("date", from)
          )
          .collect()
      : await ctx.db
          .query("habitLogs")
          .withIndex("by_project_and_date", (q) =>
            q.eq("projectId", projectId).gte("date", from)
          )
          .collect();
    // A habit of another project reads as nothing logged.
    return rows
      .filter((row) => row.projectId === projectId)
      .map((row) => ({
        count: row.count,
        date: row.date,
        habitId: row.habitId,
      }));
  },
});

/** Each of the project's habits' run of days done, up to `today`; null once out of reach. */
export const streaks = query({
  args: { projectId: v.id("projects"), today: v.string() },
  handler: async (ctx, { projectId, today }): Promise<HabitStreak[] | null> => {
    const access = await ifVisible(requireProject(ctx, projectId, "view"));
    if (!(access && isDay(today))) {
      return null;
    }
    const habits = await ctx.db
      .query("habits")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .collect();
    return await Promise.all(
      habits.map(async (habit) => {
        const streak = new Streak(habit, today);
        // Newest first, read only as far back as the run goes.
        const logs = ctx.db
          .query("habitLogs")
          .withIndex("by_habit_and_date", (q) =>
            q.eq("habitId", habit._id).lte("date", today)
          )
          .order("desc");
        for await (const log of logs) {
          if (!streak.add(log)) {
            break;
          }
        }
        return { days: streak.days, habitId: habit._id };
      })
    );
  },
});

/** Today where the server is, as `YYYY-MM-DD`. */
function serverToday(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * The person's own today. Time zones put it up to a day either side of the
 * server's; anything further is a clock gone wrong.
 */
function cleanToday(today: string): string {
  const server = serverToday();
  if (
    !isDay(today) ||
    today < addDays(server, -1) ||
    today > addDays(server, 1)
  ) {
    throw new ConvexError("Your device’s date looks off. Check its clock.");
  }
  return today;
}

function cleanTitle(title: string): string {
  const trimmed = title.trim().slice(0, MAX_HABIT_TITLE);
  if (!trimmed) {
    throw new ConvexError("Give the habit a name.");
  }
  return trimmed;
}

function cleanDays(weekdays: number[]): number[] {
  const picked = WEEKDAYS.filter((day) => weekdays.includes(day));
  if (picked.length === 0) {
    throw new ConvexError("Pick at least one day for the habit.");
  }
  if (picked.length !== new Set(weekdays).size) {
    throw new ConvexError("That isn’t a day of the week.");
  }
  return picked;
}

function cleanGoal(goal: number): number {
  if (!Number.isInteger(goal) || goal < 1 || goal > MAX_GOAL) {
    throw new ConvexError(`Set a goal of 1 to ${MAX_GOAL} times a day.`);
  }
  return goal;
}

/** Whoever made the habit and the project's owners can change or delete it. */
function canManageHabit(
  access: ProjectAccess & { habit: Doc<"habits"> }
): boolean {
  return (
    canManageRole(access.role) || access.habit.createdBy === access.user._id
  );
}

export const create = mutation({
  args: {
    color: vColor,
    days: v.array(v.number()),
    description: v.string(),
    goal: v.number(),
    icon: vHabitIcon,
    projectId: v.id("projects"),
    title: v.string(),
    /** The person's today, which the habit starts on. */
    today: v.string(),
  },
  handler: async (ctx, args) => {
    const { project, user } = await requireProject(ctx, args.projectId, "edit");
    if (!project.personalFor) {
      throw new ConvexError("Habits live in personal projects.");
    }
    const existing = await ctx.db
      .query("habits")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .take(MAX_HABITS);
    if (existing.length >= MAX_HABITS) {
      throw new ConvexError(`A project can have up to ${MAX_HABITS} habits.`);
    }
    return await ctx.db.insert("habits", {
      color: args.color,
      createdBy: user._id,
      days: cleanDays(args.days),
      description: args.description.trim().slice(0, MAX_HABIT_DESCRIPTION),
      goal: cleanGoal(args.goal),
      icon: args.icon,
      projectId: args.projectId,
      start: cleanToday(args.today),
      title: cleanTitle(args.title),
    });
  },
});

export const update = mutation({
  args: {
    color: v.optional(vColor),
    days: v.optional(v.array(v.number())),
    description: v.optional(v.string()),
    goal: v.optional(v.number()),
    habitId: v.id("habits"),
    icon: v.optional(vHabitIcon),
    title: v.optional(v.string()),
  },
  handler: async (ctx, { habitId, ...changes }) => {
    const access = await requireHabit(ctx, habitId, "edit");
    if (!canManageHabit(access)) {
      throw new ConvexError(
        "Only whoever made the habit and the project’s owners can change it."
      );
    }
    const patch: Partial<Doc<"habits">> = {};
    if (changes.title !== undefined) {
      patch.title = cleanTitle(changes.title);
    }
    if (changes.description !== undefined) {
      patch.description = changes.description
        .trim()
        .slice(0, MAX_HABIT_DESCRIPTION);
    }
    if (changes.icon !== undefined) {
      patch.icon = changes.icon;
    }
    if (changes.color !== undefined) {
      patch.color = changes.color;
    }
    if (changes.days !== undefined) {
      patch.days = cleanDays(changes.days);
    }
    if (changes.goal !== undefined) {
      patch.goal = cleanGoal(changes.goal);
    }
    await ctx.db.patch(habitId, patch);
  },
});

/** Deletes the habit for everyone, with every day logged on it. */
export const remove = mutation({
  args: { habitId: v.id("habits") },
  handler: async (ctx, { habitId }) => {
    const access = await requireHabit(ctx, habitId, "edit");
    if (!canManageHabit(access)) {
      throw new ConvexError(
        "Only whoever made the habit and the project’s owners can delete it."
      );
    }
    await ctx.db.delete(habitId);
    await ctx.scheduler.runAfter(0, internal.cleanup.habit, { habitId });
  },
});

/** Sets how many times the habit was done on a day; 0 clears the day. */
export const log = mutation({
  args: { count: v.number(), date: v.string(), habitId: v.id("habits") },
  handler: async (ctx, { count, date, habitId }) => {
    const { habit } = await requireHabit(ctx, habitId, "edit");
    if (!isDay(date)) {
      throw new ConvexError("That isn’t a day.");
    }
    if (date < habit.start) {
      throw new ConvexError("The habit hadn’t started yet that day.");
    }
    if (date > addDays(serverToday(), 1)) {
      throw new ConvexError("That day hasn’t come yet.");
    }
    if (!Number.isInteger(count) || count < 0 || count > habit.goal) {
      throw new ConvexError(`Log 0 to ${habit.goal} times.`);
    }
    const existing = await ctx.db
      .query("habitLogs")
      .withIndex("by_habit_and_date", (q) =>
        q.eq("habitId", habitId).eq("date", date)
      )
      .unique();
    if (count === 0) {
      if (existing) {
        await ctx.db.delete(existing._id);
      }
    } else if (existing) {
      await ctx.db.patch(existing._id, { count });
    } else {
      await ctx.db.insert("habitLogs", {
        count,
        date,
        habitId,
        projectId: habit.projectId,
      });
    }
  },
});
