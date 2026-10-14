import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { requireUser } from "./lib/access";
import { avatarOf, ensureAvatar } from "./lib/office";
import { beat, presence } from "./lib/presence";

/** Whether someone has Hub open, and if not, when they last did. */
export interface Seen {
  state: "online" | "away" | "offline";
  /** When their last session ended; null while online or if they never had one. */
  lastSeen: number | null;
}

/** Heartbeat intervals the app may ask for, in milliseconds. */
const MIN_INTERVAL = 5000;
const MAX_INTERVAL = 120_000;

/**
 * Sent by one tab per browser: every half minute while one of its tabs is in
 * view, and every minute while none is. It says whether one is on the Office
 * page and, when it changed, whether they've all been hidden a while.
 */
export const heartbeat = mutation({
  args: {
    away: v.optional(v.boolean()),
    interval: v.number(),
    office: v.boolean(),
    /** The office session to end, once no tab is on the Office page. */
    officeToken: v.optional(v.string()),
    session: v.string(),
    timeZone: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const interval = Math.min(
      Math.max(args.interval, MIN_INTERVAL),
      MAX_INTERVAL
    );
    const hub = await beat(ctx, "hub", args.session, user._id, interval);
    let office: string | null = null;
    if (args.office) {
      office = await beat(ctx, "office", args.session, user._id, interval);
    } else if (args.officeToken) {
      await presence.disconnect(ctx, args.officeToken);
    }
    await ensureAvatar(ctx, user._id, {
      away: args.away,
      timeZone: args.timeZone,
    });
    return { hub, office };
  },
});

/** For someone's card: here, away with every tab hidden, or gone since when. */
export const seen = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }): Promise<Seen> => {
    await requireUser(ctx);
    const user = await ctx.db.get(userId);
    const rooms = await presence.listUser(ctx, userId);
    const hub = rooms.find((room) => room.roomId === "hub");
    if (hub?.online && user && !user.deactivated) {
      const avatar = await avatarOf(ctx, userId);
      return { lastSeen: null, state: avatar?.away ? "away" : "online" };
    }
    return {
      lastSeen: hub && hub.lastDisconnected > 0 ? hub.lastDisconnected : null,
      state: "offline",
    };
  },
});

/**
 * Ends a session at once. A closing tab sends it as a beacon, which can't
 * sign in, so the session's token is what it's checked by.
 */
export const disconnect = mutation({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }) => {
    await presence.disconnect(ctx, sessionToken);
  },
});
