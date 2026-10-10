import type { OfficePerson } from "@convex/office";
import type { Emote, Facing, Seat, Tile } from "@convex/shared/office";
import { SPARE_SPOTS, sameTile, seatById } from "@convex/shared/office";

import type { Move } from "../character/moves";
import { ONCE } from "../character/moves";
import type { Body } from "./motion";
import {
  advance,
  distanceTo,
  HOP_SPEED,
  isMoving,
  makeBody,
  place,
  TOO_FAR,
  walkAlong,
} from "./motion";
import type { Spot } from "./world";
import { headingOf, seatSpot } from "./world";

/** How long emotes that loop go on for, unless the character moves first. */
const LOOPING: Partial<Record<Emote, number>> = { dance: 8000 };
/** Emotes seen this long after they were sent still play, for whoever arrives late. */
const FRESH = 4000;

/**
 * A character on the move, with what it's doing on the spot. Changed every
 * frame, so kept out of React's state, and changed only by these functions.
 */
export interface Puppet {
  body: Body;
  /** A move on the spot, playing until it ends, it's over, or the character moves. */
  emote: Emote | null;
  emoteUntil: number;
  away: boolean;
  /** Pointed at, so its name shows. */
  hovered: boolean;
  /** What happens as it reaches each point it walks through. */
  onReach: ((spots: Spot[]) => void) | null;
}

export function makePuppet(at: Spot, facing: Facing): Puppet {
  return {
    away: false,
    body: makeBody(at, facing),
    emote: null,
    emoteUntil: 0,
    hovered: false,
    onReach: null,
  };
}

/** Moves it on for a frame; returns the points it reached. */
export function tick(puppet: Puppet, delta: number, now: number): Spot[] {
  const reached = advance(puppet.body, delta);
  const moving = isMoving(puppet.body);
  if (
    puppet.emote &&
    ((moving && puppet.emote !== "jump") ||
      (puppet.emoteUntil > 0 && now > puppet.emoteUntil))
  ) {
    puppet.emote = null;
  }
  if (reached.length > 0) {
    puppet.onReach?.(reached);
  }
  return reached;
}

/** What it's doing, as a move to play. */
export function moveOf(puppet: Puppet): Move {
  const { body } = puppet;
  if (body.seat) {
    if (isMoving(body)) {
      return "sit";
    }
    if (puppet.away) {
      return "doze";
    }
    return body.seat.kind === "desk" ? "type" : "sit";
  }
  if (puppet.emote === "jump") {
    return "jump";
  }
  if (isMoving(body)) {
    return body.running ? "run" : "walk";
  }
  return puppet.emote ?? "idle";
}

/** When a move that plays once is over. */
export function endMove(puppet: Puppet, move: Move) {
  if (puppet.emote === move && ONCE.has(move)) {
    puppet.emote = null;
  }
}

export function playEmote(puppet: Puppet, emote: Emote, now: number) {
  puppet.emote = emote;
  const lasts = LOOPING[emote];
  puppet.emoteUntil = lasts ? now + lasts : 0;
}

export function setHovered(puppet: Puppet, hovered: boolean) {
  puppet.hovered = hovered;
}

export function setOnReach(
  puppet: Puppet,
  onReach: ((spots: Spot[]) => void) | null
) {
  puppet.onReach = onReach;
}

/** Slides onto a seat from beside it, turning to face its way. */
export function sitDown(puppet: Puppet, seat: Seat) {
  const { body } = puppet;
  body.seat = seat;
  body.route = [seatSpot(seat)];
  body.speed = HOP_SPEED;
  body.running = false;
  body.faceOnArrival = headingOf(seat.facing);
  body.turnTo = body.faceOnArrival;
  puppet.emote = null;
}

/** Gets up off a seat onto a tile beside it, then maybe walks on. */
export function standUp(
  puppet: Puppet,
  to: Tile,
  onward: readonly Tile[] = []
) {
  const { body } = puppet;
  body.seat = null;
  walkAlong(body, [to, ...onward], false);
  body.speed = HOP_SPEED;
}

/** Sits at a seat at once, like at a desk on arriving. */
export function seatAt(puppet: Puppet, seat: Seat) {
  place(puppet.body, seatSpot(seat), seat.facing);
  puppet.body.seat = seat;
}

/** Where someone with no desk waits, in the lounge: the same spot each time. */
export function spareSpot(userId: string): Tile {
  let sum = 0;
  for (const char of userId) {
    sum += char.codePointAt(0) ?? 0;
  }
  return SPARE_SPOTS[sum % SPARE_SPOTS.length] as Tile;
}

/** What was last taken from someone's state, to tell what's new in the next. */
export interface Seen {
  roaming: boolean;
  moved: number;
  seat: string | null;
  emoteAt: number;
}

export function seenOf(person: OfficePerson): Seen {
  return {
    emoteAt: person.emote?.at ?? 0,
    moved: person.moved,
    roaming: person.roaming,
    seat: person.seat,
  };
}

/** Where someone not on the Office page is: at their desk, or in the lounge. */
function settle(puppet: Puppet, person: OfficePerson) {
  const desk = person.desk ? seatById(person.desk) : undefined;
  if (desk) {
    seatAt(puppet, desk);
  } else {
    place(puppet.body, spareSpot(person.userId), 2);
    puppet.body.seat = null;
  }
}

/** Where someone in the office is once their latest walk is done. */
function arrive(puppet: Puppet, person: OfficePerson) {
  const seat = person.seat ? seatById(person.seat) : undefined;
  if (seat) {
    seatAt(puppet, seat);
    return;
  }
  place(puppet.body, person.path.at(-1) ?? person.from, person.facing);
  puppet.body.seat = null;
}

/** Follows someone's latest walk from where they're shown now. */
function follow(puppet: Puppet, person: OfficePerson, before: Seen) {
  const { body } = puppet;
  const seat = person.seat ? seatById(person.seat) : undefined;
  if (seat) {
    if (distanceTo(body, seatSpot(seat)) > TOO_FAR) {
      seatAt(puppet, seat);
    } else {
      sitDown(puppet, seat);
    }
    return;
  }
  if (distanceTo(body, person.from) > TOO_FAR) {
    place(body, person.from);
  }
  body.seat = null;
  walkAlong(body, [person.from, ...person.path], person.running);
  if (before.seat) {
    body.speed = HOP_SPEED;
  }
  if (person.path.length === 0) {
    body.faceOnArrival = headingOf(person.facing);
  }
}

/** Someone coming into the office, or first seen in it. */
function enter(
  puppet: Puppet,
  person: OfficePerson,
  before: Seen | null
): Spot | null {
  const desk = person.desk ? seatById(person.desk) : undefined;
  if (before && desk && sameTile(person.from, desk) && !person.seat) {
    // In from elsewhere in Hub: up from their desk.
    seatAt(puppet, desk);
    standUp(puppet, person.path[0] ?? person.from, person.path.slice(1));
    return { x: desk.x, y: desk.y };
  }
  arrive(puppet, person);
  return null;
}

/** Plays someone's latest emote, if it's new, and fresh for whoever just arrived. */
function catchEmote(
  puppet: Puppet,
  person: OfficePerson,
  before: Seen | null,
  now: number
) {
  const { emote } = person;
  if (
    emote &&
    emote.at !== before?.emoteAt &&
    (before !== null || now - emote.at < FRESH) &&
    !puppet.body.seat
  ) {
    playEmote(puppet, emote.name, now);
  }
}

/**
 * Takes in someone else's latest state: where they went, sat or came in,
 * and what they did. Returns where a puff of smoke goes, if they arrived in
 * the office or left it.
 */
export function syncPuppet(
  puppet: Puppet,
  person: OfficePerson,
  before: Seen | null,
  now: number
): Spot | null {
  puppet.away = person.away;
  let puff: Spot | null = null;
  if (!person.roaming) {
    if (!before || before.roaming) {
      puff = before ? { x: puppet.body.x, y: puppet.body.y } : null;
      settle(puppet, person);
    }
  } else if (!before?.roaming) {
    puff = enter(puppet, person, before);
  } else if (person.moved !== before.moved || person.seat !== before.seat) {
    follow(puppet, person, before);
  }
  catchEmote(puppet, person, before, now);
  return puff;
}

/** Everyone's puppet by their id, for the scene to find them by. */
export type Registry = Map<string, Puppet>;

export function addPuppet(registry: Registry, userId: string, puppet: Puppet) {
  registry.set(userId, puppet);
}

export function removePuppet(registry: Registry, userId: string) {
  registry.delete(userId);
}
