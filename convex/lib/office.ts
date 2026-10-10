import { ConvexError } from "convex/values";

import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Seat, Tile } from "../shared/office";
import {
  DESKS,
  exitOf,
  facingOf,
  SOUTH,
  SPARE_SPOTS,
  seatById,
} from "../shared/office";
import { onlineIn } from "./presence";

const TIME_ZONE = /^[\w+-]+(?:\/[\w+-]+)*$/u;

/** A time zone the server knows, or UTC. */
export function cleanTimeZone(timeZone: string): string {
  if (timeZone.length > 64 || !TIME_ZONE.test(timeZone)) {
    return "UTC";
  }
  try {
    return new Intl.DateTimeFormat("en", { timeZone }).resolvedOptions()
      .timeZone;
  } catch {
    return "UTC";
  }
}

export function avatarOf(
  ctx: QueryCtx,
  userId: Id<"users">
): Promise<Doc<"officeAvatars"> | null> {
  return ctx.db
    .query("officeAvatars")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
}

export async function requireAvatar(
  ctx: QueryCtx,
  userId: Id<"users">
): Promise<Doc<"officeAvatars">> {
  const avatar = await avatarOf(ctx, userId);
  if (!avatar) {
    throw new ConvexError("Open the office first.");
  }
  return avatar;
}

/** The desk someone has, if the map still has it. */
export async function deskOf(
  ctx: QueryCtx,
  userId: Id<"users">
): Promise<Seat | undefined> {
  const row = await ctx.db
    .query("officeDesks")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
  return row ? seatById(row.desk) : undefined;
}

/** Whether a desk's owner still has access; theirs is free once they don't. */
async function holds(ctx: QueryCtx, row: Doc<"officeDesks">): Promise<boolean> {
  const owner = await ctx.db.get(row.userId);
  return Boolean(owner && !owner.deactivated);
}

/** Makes a desk someone's, moving them from theirs and clearing whoever left it. */
export async function giveDesk(
  ctx: MutationCtx,
  userId: Id<"users">,
  desk: Seat,
  rows: Doc<"officeDesks">[]
) {
  for (const row of rows) {
    if (row.desk === desk.id && row.userId !== userId) {
      await ctx.db.delete(row._id);
    }
  }
  const mine = rows.find((row) => row.userId === userId);
  await (mine
    ? ctx.db.patch(mine._id, { desk: desk.id })
    : ctx.db.insert("officeDesks", { desk: desk.id, userId }));
}

/** Gives someone a desk if they have none: the first free one, if any is. */
export async function ensureDesk(
  ctx: MutationCtx,
  userId: Id<"users">
): Promise<Seat | undefined> {
  const mine = await deskOf(ctx, userId);
  if (mine) {
    return mine;
  }
  const rows = await ctx.db.query("officeDesks").collect();
  const taken = new Set<string>();
  for (const row of rows) {
    if (row.userId !== userId && (await holds(ctx, row))) {
      taken.add(row.desk);
    }
  }
  const free = DESKS.find((desk) => !taken.has(desk.id));
  if (!free) {
    return undefined;
  }
  await giveDesk(ctx, userId, free, rows);
  return free;
}

/** Where someone's character goes back to: sitting at their desk, or in the lounge. */
export function atDesk(desk?: Seat) {
  const spot = SPARE_SPOTS[0] as Tile;
  return {
    emote: undefined,
    facing: desk?.facing ?? SOUTH,
    from: desk ? { x: desk.x, y: desk.y } : spot,
    path: [],
    running: false,
    seat: desk?.id,
  };
}

/** Where someone stands when they come into the office: up from their desk. */
export function besideDesk(desk?: Seat) {
  const exit = desk ? exitOf(desk) : undefined;
  if (!(desk && exit)) {
    return { ...atDesk(), seat: undefined };
  }
  return {
    emote: undefined,
    facing: facingOf(desk, exit),
    from: { x: desk.x, y: desk.y },
    path: [exit],
    running: false,
    seat: undefined,
  };
}

/**
 * Makes sure someone online has a desk and a character to show, and keeps
 * what their browser says about them: whether they're away, and their time.
 */
export async function ensureAvatar(
  ctx: MutationCtx,
  userId: Id<"users">,
  { away, timeZone }: { away?: boolean; timeZone: string }
) {
  const desk = await ensureDesk(ctx, userId);
  const avatar = await avatarOf(ctx, userId);
  const zone = cleanTimeZone(timeZone);
  if (!avatar) {
    await ctx.db.insert("officeAvatars", {
      ...atDesk(desk),
      away: away ?? false,
      moved: Date.now(),
      timeZone: zone,
      userId,
    });
    return;
  }
  const changes: Partial<Doc<"officeAvatars">> = {};
  if (away !== undefined && away !== avatar.away) {
    changes.away = away;
  }
  if (zone !== avatar.timeZone) {
    changes.timeZone = zone;
  }
  if (Object.keys(changes).length > 0) {
    await ctx.db.patch(avatar._id, changes);
  }
}

/** Refuses a seat someone else has: another's desk, or one someone's on. */
export async function checkSeatFree(
  ctx: QueryCtx,
  userId: Id<"users">,
  seat: Seat
) {
  if (seat.kind === "desk") {
    const row = await ctx.db
      .query("officeDesks")
      .withIndex("by_desk", (q) => q.eq("desk", seat.id))
      .first();
    if (row && row.userId !== userId && (await holds(ctx, row))) {
      const owner = await ctx.db.get(row.userId);
      throw new ConvexError(
        `That’s ${owner?.name?.trim() || "someone"}’s desk.`
      );
    }
  }
  // Only those in the office sit where they say: the rest are at their desks.
  const roaming = new Set(await onlineIn(ctx, "office"));
  const avatars = await ctx.db.query("officeAvatars").collect();
  const sitter = avatars.find(
    (avatar) =>
      avatar.seat === seat.id &&
      avatar.userId !== userId &&
      roaming.has(avatar.userId)
  );
  if (sitter) {
    throw new ConvexError("Someone’s sitting there.");
  }
}
