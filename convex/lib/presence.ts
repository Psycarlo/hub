import { Presence } from "@convex-dev/presence";
import { ConvexError } from "convex/values";

import { components } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

/**
 * Rooms people are present in: the hub's while any of their tabs is open,
 * and the office's while one is on the Office page.
 */
export type Room = "hub" | "office";

/**
 * Who has Hub open, kept by the presence component: one session per browser
 * and room, kept alive by one of its tabs. A closed tab ends it at once; one
 * that crashes or loses its connection times out.
 */
export const presence = new Presence<Room, Id<"users">>(components.presence);

const SESSION = /^[\w-]{8,64}$/u;

/** A browser's session in a room, tied to who's signed in on it. */
export function sessionIn(
  room: Room,
  session: string,
  userId: Id<"users">
): string {
  if (!SESSION.test(session)) {
    throw new ConvexError("That isn’t a session.");
  }
  return `${room}:${session}:${userId}`;
}

/** Who's online in a room, with people whose access was taken away left out. */
export async function onlineIn(
  ctx: QueryCtx,
  room: Room
): Promise<Id<"users">[]> {
  const rows = await presence.listRoom(ctx, room, true);
  const ids: Id<"users">[] = [];
  for (const { userId } of rows) {
    const id = ctx.db.normalizeId("users", userId);
    const user = id ? await ctx.db.get(id) : null;
    if (user && !user.deactivated) {
      ids.push(user._id);
    }
  }
  return ids;
}

/** Keeps a browser's session in a room for another interval; returns its token. */
export async function beat(
  ctx: MutationCtx,
  room: Room,
  session: string,
  userId: Id<"users">,
  interval: number
): Promise<string> {
  const { sessionToken } = await presence.heartbeat(
    ctx,
    room,
    userId,
    sessionIn(room, session, userId),
    interval
  );
  return sessionToken;
}
