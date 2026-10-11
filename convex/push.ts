/**
 * The browsers news is pushed to, and what each push says. The pushing itself
 * runs in Node, in delivery.ts.
 */
import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import type { InboxItem } from "./inbox";
import { itemOf, lookupsFor } from "./inbox";
import { requireUser } from "./lib/access";
import { env } from "./lib/env";
import { localTime } from "./lib/timezones";
import { mentionedUsers } from "./shared/mentions";
import { notificationMessage } from "./shared/notifications";
import { displayName } from "./users";

/** The key browsers subscribe with, or null when the deployment can't push. */
export const config = query({
  args: {},
  handler: (): string | null => {
    const publicKey = env("VAPID_PUBLIC_KEY");
    return publicKey && env("VAPID_PRIVATE_KEY") ? publicKey : null;
  },
});

/** Pushes the signed-in person's news to this browser. */
export const register = mutation({
  args: {
    endpoint: v.string(),
    keys: v.object({ auth: v.string(), p256dh: v.string() }),
  },
  handler: async (ctx, { endpoint, keys }) => {
    const user = await requireUser(ctx);
    const device = await ctx.db
      .query("pushDevices")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", endpoint))
      .unique();
    // A browser someone else signed out of is pushed to whoever's signed in now.
    await (device
      ? ctx.db.patch(device._id, { keys, userId: user._id })
      : ctx.db.insert("pushDevices", { endpoint, keys, userId: user._id }));
  },
});

/** Stops pushing to this browser. */
export const unregister = mutation({
  args: { endpoint: v.string() },
  handler: async (ctx, { endpoint }) => {
    const user = await requireUser(ctx);
    const device = await ctx.db
      .query("pushDevices")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", endpoint))
      .unique();
    if (device?.userId === user._id) {
      await ctx.db.delete(device._id);
    }
  },
});

/** One push per subject: a newer one replaces the last on the device. */
function tagOf(item: InboxItem): string {
  switch (item.kind) {
    case "card": {
      return `card:${item.card._id}`;
    }
    case "page": {
      return `page:${item.page._id}`;
    }
    case "file": {
      return `file:${item.file._id}`;
    }
    default: {
      return `project:${item.project._id}`;
    }
  }
}

/** Display names of the people the item mentions or names, by id. */
async function namesFor(
  ctx: QueryCtx,
  ids: string[]
): Promise<(userId: string) => string> {
  const names = new Map<string, string>();
  for (const id of new Set(ids)) {
    const userId = ctx.db.normalizeId("users", id);
    const user = userId ? await ctx.db.get(userId) : null;
    if (user) {
      names.set(id, displayName(user));
    }
  }
  return (userId) => names.get(userId) ?? "Someone";
}

/** Every user id in the item: whoever did it, whoever a change was about, and mentions. */
function peopleIn(item: InboxItem): string[] {
  const people: string[] = item.actorId ? [item.actorId] : [];
  if (item.kind === "card") {
    for (const change of item.changes ?? []) {
      if (change.kind === "assignees") {
        people.push(...change.from, ...change.to);
      }
    }
  }
  if ("content" in item && item.content) {
    people.push(...mentionedUsers(item.content));
  }
  return people;
}

async function today(ctx: QueryCtx, userId: Id<"users">): Promise<string> {
  const avatar = await ctx.db
    .query("officeAvatars")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();
  return localTime(avatar?.timeZone ?? "UTC", Date.now()).date;
}

/**
 * What to push for the notification, and where to, or null when it shouldn't
 * go out anymore: read, archived, gone, or a later push replaced it.
 */
export const message = internalQuery({
  args: { at: v.number(), notificationId: v.id("notifications") },
  handler: async (ctx, { at, notificationId }) => {
    const notification = await ctx.db.get(notificationId);
    if (
      !notification ||
      notification.read ||
      notification.archived ||
      notification.pushAt !== at
    ) {
      return null;
    }
    const user = await ctx.db.get(notification.userId);
    if (!user || user.deactivated) {
      return null;
    }
    const item = await itemOf(ctx, lookupsFor(ctx, user), notification);
    if (!item) {
      return null;
    }
    const rows = await ctx.db
      .query("pushDevices")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    const devices: Pick<Doc<"pushDevices">, "endpoint" | "keys">[] = rows.map(
      ({ endpoint, keys }) => ({ endpoint, keys })
    );
    const names = await namesFor(ctx, peopleIn(item));
    const { body, title } = notificationMessage(
      item,
      user._id,
      names,
      await today(ctx, user._id)
    );
    return {
      devices,
      payload: {
        body,
        /** Opens the inbox at the notification, which leads on to where it's about. */
        path: `/inbox?open=${notificationId}`,
        tag: tagOf(item),
        title,
      },
    };
  },
});

/** Notes the push went out, and forgets devices the push service said are gone. */
export const sent = internalMutation({
  args: {
    at: v.number(),
    gone: v.array(v.string()),
    notificationId: v.id("notifications"),
  },
  handler: async (ctx, { at, gone, notificationId }) => {
    const notification = await ctx.db.get(notificationId);
    if (notification?.pushAt === at) {
      await ctx.db.patch(notificationId, { pushAt: undefined });
    }
    for (const endpoint of gone) {
      const device = await ctx.db
        .query("pushDevices")
        .withIndex("by_endpoint", (q) => q.eq("endpoint", endpoint))
        .unique();
      if (device) {
        await ctx.db.delete(device._id);
      }
    }
  },
});
