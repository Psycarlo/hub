import {
  getAuthUserId,
  invalidateSessions,
  modifyAccountCredentials,
  retrieveAccount,
} from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { isAdmin, requireAdmin, requireUser } from "./lib/access";
import { mediaUrl } from "./lib/media";
import { vAppRole } from "./lib/validators";
import { r2 } from "./r2";

const MIN_PASSWORD = 8;
const MAX_NAME = 80;

export interface UserView {
  _id: Id<"users">;
  name: string;
  email: string;
  image?: string;
  role: "admin" | "member";
  deactivated: boolean;
}

function displayName(user: Doc<"users">): string {
  return user.name?.trim() || user.email?.split("@")[0] || "Someone";
}

export function toUserView(user: Doc<"users">): UserView {
  return {
    _id: user._id,
    deactivated: user.deactivated ?? false,
    email: user.email ?? "",
    image: user.avatarKey ? mediaUrl(user.avatarKey) : undefined,
    name: displayName(user),
    role: user.role ?? "member",
  };
}

/** The signed-in person, also when their access was taken away. */
export const me = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    const user = userId ? await ctx.db.get(userId) : null;
    return user ? toUserView(user) : null;
  },
});

/** Whether the hub has no accounts yet, so the first one sets it up. */
export const fresh = query({
  args: {},
  handler: async (ctx) => (await ctx.db.query("users").first()) === null,
});

/** Everyone with an account, to show names and pick people. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    const users = await ctx.db.query("users").collect();
    return users
      .map(toUserView)
      .toSorted((a, b) => a.name.localeCompare(b.name));
  },
});

export const updateProfile = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const user = await requireUser(ctx);
    const trimmed = name.trim().slice(0, MAX_NAME);
    if (!trimmed) {
      throw new ConvexError("Enter a name.");
    }
    await ctx.db.patch(user._id, { name: trimmed });
  },
});

async function ownedFile(ctx: QueryCtx, key: string, owner: Id<"users">) {
  const file = await ctx.db
    .query("files")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  if (file?.ownerId !== owner) {
    throw new ConvexError("That upload couldn’t be found.");
  }
  return file;
}

async function dropFile(ctx: MutationCtx, key: string) {
  const file = await ctx.db
    .query("files")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  if (file) {
    await ctx.db.delete(file._id);
  }
  await r2.deleteObject(ctx, key);
}

/** Sets the profile photo to an uploaded file, or removes it. */
export const setAvatar = mutation({
  args: { key: v.union(v.string(), v.null()) },
  handler: async (ctx, { key }) => {
    const user = await requireUser(ctx);
    if (key) {
      await ownedFile(ctx, key, user._id);
    }
    const previous = user.avatarKey;
    await ctx.db.patch(user._id, { avatarKey: key ?? undefined });
    if (previous && previous !== key) {
      await dropFile(ctx, previous);
    }
  },
});

export const passwordAccount = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const account = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) =>
        q.eq("userId", userId).eq("provider", "password")
      )
      .unique();
    return account ? { email: account.providerAccountId } : null;
  },
});

export const actor = internalQuery({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    return { _id: user._id, admin: isAdmin(user) };
  },
});

function checkPassword(password: string) {
  if (password.length < MIN_PASSWORD) {
    throw new ConvexError(
      `Use at least ${MIN_PASSWORD} characters for the password.`
    );
  }
}

/** Changes the signed-in person's password, after checking the current one. */
export const changePassword = action({
  args: { current: v.string(), next: v.string() },
  handler: async (ctx, { current, next }) => {
    const self: { _id: Id<"users"> } = await ctx.runQuery(
      internal.users.actor,
      {}
    );
    const account: { email: string } | null = await ctx.runQuery(
      internal.users.passwordAccount,
      { userId: self._id }
    );
    if (!account) {
      throw new ConvexError("This account has no password.");
    }
    checkPassword(next);
    try {
      await retrieveAccount(ctx, {
        account: { id: account.email, secret: current },
        provider: "password",
      });
    } catch {
      throw new ConvexError("The current password isn’t right.");
    }
    await modifyAccountCredentials(ctx, {
      account: { id: account.email, secret: next },
      provider: "password",
    });
  },
});

/** Lets an admin set someone's password, since the hub sends no reset emails. */
export const setPassword = action({
  args: { password: v.string(), userId: v.id("users") },
  handler: async (ctx, { password, userId }) => {
    const self: { admin: boolean } = await ctx.runQuery(
      internal.users.actor,
      {}
    );
    if (!self.admin) {
      throw new ConvexError("Only admins can do this.");
    }
    const account: { email: string } | null = await ctx.runQuery(
      internal.users.passwordAccount,
      { userId }
    );
    if (!account) {
      throw new ConvexError("This person has no password to change.");
    }
    checkPassword(password);
    await modifyAccountCredentials(ctx, {
      account: { id: account.email, secret: password },
      provider: "password",
    });
    await invalidateSessions(ctx, { userId });
  },
});

async function otherAdmins(ctx: QueryCtx, except: Id<"users">) {
  const users = await ctx.db.query("users").collect();
  return users.filter(
    (user) => user._id !== except && isAdmin(user) && !user.deactivated
  ).length;
}

export const setRole = mutation({
  args: { role: vAppRole, userId: v.id("users") },
  handler: async (ctx, { role, userId }) => {
    await requireAdmin(ctx);
    const user = await ctx.db.get(userId);
    if (!user) {
      throw new ConvexError("This person doesn’t exist anymore.");
    }
    if (role === "member" && (await otherAdmins(ctx, userId)) === 0) {
      throw new ConvexError("The hub needs at least one admin.");
    }
    await ctx.db.patch(userId, { role });
  },
});

export const endSessions = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const sessions = await ctx.db
      .query("authSessions")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .collect();
    for (const session of sessions) {
      const tokens = await ctx.db
        .query("authRefreshTokens")
        .withIndex("sessionId", (q) => q.eq("sessionId", session._id))
        .collect();
      for (const token of tokens) {
        await ctx.db.delete(token._id);
      }
      await ctx.db.delete(session._id);
    }
  },
});

/** Takes someone's access away: they're signed out and leave every project. */
export const deactivate = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const admin = await requireAdmin(ctx);
    if (userId === admin._id) {
      throw new ConvexError("You can’t remove your own access.");
    }
    const user = await ctx.db.get(userId);
    if (!user) {
      throw new ConvexError("This person doesn’t exist anymore.");
    }
    const memberships = await ctx.db
      .query("projectMembers")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const membership of memberships) {
      const project = await ctx.db.get(membership.projectId);
      // Their own project stays theirs, should their access come back.
      if (project?.personalFor !== userId) {
        await ctx.db.delete(membership._id);
      }
    }
    await ctx.db.patch(userId, { deactivated: true, role: "member" });
    await ctx.scheduler.runAfter(0, internal.users.endSessions, { userId });
  },
});

export const reactivate = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    await requireAdmin(ctx);
    const user = await ctx.db.get(userId);
    if (!user) {
      throw new ConvexError("This person doesn’t exist anymore.");
    }
    await ctx.db.patch(userId, { deactivated: false });
  },
});
