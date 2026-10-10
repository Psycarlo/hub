import { ConvexError, v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { deletePage } from "./cleanup";
import {
  canSee,
  ifVisible,
  requirePage,
  requireProject,
  requireUser,
  visibleProjects,
} from "./lib/access";
import { mentionExcerpt, pageExcerpt } from "./shared/docs";
import { mentionedUsers } from "./shared/mentions";
import { mergeText } from "./shared/merge";
import { rankBetween } from "./shared/model";

/** Texts kept per page, to merge edits made from an older one. */
const KEEP_REVISIONS = 50;
const MAX_TITLE = 300;
const MAX_CONTENT = 500_000;

export interface PageSummary {
  _id: Id<"docPages">;
  _creationTime: number;
  projectId: Id<"projects">;
  parentId?: Id<"docPages">;
  title: string;
  icon: string;
  rank: number;
  excerpt: string;
  hasContent: boolean;
  updatedAt: number;
}

function summary(page: Doc<"docPages">): PageSummary {
  return {
    _creationTime: page._creationTime,
    _id: page._id,
    excerpt: page.excerpt,
    hasContent: page.content.trim() !== "",
    icon: page.icon,
    parentId: page.parentId,
    projectId: page.projectId,
    rank: page.rank,
    title: page.title,
    updatedAt: page.updatedAt,
  };
}

/** Every page of every project the signed-in person can see, without their text. */
export const tree = query({
  args: {},
  handler: async (ctx): Promise<PageSummary[]> => {
    const user = await requireUser(ctx);
    const projects = await visibleProjects(ctx, user);
    const pages = await Promise.all(
      projects.map(({ project }) =>
        ctx.db
          .query("docPages")
          .withIndex("by_project", (q) => q.eq("projectId", project._id))
          .collect()
      )
    );
    return pages.flat().map(summary);
  },
});

/** One page with its text, or null once it's deleted. */
export const get = query({
  args: { pageId: v.id("docPages") },
  handler: async (ctx, { pageId }) => {
    const access = await ifVisible(requirePage(ctx, pageId, "view"));
    return access?.page ?? null;
  },
});

/**
 * Everyone the text newly mentions who can see the page gets a notification;
 * anyone it no longer mentions loses theirs.
 */
async function notifyMentions(
  ctx: MutationCtx,
  page: Pick<Doc<"docPages">, "_id" | "projectId">,
  actorId: Id<"users">,
  before: string,
  after: string
): Promise<void> {
  const was = mentionedUsers(before);
  const now = mentionedUsers(after);
  for (const mentioned of was.filter((id) => !now.includes(id))) {
    const userId = ctx.db.normalizeId("users", mentioned);
    if (!userId) {
      continue;
    }
    const gone = await ctx.db
      .query("notifications")
      .withIndex("by_page_and_user", (q) =>
        q.eq("pageId", page._id).eq("userId", userId)
      )
      .collect();
    for (const notification of gone) {
      await ctx.db.delete(notification._id);
    }
  }
  for (const mentioned of now.filter((id) => !was.includes(id))) {
    const userId = ctx.db.normalizeId("users", mentioned);
    if (
      userId &&
      userId !== actorId &&
      (await canSee(ctx, userId, page.projectId))
    ) {
      await ctx.db.insert("notifications", {
        actorId,
        archived: false,
        content: mentionExcerpt(after, mentioned),
        pageId: page._id,
        read: false,
        userId,
      });
    }
  }
}

async function siblings(
  ctx: QueryCtx,
  projectId: Id<"projects">,
  parentId: Id<"docPages"> | undefined
): Promise<Doc<"docPages">[]> {
  const pages = await (
    parentId
      ? ctx.db
          .query("docPages")
          .withIndex("by_parent", (q) => q.eq("parentId", parentId))
      : ctx.db.query("docPages").withIndex("by_project_and_parent", (q) =>
          // oxlint-disable-next-line unicorn/no-useless-undefined -- Convex matches a missing field by undefined
          q.eq("projectId", projectId).eq("parentId", undefined)
        )
  ).collect();
  return pages.toSorted(
    (a, b) => a.rank - b.rank || a._creationTime - b._creationTime
  );
}

async function checkParent(
  ctx: QueryCtx,
  projectId: Id<"projects">,
  parentId: Id<"docPages"> | undefined
): Promise<void> {
  if (!parentId) {
    return;
  }
  const parent = await ctx.db.get(parentId);
  if (parent?.projectId !== projectId) {
    throw new ConvexError("That page isn’t in this project.");
  }
}

/** Starts a page, last under its parent. */
export const create = mutation({
  args: {
    content: v.optional(v.string()),
    icon: v.optional(v.string()),
    parentId: v.optional(v.id("docPages")),
    projectId: v.id("projects"),
    title: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await requireProject(ctx, args.projectId, "edit");
    await checkParent(ctx, args.projectId, args.parentId);
    const above = await siblings(ctx, args.projectId, args.parentId);
    const content = (args.content ?? "").slice(0, MAX_CONTENT);
    const now = Date.now();
    const pageId = await ctx.db.insert("docPages", {
      content,
      createdBy: user._id,
      excerpt: pageExcerpt(content),
      icon: args.icon ?? "",
      parentId: args.parentId,
      projectId: args.projectId,
      rank: (above.at(-1)?.rank ?? 0) + 1,
      revision: 1,
      title: (args.title ?? "").slice(0, MAX_TITLE),
      updatedAt: now,
      updatedBy: user._id,
    });
    await ctx.db.insert("docRevisions", {
      authorId: user._id,
      content,
      pageId,
      revision: 1,
    });
    await notifyMentions(
      ctx,
      { _id: pageId, projectId: args.projectId },
      user._id,
      "",
      content
    );
    return pageId;
  },
});

/** Changes the title or icon, which aren't merged like the text. */
export const update = mutation({
  args: {
    icon: v.optional(v.string()),
    pageId: v.id("docPages"),
    title: v.optional(v.string()),
  },
  handler: async (ctx, { pageId, icon, title }) => {
    const { user } = await requirePage(ctx, pageId, "edit");
    const patch: Partial<Doc<"docPages">> = {
      updatedAt: Date.now(),
      updatedBy: user._id,
    };
    if (icon !== undefined) {
      patch.icon = icon.trim().slice(0, 16);
    }
    if (title !== undefined) {
      patch.title = title.replaceAll("\n", " ").slice(0, MAX_TITLE);
    }
    await ctx.db.patch(pageId, patch);
  },
});

async function prune(ctx: MutationCtx, pageId: Id<"docPages">, upTo: number) {
  const old = await ctx.db
    .query("docRevisions")
    .withIndex("by_page_and_revision", (q) =>
      q.eq("pageId", pageId).lte("revision", upTo - KEEP_REVISIONS)
    )
    .take(20);
  for (const revision of old) {
    await ctx.db.delete(revision._id);
  }
}

/**
 * Saves the text as edited from revision `base`. When someone saved in
 * between, both edits are merged line by line from that base, so neither
 * side's changes to other lines are lost. The merged text comes back.
 */
export const save = mutation({
  args: {
    base: v.number(),
    content: v.string(),
    pageId: v.id("docPages"),
  },
  handler: async (ctx, { pageId, base, content }) => {
    const { page, user } = await requirePage(ctx, pageId, "edit");
    const mine = content.slice(0, MAX_CONTENT);
    let merged = mine;
    if (base !== page.revision) {
      const from = await ctx.db
        .query("docRevisions")
        .withIndex("by_page_and_revision", (q) =>
          q.eq("pageId", pageId).eq("revision", base)
        )
        .unique();
      // Too old to place: the newest save wins, as with any plain overwrite.
      merged = from ? mergeText(from.content, mine, page.content, true) : mine;
    }
    if (merged === page.content) {
      return { content: page.content, revision: page.revision };
    }
    const revision = page.revision + 1;
    await ctx.db.patch(pageId, {
      content: merged,
      excerpt: pageExcerpt(merged),
      revision,
      updatedAt: Date.now(),
      updatedBy: user._id,
    });
    await ctx.db.insert("docRevisions", {
      authorId: user._id,
      content: merged,
      pageId,
      revision,
    });
    await prune(ctx, pageId, revision);
    await notifyMentions(ctx, page, user._id, page.content, merged);
    return { content: merged, revision };
  },
});

/**
 * Moves the page under `parentId` (or to the top), between the pages
 * `beforeId` and `afterId` there, or last when neither is given.
 */
export const move = mutation({
  args: {
    afterId: v.optional(v.id("docPages")),
    beforeId: v.optional(v.id("docPages")),
    pageId: v.id("docPages"),
    parentId: v.union(v.id("docPages"), v.null()),
  },
  handler: async (ctx, { pageId, parentId, beforeId, afterId }) => {
    const { page } = await requirePage(ctx, pageId, "edit");
    const parent = parentId ?? undefined;
    await checkParent(ctx, page.projectId, parent);
    // A page never goes under itself, however deep.
    for (let id = parent; id;) {
      if (id === pageId) {
        throw new ConvexError("A page can’t go inside itself.");
      }
      const above = await ctx.db.get(id);
      id = above?.parentId;
    }
    // Neighbours only count when they sit where the page goes.
    const neighbour = async (id: Id<"docPages"> | undefined) => {
      const found = id ? await ctx.db.get(id) : null;
      return found?.projectId === page.projectId && found.parentId === parent
        ? found
        : null;
    };
    const before = await neighbour(beforeId);
    const after = await neighbour(afterId);
    let rank: number;
    if (before || after) {
      rank = rankBetween(before?.rank, after?.rank);
    } else {
      const around = await siblings(ctx, page.projectId, parent);
      const others = around.filter((item) => item._id !== pageId);
      rank = (others.at(-1)?.rank ?? 0) + 1;
    }
    await ctx.db.patch(pageId, { parentId: parent, rank });
  },
});

/** Deletes the page and every page under it. */
export const remove = mutation({
  args: { pageId: v.id("docPages") },
  handler: async (ctx, { pageId }) => {
    await requirePage(ctx, pageId, "edit");
    const doomed: Id<"docPages">[] = [];
    const queue: Id<"docPages">[] = [pageId];
    while (queue.length > 0) {
      const id = queue.shift();
      if (!id) {
        break;
      }
      doomed.push(id);
      const children = await ctx.db
        .query("docPages")
        .withIndex("by_parent", (q) => q.eq("parentId", id))
        .collect();
      queue.push(...children.map((child) => child._id));
    }
    for (const id of doomed) {
      await deletePage(ctx, id);
    }
  },
});
