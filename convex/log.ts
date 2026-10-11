import { ConvexError, v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import type { ProjectAccess } from "./lib/access";
import {
  ifVisible,
  requireProject,
  requireTopic,
  requireUser,
  visibleProjects,
} from "./lib/access";
import { vColor, vTopicIcon } from "./lib/validators";
import { addDays, isDay } from "./shared/habits";
import {
  LogStreak,
  MAX_LOG_NOTE,
  MAX_TOPICS,
  MAX_TOPIC_TITLE,
} from "./shared/log";
import { canManageRole } from "./shared/model";

/** A topic worked on during a day, as the log reads it. */
export interface LogDay {
  topicId: Id<"logTopics">;
  date: string;
  note: string;
}

export interface LogOverview {
  /** Days in a row anything was logged, up to today. */
  streak: number;
  /** The first day anything was logged, or null before then. */
  first: string | null;
}

/** Topics in every project the signed-in person can see, oldest first. */
export const topics = query({
  args: {},
  handler: async (ctx): Promise<Doc<"logTopics">[]> => {
    const user = await requireUser(ctx);
    const projects = await visibleProjects(ctx, user);
    const perProject = await Promise.all(
      projects.map(({ project }) =>
        ctx.db
          .query("logTopics")
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
 * What the project logged from `from` on, or only `topicId`'s; null once the
 * project is gone or no longer shared.
 */
export const days = query({
  args: {
    from: v.string(),
    projectId: v.id("projects"),
    topicId: v.optional(v.id("logTopics")),
  },
  handler: async (
    ctx,
    { from, projectId, topicId }
  ): Promise<LogDay[] | null> => {
    const access = await ifVisible(requireProject(ctx, projectId, "view"));
    if (!(access && isDay(from))) {
      return null;
    }
    const rows = topicId
      ? await ctx.db
          .query("logEntries")
          .withIndex("by_topic_and_date", (q) =>
            q.eq("topicId", topicId).gte("date", from)
          )
          .collect()
      : await ctx.db
          .query("logEntries")
          .withIndex("by_project_and_date", (q) =>
            q.eq("projectId", projectId).gte("date", from)
          )
          .collect();
    // A topic of another project reads as nothing logged.
    return rows
      .filter((row) => row.projectId === projectId)
      .map((row) => ({
        date: row.date,
        note: row.note,
        topicId: row.topicId,
      }));
  },
});

/** The project's run of days logged, up to `today`, and how far back it goes; null once out of reach. */
export const overview = query({
  args: { projectId: v.id("projects"), today: v.string() },
  handler: async (ctx, { projectId, today }): Promise<LogOverview | null> => {
    const access = await ifVisible(requireProject(ctx, projectId, "view"));
    if (!(access && isDay(today))) {
      return null;
    }
    const streak = new LogStreak(today);
    // Newest first, read only as far back as the run goes.
    const entries = ctx.db
      .query("logEntries")
      .withIndex("by_project_and_date", (q) =>
        q.eq("projectId", projectId).lte("date", today)
      )
      .order("desc");
    for await (const entry of entries) {
      if (!streak.add(entry.date)) {
        break;
      }
    }
    const first = await ctx.db
      .query("logEntries")
      .withIndex("by_project_and_date", (q) => q.eq("projectId", projectId))
      .first();
    return { first: first?.date ?? null, streak: streak.days };
  },
});

/** Today where the server is, as `YYYY-MM-DD`. */
function serverToday(): string {
  return new Date().toISOString().slice(0, 10);
}

/** A day that's been, or is today somewhere: time zones run up to a day ahead of the server. */
function cleanDate(date: string): string {
  if (!isDay(date)) {
    throw new ConvexError("That isn’t a day.");
  }
  if (date > addDays(serverToday(), 1)) {
    throw new ConvexError("That day hasn’t come yet.");
  }
  return date;
}

function cleanTitle(title: string): string {
  const trimmed = title.trim().slice(0, MAX_TOPIC_TITLE);
  if (!trimmed) {
    throw new ConvexError("Give the topic a name.");
  }
  return trimmed;
}

function cleanNote(note: string): string {
  return note.trim().slice(0, MAX_LOG_NOTE);
}

/** Whoever made the topic and the project's owners can change or delete it. */
function canManageTopic(
  access: ProjectAccess & { topic: Doc<"logTopics"> }
): boolean {
  return (
    canManageRole(access.role) || access.topic.createdBy === access.user._id
  );
}

/**
 * A project of the hub for a topic of `projectId` to stand for: one the person
 * can see, and no other topic there stands for yet.
 */
async function cleanLink(
  ctx: QueryCtx,
  projectId: Id<"projects">,
  linkedProjectId: Id<"projects">,
  topicId?: Id<"logTopics">
): Promise<Id<"projects">> {
  await requireProject(ctx, linkedProjectId, "view");
  const taken = await ctx.db
    .query("logTopics")
    .withIndex("by_project", (q) => q.eq("projectId", projectId))
    .collect();
  if (
    taken.some(
      (topic) =>
        topic.linkedProjectId === linkedProjectId && topic._id !== topicId
    )
  ) {
    throw new ConvexError("That project has a topic already.");
  }
  return linkedProjectId;
}

export const createTopic = mutation({
  args: {
    color: vColor,
    icon: vTopicIcon,
    linkedProjectId: v.optional(v.id("projects")),
    projectId: v.id("projects"),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    const { project, user } = await requireProject(ctx, args.projectId, "edit");
    if (!project.personalFor) {
      throw new ConvexError("The log lives in personal projects.");
    }
    const existing = await ctx.db
      .query("logTopics")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .take(MAX_TOPICS);
    if (existing.length >= MAX_TOPICS) {
      throw new ConvexError(`A log can have up to ${MAX_TOPICS} topics.`);
    }
    return await ctx.db.insert("logTopics", {
      color: args.color,
      createdBy: user._id,
      icon: args.icon,
      linkedProjectId: args.linkedProjectId
        ? await cleanLink(ctx, args.projectId, args.linkedProjectId)
        : undefined,
      projectId: args.projectId,
      title: cleanTitle(args.title),
    });
  },
});

export const updateTopic = mutation({
  args: {
    archived: v.optional(v.boolean()),
    color: v.optional(vColor),
    icon: v.optional(vTopicIcon),
    /** null stops it standing for a project. */
    linkedProjectId: v.optional(v.union(v.id("projects"), v.null())),
    title: v.optional(v.string()),
    topicId: v.id("logTopics"),
  },
  handler: async (ctx, { topicId, ...changes }) => {
    const access = await requireTopic(ctx, topicId, "edit");
    if (!canManageTopic(access)) {
      throw new ConvexError(
        "Only whoever made the topic and the project’s owners can change it."
      );
    }
    const patch: Partial<Doc<"logTopics">> = {};
    if (changes.title !== undefined) {
      patch.title = cleanTitle(changes.title);
    }
    if (changes.icon !== undefined) {
      patch.icon = changes.icon;
    }
    if (changes.color !== undefined) {
      patch.color = changes.color;
    }
    if (changes.archived !== undefined) {
      patch.archived = changes.archived || undefined;
    }
    if (changes.linkedProjectId !== undefined) {
      patch.linkedProjectId = changes.linkedProjectId
        ? await cleanLink(
            ctx,
            access.topic.projectId,
            changes.linkedProjectId,
            topicId
          )
        : undefined;
    }
    await ctx.db.patch(topicId, patch);
  },
});

/** Deletes the topic for everyone, with every day logged on it. */
export const removeTopic = mutation({
  args: { topicId: v.id("logTopics") },
  handler: async (ctx, { topicId }) => {
    const access = await requireTopic(ctx, topicId, "edit");
    if (!canManageTopic(access)) {
      throw new ConvexError(
        "Only whoever made the topic and the project’s owners can delete it."
      );
    }
    await ctx.db.delete(topicId);
    await ctx.scheduler.runAfter(0, internal.cleanup.logTopic, { topicId });
  },
});

/**
 * Marks the topic worked on during a day, with a line on what was done; a
 * note left out keeps the one there.
 */
export const log = mutation({
  args: {
    date: v.string(),
    note: v.optional(v.string()),
    topicId: v.id("logTopics"),
  },
  handler: async (ctx, { date, note, topicId }) => {
    const { topic } = await requireTopic(ctx, topicId, "edit");
    cleanDate(date);
    const existing = await ctx.db
      .query("logEntries")
      .withIndex("by_topic_and_date", (q) =>
        q.eq("topicId", topicId).eq("date", date)
      )
      .unique();
    if (existing) {
      if (note !== undefined) {
        await ctx.db.patch(existing._id, { note: cleanNote(note) });
      }
      return;
    }
    if (topic.archived) {
      throw new ConvexError("This topic is archived. Restore it to log it.");
    }
    await ctx.db.insert("logEntries", {
      date,
      note: cleanNote(note ?? ""),
      projectId: topic.projectId,
      topicId,
    });
  },
});

/** Clears the topic from a day, note and all. */
export const unlog = mutation({
  args: { date: v.string(), topicId: v.id("logTopics") },
  handler: async (ctx, { date, topicId }) => {
    await requireTopic(ctx, topicId, "edit");
    const existing = await ctx.db
      .query("logEntries")
      .withIndex("by_topic_and_date", (q) =>
        q.eq("topicId", topicId).eq("date", date)
      )
      .unique();
    if (existing) {
      await ctx.db.delete(existing._id);
    }
  },
});
