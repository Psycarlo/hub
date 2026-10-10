import type { Emote, Facing, Seat, Tile } from "@convex/shared/office";
import {
  approaches,
  COFFEE_MACHINE,
  COFFEE_SPOT,
  exitOf,
  facingOf,
  findPath,
  furnitureAt,
  isWalkable,
  neighbours,
  sameTile,
  seatAt as seatOn,
  seatById,
  step,
} from "@convex/shared/office";

import { isMoving, speedOf, walkAlong } from "./motion";
import type { Puppet } from "./puppets";
import { playEmote, seatAt, sitDown, standUp } from "./puppets";
import type { Spot } from "./world";
import { headingOf } from "./world";

/** What your character tells the server, as it does it. */
export interface Sender {
  walk: (from: Tile, path: Tile[], running: boolean, facing?: Facing) => void;
  /** Resolves false if the seat couldn't be had. */
  sit: (seat: Seat) => Promise<boolean>;
  stand: (to: Tile) => void;
  emote: (emote: Emote) => void;
}

/** What to do once there. */
type After = { kind: "sit"; seat: Seat } | { kind: "drink" } | null;

/**
 * Your own character, which moves at once on your screen: keys a step at a
 * time, clicks along the shortest way. Changed only by these functions.
 */
export interface Self {
  puppet: Puppet;
  /** The tile it's on, or stepping onto. */
  tile: Tile;
  after: After;
  /** Directions held down, the latest last. */
  keys: Facing[];
  running: boolean;
  facing: Facing;
}

export function makeSelf(puppet: Puppet, tile: Tile, facing: Facing): Self {
  return { after: null, facing, keys: [], puppet, running: false, tile };
}

function tileOf(spot: Spot): Tile {
  return { x: Math.round(spot.x), y: Math.round(spot.y) };
}

/** Starts on a desk's seat, and stands up from it: coming into the office. */
export function comeIn(self: Self, desk: Seat | undefined) {
  if (!desk) {
    return;
  }
  const exit = exitOf(desk);
  seatAt(self.puppet, desk);
  if (exit) {
    standUp(self.puppet, exit);
    self.tile = exit;
    self.facing = facingOf(desk, exit);
  }
}

/** Sits down at once; gets up again if the server says the seat's taken. */
async function sit(self: Self, seat: Seat, send: Sender) {
  const { puppet } = self;
  const from = self.tile;
  sitDown(puppet, seat);
  self.facing = seat.facing;
  const sat = await send.sit(seat);
  if (!sat && puppet.body.seat?.id === seat.id) {
    standUp(puppet, from);
    self.tile = from;
  }
}

/** Does what was meant for arriving, once there. */
function arrived(self: Self, send: Sender) {
  const { after } = self;
  self.after = null;
  if (after?.kind === "sit") {
    sit(self, after.seat, send);
  } else if (after?.kind === "drink") {
    // Turned to the machine.
    self.facing = ((COFFEE_MACHINE.facing + 2) % 4) as Facing;
    self.puppet.body.faceOnArrival = headingOf(self.facing);
    playEmote(self.puppet, "drink", Date.now());
    send.emote("drink");
  }
}

/** Keeps track of the tile under it as it walks, and does what's next on arriving. */
export function reached(self: Self, spots: Spot[], send: Sender) {
  const last = spots.at(-1);
  if (!last || self.puppet.body.seat) {
    return;
  }
  self.tile = tileOf(last);
  if (!isMoving(self.puppet.body)) {
    arrived(self, send);
  }
}

/** Walks to the nearest of some tiles, getting up first if sitting. */
function walkTo(
  self: Self,
  goals: readonly Tile[],
  after: After,
  send: Sender
): boolean {
  const { body } = self.puppet;
  if (body.seat) {
    const exit = exitOf(body.seat);
    if (!exit) {
      return false;
    }
    const path = findPath(exit, goals) ?? [];
    standUp(self.puppet, exit, path);
    send.stand(exit);
    if (path.length > 0) {
      send.walk(exit, path, false);
    }
    self.tile = exit;
    self.after = after;
    return true;
  }
  const start = isMoving(body) ? tileOf(body.route[0] as Spot) : self.tile;
  const path = findPath(start, goals);
  if (!path) {
    return false;
  }
  const current = isMoving(body) ? [body.route[0] as Spot] : [];
  walkAlong(body, [], self.running);
  body.route = [...current, ...path];
  self.after = after;
  if (path.length > 0) {
    send.walk(start, path, self.running);
  } else if (current.length === 0) {
    arrived(self, send);
  }
  return true;
}

/** Why a seat can't be sat on, or null. */
export type SeatCheck = (seat: Seat) => string | null;

/** Walks to a seat and sits on it. */
export function goSit(
  self: Self,
  seat: Seat,
  check: SeatCheck,
  send: Sender
): string | null {
  const { body } = self.puppet;
  if (body.seat?.id === seat.id) {
    return null;
  }
  const problem = check(seat);
  if (problem) {
    return problem;
  }
  const beside = approaches(seat);
  if (
    !body.seat &&
    !isMoving(body) &&
    beside.some((tile) => sameTile(tile, self.tile))
  ) {
    sit(self, seat, send);
    return null;
  }
  return walkTo(self, beside, { kind: "sit", seat }, send)
    ? null
    : "There’s no way there.";
}

/** The seat to sit on for a tile clicked: the seat, or a desk's from its table. */
function seatFor(tile: Tile): Seat | undefined {
  const seat = seatOn(tile);
  if (seat) {
    return seat;
  }
  const item = furnitureAt(tile);
  return item?.kind === "desk" && item.id ? seatById(item.id) : undefined;
}

/** What clicking or tapping a tile does: walk there, sit there, or have a coffee. */
export function goTo(
  self: Self,
  tile: Tile,
  check: SeatCheck,
  send: Sender
): string | null {
  const seat = seatFor(tile);
  if (seat) {
    return goSit(self, seat, check, send);
  }
  if (furnitureAt(tile)?.kind === "coffeeMachine") {
    walkTo(self, [COFFEE_SPOT], { kind: "drink" }, send);
    return null;
  }
  const goals = isWalkable(tile) ? [tile] : neighbours(tile).filter(isWalkable);
  if (goals.length > 0) {
    walkTo(self, goals, null, send);
  }
  return null;
}

/** E: up from a seat, onto one beside, or a coffee at the machine. */
export function actHere(
  self: Self,
  check: SeatCheck,
  send: Sender
): string | null {
  const { body } = self.puppet;
  if (isMoving(body)) {
    return null;
  }
  if (body.seat) {
    const exit = exitOf(body.seat);
    if (exit) {
      standUp(self.puppet, exit);
      send.stand(exit);
      self.tile = exit;
    }
    return null;
  }
  if (sameTile(self.tile, COFFEE_SPOT)) {
    self.after = { kind: "drink" };
    arrived(self, send);
    return null;
  }
  const ahead = seatOn(step(self.tile, self.facing));
  const seats = [
    ahead,
    ...neighbours(self.tile).map((tile) => seatOn(tile)),
  ].filter((seat): seat is Seat => Boolean(seat));
  const free = seats.find((seat) => check(seat) === null);
  if (free) {
    sit(self, free, send);
    return null;
  }
  return seats[0] ? check(seats[0]) : null;
}

/** A key for a direction went down: it's walked that way from the next tile on. */
export function pressDirection(self: Self, facing: Facing) {
  self.keys = [...self.keys.filter((key) => key !== facing), facing];
  self.after = null;
  const { body } = self.puppet;
  // A click's walk ends at the tile being stepped onto; keys take over there.
  if (body.route.length > 1 && !body.seat) {
    body.route = body.route.slice(0, 1);
  }
}

export function releaseDirection(self: Self, facing: Facing) {
  self.keys = self.keys.filter((key) => key !== facing);
}

export function releaseAll(self: Self) {
  self.keys = [];
  self.running = false;
}

export function setRunning(self: Self, running: boolean) {
  self.running = running;
  const { body } = self.puppet;
  // Steps by key go at the new pace at once; a click's walk keeps its own.
  if (self.keys.length > 0 && !body.seat) {
    body.running = running;
    body.speed = speedOf(running);
  }
}

/** Takes the next step for a key held down, each time the last one's done. */
export function stepByKeys(self: Self, send: Sender) {
  const { body } = self.puppet;
  const facing = self.keys.at(-1);
  if (facing === undefined || isMoving(body)) {
    return;
  }
  if (body.seat) {
    const toward = step(body.seat, facing);
    const exit = isWalkable(toward) ? toward : exitOf(body.seat);
    if (exit) {
      standUp(self.puppet, exit);
      send.stand(exit);
      self.tile = exit;
      self.facing = facingOf(body.seat ?? exit, exit);
    }
    return;
  }
  const next = step(self.tile, facing);
  if (isWalkable(next)) {
    walkAlong(body, [next], self.running);
    send.walk(self.tile, [next], self.running);
    self.tile = next;
    self.facing = facing;
    return;
  }
  // Into a wall: just turn to face it.
  if (self.facing !== facing) {
    self.facing = facing;
    body.faceOnArrival = headingOf(facing);
    body.turnTo = body.faceOnArrival;
    send.walk(self.tile, [], self.running, facing);
  }
}

/** Wave, dance, jump or cheer, standing; jumping also on the move. */
export function emote(self: Self, name: Emote, send: Sender) {
  const { body } = self.puppet;
  if (body.seat || (isMoving(body) && name !== "jump")) {
    return;
  }
  playEmote(self.puppet, name, Date.now());
  send.emote(name);
}

/** Follows the way it faces as it walks, for E to know what's ahead. */
export function trackFacing(self: Self) {
  const { body } = self.puppet;
  if (!body.seat) {
    const quarter = Math.round(body.turnTo / (Math.PI / 2));
    // Headings run south 0, east a quarter turn, north a half, west back a quarter.
    self.facing = ((((2 - quarter) % 4) + 4) % 4) as Facing;
  }
}
