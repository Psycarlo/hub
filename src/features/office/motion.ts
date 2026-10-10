import type { Facing, Seat, Tile } from "@convex/shared/office";
import { RUN_SPEED, WALK_SPEED } from "@convex/shared/office";

import type { Spot } from "./world";
import { headingOf } from "./world";

/** Tiles a second to slide onto a seat or off it. */
export const HOP_SPEED = 2.6;
/** How quickly a character turns to where it's going: higher is snappier. */
const TURN = 12;
/** Further from where they're shown than this, others jump rather than walk. */
export const TOO_FAR = 2.5;

/**
 * A character as shown: where it is, the points it's walking through, and
 * which way it looks. Changed every frame, so kept out of React's state.
 */
export interface Body {
  x: number;
  y: number;
  route: Spot[];
  speed: number;
  running: boolean;
  heading: number;
  /** The way it turns to: where it's going, or a seat's way. */
  turnTo: number;
  /** A way to face once there, like a seat's or a turn on the spot. */
  faceOnArrival: number | null;
  seat: Seat | null;
}

export function makeBody(at: Spot, facing: Facing): Body {
  return {
    faceOnArrival: null,
    heading: headingOf(facing),
    route: [],
    running: false,
    seat: null,
    speed: WALK_SPEED,
    turnTo: headingOf(facing),
    x: at.x,
    y: at.y,
  };
}

export function speedOf(running: boolean): number {
  return running ? RUN_SPEED : WALK_SPEED;
}

/** The shortest turn from one heading to another, between -π and π. */
function turnBetween(from: number, to: number): number {
  return (
    ((((to - from) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI)) - Math.PI
  );
}

/**
 * Moves a body along its route for a frame and turns it toward where it's
 * going. Returns the route points it reached, in order.
 */
export function advance(body: Body, delta: number): Spot[] {
  const reached: Spot[] = [];
  let left = body.speed * delta;
  while (left > 0 && body.route.length > 0) {
    const next = body.route[0] as Spot;
    const dx = next.x - body.x;
    const dy = next.y - body.y;
    const distance = Math.hypot(dx, dy);
    if (distance > 1e-4 && body.faceOnArrival === null) {
      body.turnTo = Math.atan2(dx, dy);
    }
    if (distance <= left) {
      body.x = next.x;
      body.y = next.y;
      body.route.shift();
      reached.push(next);
      left -= distance;
    } else {
      body.x += (dx / distance) * left;
      body.y += (dy / distance) * left;
      left = 0;
    }
  }
  if (body.route.length === 0 && body.faceOnArrival !== null) {
    body.turnTo = body.faceOnArrival;
  }
  body.heading +=
    turnBetween(body.heading, body.turnTo) * (1 - Math.exp(-TURN * delta));
  return reached;
}

/** Whether a body is on its way somewhere. */
export function isMoving(body: Body): boolean {
  return body.route.length > 0;
}

export function distanceTo(body: Body, spot: Spot): number {
  return Math.hypot(spot.x - body.x, spot.y - body.y);
}

/** Puts a body straight on a spot, done with walking. */
export function place(body: Body, at: Spot, facing?: Facing) {
  body.x = at.x;
  body.y = at.y;
  body.route = [];
  body.faceOnArrival = null;
  if (facing !== undefined) {
    body.heading = headingOf(facing);
    body.turnTo = body.heading;
  }
}

/** Sends a body along tiles, at walking or running pace. */
export function walkAlong(
  body: Body,
  tiles: readonly Tile[],
  running: boolean
) {
  body.route = tiles.map(({ x, y }) => ({ x, y }));
  body.running = running;
  body.speed = speedOf(running);
  body.faceOnArrival = null;
}
