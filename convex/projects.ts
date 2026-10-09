import { ConvexError, v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { insertBoard } from "./boards";
import {
  isAdmin,
  requireAdmin,
  requireProject,
  requireUser,
  visibleProjects,
} from "./lib/access";
import { vMember, vProjectColor } from "./lib/validators";
import type { ProjectRole } from "./shared/model";
import { COLORS, isHexColor } from "./shared/palette";
import { slugify, uniqueSlug } from "./shared/slug";

const MAX_TITLE = 80;
const MAX_DESCRIPTION = 500;
/** What everyone's own project is called, by its owner. */
export const PERSONAL_TITLE = "Personal";

export interface ProjectMember {
  userId: Id<"users">;
  role: ProjectRole;
}

export interface ProjectView {
  _id: Id<"projects">;
  _creationTime: number;
  title: string;
  slug: string;
  /** Links the project went by before, which still lead to it. */
  formerSlugs?: string[];
  description: string;
  color: Doc<"projects">["color"];
  createdBy: Id<"users">;
  /** What the signed-in person can do here. */
  role: ProjectRole;
  /** The people assigned to the project, owners first. */
  members: ProjectMember[];
  /** Whose personal project this is, if it's one. */
  personalFor?: Id<"users">;
}

const ROLE_ORDER: Record<ProjectRole, number> = {
  editor: 1,
  owner: 0,
  viewer: 2,
};

async function membersOf(
  ctx: QueryCtx,
  projectId: Id<"projects">
): Promise<ProjectMember[]> {
  const rows = await ctx.db
    .query("projectMembers")
    .withIndex("by_project", (q) => q.eq("projectId", projectId))
    .collect();
  return rows
    .toSorted(
      (a, b) =>
        ROLE_ORDER[a.role] - ROLE_ORDER[b.role] ||
        a._creationTime - b._creationTime
    )
    .map(({ userId, role }) => ({ role, userId }));
}

/** "Personal" to its owner; to the people they share it with, whose it is. */
async function titleFor(
  ctx: QueryCtx,
  project: Doc<"projects">,
  viewer: Id<"users">
): Promise<string> {
  if (!project.personalFor || project.personalFor === viewer) {
    return project.title;
  }
  const owner = await ctx.db.get(project.personalFor);
  const name = owner?.name?.trim() || owner?.email?.split("@")[0];
  return name ? `${PERSONAL_TITLE} · ${name}` : PERSONAL_TITLE;
}

/** A link like `/p/ana-personal`, free across the hub. */
async function personalSlug(
  ctx: QueryCtx,
  user: Doc<"users">
): Promise<string> {
  const first = slugify(
    user.name?.split(" ")[0] ?? user.email?.split("@")[0] ?? ""
  );
  const base = first ? `${first}-personal` : "personal";
  // Old links too, so they keep leading to the project that had them.
  const projects = await ctx.db.query("projects").collect();
  return uniqueSlug(
    base,
    projects.flatMap((project) => [
      project.slug,
      ...(project.formerSlugs ?? []),
    ])
  );
}

/**
 * The person's own project, made the first time they need it. Running it
 * again puts back the owner's place on it, should it have gone missing.
 */
export async function ensurePersonalProject(
  ctx: MutationCtx,
  user: Doc<"users">
): Promise<Doc<"projects">> {
  const existing = await ctx.db
    .query("projects")
    .withIndex("by_personal_for", (q) => q.eq("personalFor", user._id))
    .first();
  const project =
    existing ??
    (await ctx.db.get(
      await ctx.db.insert("projects", {
        color: "blue",
        createdBy: user._id,
        description: "",
        personalFor: user._id,
        slug: await personalSlug(ctx, user),
        title: PERSONAL_TITLE,
      })
    ));
  if (!project) {
    throw new ConvexError("The personal project couldn’t be made.");
  }
  const place = await ctx.db
    .query("projectMembers")
    .withIndex("by_project_and_user", (q) =>
      q.eq("projectId", project._id).eq("userId", user._id)
    )
    .unique();
  if (!place) {
    await ctx.db.insert("projectMembers", {
      projectId: project._id,
      role: "owner",
      userId: user._id,
    });
  } else if (place.role !== "owner") {
    await ctx.db.patch(place._id, { role: "owner" });
  }
  return project;
}

/** Makes sure the signed-in person has their personal project. */
export const ensurePersonal = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const project = await ensurePersonalProject(ctx, user);
    return project._id;
  },
});

/** Projects the signed-in person can see, with their role and people. */
export const list = query({
  args: {},
  handler: async (ctx): Promise<ProjectView[]> => {
    const user = await requireUser(ctx);
    const visible = await visibleProjects(ctx, user);
    const views = await Promise.all(
      visible.map(async ({ project, role }) => ({
        _creationTime: project._creationTime,
        _id: project._id,
        color: project.color,
        createdBy: project.createdBy,
        description: project.description,
        formerSlugs: project.formerSlugs,
        members: await membersOf(ctx, project._id),
        personalFor: project.personalFor,
        role,
        slug: project.slug,
        title: await titleFor(ctx, project, user._id),
      }))
    );
    return views.toSorted(
      (a, b) => a.title.localeCompare(b.title) || a._id.localeCompare(b._id)
    );
  },
});

/** Every project link in use, so a new one can be checked as it's typed. */
export const slugs = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    if (!isAdmin(user)) {
      return [];
    }
    const projects = await ctx.db.query("projects").collect();
    return projects.map((project) => ({
      _id: project._id,
      formerSlugs: project.formerSlugs ?? [],
      slug: project.slug,
    }));
  },
});

function cleanTitle(title: string): string {
  const trimmed = title.trim().slice(0, MAX_TITLE);
  if (!trimmed) {
    throw new ConvexError("Give the project a name.");
  }
  return trimmed;
}

/** A palette color as it is, or a picked one as lowercase `#rrggbb`. */
function cleanColor(color: string): Doc<"projects">["color"] {
  const hex = color.toLowerCase();
  if (isHexColor(hex)) {
    return hex;
  }
  const named = COLORS.find((item) => item === color);
  if (!named) {
    throw new ConvexError(
      "Pick a color from the palette, or a hex like #2b7fff."
    );
  }
  return named;
}

async function freeSlug(
  ctx: QueryCtx,
  raw: string,
  except?: Id<"projects">
): Promise<string> {
  const slug = slugify(raw);
  if (!slug) {
    throw new ConvexError("The link needs letters or numbers.");
  }
  const taken = await ctx.db
    .query("projects")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .first();
  if (taken && taken._id !== except) {
    throw new ConvexError("Another project uses this link.");
  }
  // Few projects, so a scan beats keeping an index of old links.
  const projects = await ctx.db.query("projects").collect();
  if (
    projects.some(
      (project) => project._id !== except && project.formerSlugs?.includes(slug)
    )
  ) {
    throw new ConvexError("Another project’s old links use this link.");
  }
  return slug;
}

async function setMembers(
  ctx: MutationCtx,
  projectId: Id<"projects">,
  members: ProjectMember[]
): Promise<void> {
  const wanted = new Map<Id<"users">, ProjectRole>();
  for (const member of members) {
    const user = await ctx.db.get(member.userId);
    if (!user || user.deactivated) {
      throw new ConvexError("Someone on the list no longer has an account.");
    }
    wanted.set(member.userId, member.role);
  }
  const current = await ctx.db
    .query("projectMembers")
    .withIndex("by_project", (q) => q.eq("projectId", projectId))
    .collect();
  for (const row of current) {
    const role = wanted.get(row.userId);
    if (role === undefined) {
      await ctx.db.delete(row._id);
    } else if (role !== row.role) {
      await ctx.db.patch(row._id, { role });
    }
    wanted.delete(row.userId);
  }
  for (const [userId, role] of wanted) {
    await ctx.db.insert("projectMembers", { projectId, role, userId });
  }
}

export const create = mutation({
  args: {
    /** A board the project starts with. */
    board: v.optional(v.object({ code: v.string(), title: v.string() })),
    color: vProjectColor,
    description: v.string(),
    members: v.array(vMember),
    slug: v.string(),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireAdmin(ctx);
    const slug = await freeSlug(ctx, args.slug);
    const projectId = await ctx.db.insert("projects", {
      color: cleanColor(args.color),
      createdBy: user._id,
      description: args.description.trim().slice(0, MAX_DESCRIPTION),
      slug,
      title: cleanTitle(args.title),
    });
    const members = args.members.some((member) => member.userId === user._id)
      ? args.members
      : [{ role: "owner" as const, userId: user._id }, ...args.members];
    await setMembers(ctx, projectId, members);
    if (args.board) {
      await insertBoard(ctx, {
        ...args.board,
        createdBy: user._id,
        description: "",
        projectId,
      });
    }
    return { _id: projectId, slug };
  },
});

export const update = mutation({
  args: {
    color: v.optional(vProjectColor),
    description: v.optional(v.string()),
    members: v.optional(v.array(vMember)),
    projectId: v.id("projects"),
    slug: v.optional(v.string()),
    title: v.optional(v.string()),
  },
  handler: async (ctx, { projectId, members, ...changes }) => {
    const { project, user } = await requireProject(ctx, projectId, "manage");
    const personal = project.personalFor;
    const patch: Partial<Doc<"projects">> = {};
    // A personal project keeps its name and link.
    if (changes.title !== undefined && !personal) {
      patch.title = cleanTitle(changes.title);
    }
    if (
      changes.slug !== undefined &&
      slugify(changes.slug) !== project.slug &&
      !personal
    ) {
      const slug = await freeSlug(ctx, changes.slug, projectId);
      patch.slug = slug;
      // Links shared under the old one keep finding the project.
      patch.formerSlugs = [
        ...(project.formerSlugs ?? []).filter((former) => former !== slug),
        project.slug,
      ];
    }
    if (changes.description !== undefined) {
      patch.description = changes.description.trim().slice(0, MAX_DESCRIPTION);
    }
    if (changes.color !== undefined) {
      patch.color = cleanColor(changes.color);
    }
    await ctx.db.patch(projectId, patch);
    if (members && personal) {
      // Its owner stays its only owner; everyone else can edit or view.
      await setMembers(ctx, projectId, [
        { role: "owner", userId: personal },
        ...members
          .filter((member) => member.userId !== personal)
          .map((member) => ({
            role: member.role === "owner" ? ("editor" as const) : member.role,
            userId: member.userId,
          })),
      ]);
    } else if (members) {
      // Owners who aren't admins keep their own place, or they'd lock themselves out.
      const own = members.find((member) => member.userId === user._id);
      if (!isAdmin(user) && own?.role !== "owner") {
        throw new ConvexError("You can’t remove yourself as an owner.");
      }
      await setMembers(ctx, projectId, members);
    }
    return { slug: patch.slug ?? project.slug };
  },
});

/** Deletes the project for everyone, with its boards, tables, docs, portfolios and finance. */
export const remove = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const { project } = await requireProject(ctx, projectId, "manage");
    if (project.personalFor) {
      throw new ConvexError("A personal project can’t be deleted.");
    }
    const members = await ctx.db
      .query("projectMembers")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .collect();
    for (const member of members) {
      await ctx.db.delete(member._id);
    }
    await ctx.db.delete(projectId);
    await ctx.scheduler.runAfter(0, internal.cleanup.project, { projectId });
  },
});
