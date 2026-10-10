import { ConvexError, v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { requireUser } from "./lib/access";
import {
  atDesk,
  avatarOf,
  besideDesk,
  checkSeatFree,
  cleanTimeZone,
  deskOf,
  ensureDesk,
  giveDesk,
  requireAvatar,
} from "./lib/office";
import { beat, onlineIn } from "./lib/presence";
import { vEmote, vTile } from "./lib/validators";
import type { Emote, Facing, Tile } from "./shared/office";
import {
  checkWalk,
  cleanBubble,
  facingOf,
  isWalkable,
  neighbours,
  sameTile,
  seatById,
} from "./shared/office";

/** How long entering keeps the office session, until the browser's next heartbeat. */
const ENTER_INTERVAL = 60_000;

/** Someone online, and what their character is doing. */
export interface OfficePerson {
  userId: Id<"users">;
  /** On the Office page, rather than elsewhere in Hub. */
  roaming: boolean;
  /** All their tabs hidden a while. */
  away: boolean;
  desk: string | null;
  from: Tile;
  path: Tile[];
  running: boolean;
  facing: Facing;
  seat: string | null;
  emote: { at: number; name: Emote } | null;
  bubble: { at: number; text: string } | null;
  timeZone: string;
  moved: number;
}

/** Who's online, for the sidebar; the office page has `people`. */
export const online = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    return await onlineIn(ctx, "hub");
  },
});

/**
 * Everyone online, with where their character is and what it's doing, and
 * every desk given out, online or not, for its nameplate.
 */
export const people = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    const here = await onlineIn(ctx, "hub");
    const roaming = new Set(await onlineIn(ctx, "office"));
    const rows = await ctx.db.query("officeDesks").collect();
    const desks: { desk: string; userId: Id<"users"> }[] = [];
    for (const row of rows) {
      const owner = await ctx.db.get(row.userId);
      if (owner && !owner.deactivated && seatById(row.desk)) {
        desks.push({ desk: row.desk, userId: row.userId });
      }
    }
    const deskBy = new Map(desks.map((row) => [row.userId, row.desk]));
    const shown: OfficePerson[] = [];
    for (const userId of here) {
      const desk = deskBy.get(userId) ?? null;
      const avatar = await avatarOf(ctx, userId);
      const place = avatar ?? {
        ...atDesk(desk ? seatById(desk) : undefined),
        away: false,
        bubble: undefined,
        moved: 0,
        timeZone: "UTC",
      };
      shown.push({
        away: place.away,
        bubble: place.bubble ?? null,
        desk,
        emote: place.emote ?? null,
        facing: place.facing as Facing,
        from: place.from,
        moved: place.moved,
        path: place.path,
        roaming: roaming.has(userId),
        running: place.running,
        seat: place.seat ?? null,
        timeZone: place.timeZone,
        userId,
      });
    }
    return { desks, people: shown };
  },
});

/**
 * Opening the Office page: in the office's room at once, rather than at the
 * browser's next heartbeat, and stood up beside your desk, given one if you
 * have none.
 */
export const enter = mutation({
  args: { session: v.string(), timeZone: v.string() },
  handler: async (ctx, { session, timeZone }) => {
    const user = await requireUser(ctx);
    const officeToken = await beat(
      ctx,
      "office",
      session,
      user._id,
      ENTER_INTERVAL
    );
    const desk = await ensureDesk(ctx, user._id);
    const avatar = await avatarOf(ctx, user._id);
    const place = {
      ...besideDesk(desk),
      away: false,
      moved: Date.now(),
      timeZone: cleanTimeZone(timeZone),
    };
    await (avatar
      ? ctx.db.patch(avatar._id, place)
      : ctx.db.insert("officeAvatars", { ...place, userId: user._id }));
    return { desk: desk?.id ?? null, officeToken };
  },
});

/** Leaving the Office page: back at your desk. */
export const leave = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const avatar = await avatarOf(ctx, user._id);
    if (avatar) {
      const desk = await deskOf(ctx, user._id);
      await ctx.db.patch(avatar._id, { ...atDesk(desk), moved: Date.now() });
    }
  },
});

function checkFacing(facing: number): Facing {
  if (!(Number.isInteger(facing) && facing >= 0 && facing <= 3)) {
    throw new ConvexError("That isn’t a way to face.");
  }
  return facing as Facing;
}

/**
 * A walk: from a tile, through the ones next to each other on the way. Keys
 * send a step at a time, a click the whole way. With no steps, a turn.
 */
export const walk = mutation({
  args: {
    facing: v.optional(v.number()),
    from: vTile,
    path: v.array(vTile),
    running: v.boolean(),
  },
  handler: async (ctx, { from, path, running, facing }) => {
    const user = await requireUser(ctx);
    const avatar = await requireAvatar(ctx, user._id);
    const problem = checkWalk(from, path);
    if (problem) {
      throw new ConvexError(problem);
    }
    const last = path.at(-1);
    await ctx.db.patch(avatar._id, {
      facing: last
        ? facingOf(path.at(-2) ?? from, last)
        : checkFacing(facing ?? avatar.facing),
      from,
      moved: Date.now(),
      path,
      running,
      seat: undefined,
    });
  },
});

/** Sitting down on a seat from beside it. */
export const sit = mutation({
  args: { seat: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const avatar = await requireAvatar(ctx, user._id);
    const seat = seatById(args.seat);
    if (!seat) {
      throw new ConvexError("There’s no seat there.");
    }
    const at = avatar.path.at(-1) ?? avatar.from;
    const beside = neighbours(seat).some((tile) => sameTile(tile, at));
    if (!(beside || sameTile(at, seat))) {
      throw new ConvexError("Walk up to the seat first.");
    }
    await checkSeatFree(ctx, user._id, seat);
    await ctx.db.patch(avatar._id, {
      emote: undefined,
      facing: seat.facing,
      from: at,
      moved: Date.now(),
      path: [],
      running: false,
      seat: seat.id,
    });
  },
});

/** Getting up from a seat onto a tile beside it. */
export const stand = mutation({
  args: { to: vTile },
  handler: async (ctx, { to }) => {
    const user = await requireUser(ctx);
    const avatar = await requireAvatar(ctx, user._id);
    const seat = avatar.seat ? seatById(avatar.seat) : undefined;
    if (!seat) {
      return;
    }
    const beside = neighbours(seat).some((tile) => sameTile(tile, to));
    if (!(beside && isWalkable(to))) {
      throw new ConvexError("There’s no room to stand there.");
    }
    await ctx.db.patch(avatar._id, {
      facing: facingOf(seat, to),
      from: { x: seat.x, y: seat.y },
      moved: Date.now(),
      path: [to],
      running: false,
      seat: undefined,
    });
  },
});

/** Moving to a free desk, which frees yours. */
export const claimDesk = mutation({
  args: { desk: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const desk = seatById(args.desk);
    if (desk?.kind !== "desk") {
      throw new ConvexError("There’s no desk there.");
    }
    await checkSeatFree(ctx, user._id, desk);
    const rows = await ctx.db.query("officeDesks").collect();
    await giveDesk(ctx, user._id, desk, rows);
  },
});

export const emote = mutation({
  args: { name: vEmote },
  handler: async (ctx, { name }) => {
    const user = await requireUser(ctx);
    const avatar = await requireAvatar(ctx, user._id);
    await ctx.db.patch(avatar._id, { emote: { at: Date.now(), name } });
  },
});

/** A speech bubble: plain text, on one line. */
export const say = mutation({
  args: { text: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const avatar = await requireAvatar(ctx, user._id);
    const text = cleanBubble(args.text);
    if (!text) {
      throw new ConvexError("Type something to say.");
    }
    await ctx.db.patch(avatar._id, { bubble: { at: Date.now(), text } });
  },
});
