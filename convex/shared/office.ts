/**
 * The virtual office: one map, designed here, so the server checks moves and
 * seats against the same one the app draws. Its props are built by
 * blender/office.py into src/features/office/office.glb.
 *
 * The map is tiles, x across from the left wall and y from the back wall to
 * the open front, which faces the camera. Walkable tiles, seats and desks are
 * worked out from the floor plan and the furniture, not written twice.
 */

export interface Tile {
  x: number;
  y: number;
}

/** The way something faces: north (to the back wall), east, south (to the camera), west. */
export type Facing = 0 | 1 | 2 | 3;

export const NORTH: Facing = 0;
export const EAST: Facing = 1;
export const SOUTH: Facing = 2;
export const WEST: Facing = 3;

/** A step in each direction, by facing. */
export const STEPS: readonly Tile[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

/**
 * The floor plan, a character a tile:
 *
 *   #  wall      o  wall with a window   D  wall with a door
 *   =  low wall between rooms, to see over
 *   .  office floor   m  meeting room   l  lounge   g  game corner
 *
 * The last row has no wall in front: it's the cutaway the camera looks in by.
 */
const PLAN = [
  "#oo####oo####ooo#oo###",
  "#mmmmmmmmm=llllllllllo",
  "#mmmmmmmmm=llllllllllo",
  "#mmmmmmmmm=llllllllll#",
  "ommmmmmmmm=llllllllll#",
  "ommmmmmmmm=llllllllllo",
  "#======..========gg==#",
  "#..............ggggggo",
  "o..............gggggg#",
  "o..............gggggg#",
  "#..............gggggg#",
  "o..............gggggg#",
  "#..............gggggg#",
  "D..............ggggggo",
  "#..............ggggggo",
  "#..............gggggg#",
] as const;

export const WIDTH = 22;
export const HEIGHT = PLAN.length;

export type Floor = "office" | "meeting" | "lounge" | "game";
export type Wall = "wall" | "window" | "door" | "low";

const FLOORS: Readonly<Record<string, Floor>> = {
  ".": "office",
  g: "game",
  l: "lounge",
  m: "meeting",
};

const WALLS: Readonly<Record<string, Wall>> = {
  "#": "wall",
  "=": "low",
  D: "door",
  o: "window",
};

function charAt({ x, y }: Tile): string | undefined {
  return PLAN[y]?.[x];
}

export function inMap({ x, y }: Tile): boolean {
  return (
    Number.isInteger(x) &&
    Number.isInteger(y) &&
    x >= 0 &&
    x < WIDTH &&
    y >= 0 &&
    y < HEIGHT
  );
}

export function floorAt(tile: Tile): Floor | null {
  const char = charAt(tile);
  return (char && FLOORS[char]) || null;
}

export function wallAt(tile: Tile): Wall | null {
  const char = charAt(tile);
  return (char && WALLS[char]) || null;
}

export type FurnitureKind =
  | "desk"
  | "chair"
  | "couch"
  | "armchair"
  | "meetingTable"
  | "coffeeTable"
  | "rug"
  | "bookshelf"
  | "coffeeMachine"
  | "plant"
  | "lamp"
  | "tv"
  | "whiteboard"
  | "arcade"
  | "pingPong";

export interface Furniture {
  kind: FurnitureKind;
  /** Its tile, or the corner of its tiles nearest the back left. */
  x: number;
  y: number;
  /** How many tiles it takes across (x) and deep (y), as placed: 1 unless said. */
  w?: number;
  d?: number;
  /** The way its front faces; seats, the way you face sitting in them. */
  facing: Facing;
  /** Seats' names, which the server keeps: a desk's is the one it's given out by. */
  id?: string;
}

/**
 * A desk is listed by its chair, facing the desk, which stands one tile on.
 * Desks come in pods of four, two facing two, and are given out in this order.
 */
function pod(x: number, first: number): Furniture[] {
  return [
    { facing: SOUTH, id: `desk-${first}`, kind: "desk", x, y: 9 },
    { facing: SOUTH, id: `desk-${first + 1}`, kind: "desk", x: x + 1, y: 9 },
    { facing: NORTH, id: `desk-${first + 2}`, kind: "desk", x, y: 12 },
    { facing: NORTH, id: `desk-${first + 3}`, kind: "desk", x: x + 1, y: 12 },
  ];
}

function chairs(y: number, facing: Facing, first: number): Furniture[] {
  return [3, 4, 5, 6].map((x, index) => ({
    facing,
    id: `meeting-${first + index}`,
    kind: "chair" as const,
    x,
    y,
  }));
}

export const FURNITURE: readonly Furniture[] = [
  ...pod(2, 1),
  ...pod(6, 5),
  ...pod(10, 9),
  { facing: EAST, kind: "plant", x: 1, y: 7 },
  { facing: WEST, kind: "plant", x: 14, y: 7 },
  { facing: EAST, kind: "plant", x: 1, y: 15 },

  // The meeting room.
  { d: 1, facing: SOUTH, kind: "meetingTable", w: 4, x: 3, y: 3 },
  ...chairs(2, SOUTH, 1),
  ...chairs(4, NORTH, 5),
  { facing: SOUTH, kind: "tv", w: 2, x: 4, y: 0 },
  { d: 2, facing: EAST, kind: "whiteboard", x: 0, y: 2 },
  { facing: SOUTH, kind: "plant", x: 1, y: 1 },
  { facing: SOUTH, kind: "lamp", x: 9, y: 1 },

  // The lounge.
  { facing: SOUTH, id: "couch", kind: "couch", w: 3, x: 13, y: 1 },
  { d: 3, facing: SOUTH, kind: "rug", w: 5, x: 12, y: 2 },
  { facing: SOUTH, kind: "coffeeTable", x: 14, y: 3 },
  { facing: EAST, id: "armchair-1", kind: "armchair", x: 12, y: 3 },
  { facing: WEST, id: "armchair-2", kind: "armchair", x: 16, y: 3 },
  { facing: SOUTH, kind: "lamp", x: 12, y: 1 },
  { facing: SOUTH, kind: "lamp", x: 16, y: 1 },
  { facing: SOUTH, kind: "coffeeMachine", x: 19, y: 1 },
  { facing: SOUTH, kind: "plant", x: 20, y: 1 },
  { d: 2, facing: WEST, kind: "bookshelf", x: 20, y: 3 },

  // The game corner.
  { facing: WEST, kind: "arcade", x: 20, y: 8 },
  { facing: WEST, kind: "arcade", x: 20, y: 10 },
  { d: 2, facing: SOUTH, kind: "pingPong", w: 3, x: 16, y: 12 },
  { facing: WEST, kind: "plant", x: 20, y: 15 },
];

/** Flat on the floor or hung on a wall, so nothing to walk around. */
const UNDERFOOT: ReadonlySet<FurnitureKind> = new Set<FurnitureKind>([
  "rug",
  "tv",
  "whiteboard",
]);

export function step(tile: Tile, facing: Facing): Tile {
  const by = STEPS[facing] as Tile;
  return { x: tile.x + by.x, y: tile.y + by.y };
}

export function sameTile(a: Tile, b: Tile): boolean {
  return a.x === b.x && a.y === b.y;
}

/** The tiles a piece of furniture stands on. */
export function tilesOf(item: Furniture): Tile[] {
  if (item.kind === "desk") {
    return [item, step(item, item.facing)];
  }
  const tiles: Tile[] = [];
  for (let dy = 0; dy < (item.d ?? 1); dy += 1) {
    for (let dx = 0; dx < (item.w ?? 1); dx += 1) {
      tiles.push({ x: item.x + dx, y: item.y + dy });
    }
  }
  return tiles;
}

export type SeatKind = "desk" | "chair" | "couch" | "armchair";

/** Somewhere to sit: the tile you sit on, and the way you face. */
export interface Seat extends Tile {
  id: string;
  kind: SeatKind;
  facing: Facing;
}

const SEAT_KINDS: ReadonlySet<FurnitureKind> = new Set<FurnitureKind>([
  "desk",
  "chair",
  "couch",
  "armchair",
]);

function seatsOf(item: Furniture): Seat[] {
  const kind = item.kind as SeatKind;
  const id = item.id ?? `${item.kind}-${item.x}-${item.y}`;
  if (kind !== "couch") {
    return [{ facing: item.facing, id, kind, x: item.x, y: item.y }];
  }
  // A couch has a seat on each of its tiles.
  return tilesOf(item).map((tile, index) => ({
    ...tile,
    facing: item.facing,
    id: `${id}-${index + 1}`,
    kind,
  }));
}

export const SEATS: readonly Seat[] = FURNITURE.filter((item) =>
  SEAT_KINDS.has(item.kind)
).flatMap(seatsOf);

/** Desks, which are seats with a nameplate and a monitor, in the order they're given out. */
export const DESKS: readonly Seat[] = SEATS.filter(
  (seat) => seat.kind === "desk"
);

const seatsById = new Map(SEATS.map((seat) => [seat.id, seat]));

export function seatById(id: string): Seat | undefined {
  return seatsById.get(id);
}

function key({ x, y }: Tile): number {
  return y * WIDTH + x;
}

const seatsByTile = new Map(SEATS.map((seat) => [key(seat), seat]));

export function seatAt(tile: Tile): Seat | undefined {
  return inMap(tile) ? seatsByTile.get(key(tile)) : undefined;
}

/** Tiles furniture stands on. Seats are among them: you sit down from beside one. */
const occupied = new Set(
  FURNITURE.filter((item) => !UNDERFOOT.has(item.kind)).flatMap((item) =>
    tilesOf(item).map(key)
  )
);

// What stands on a rug wins over the rug.
const furnitureByTile = new Map(
  FURNITURE.toSorted(
    (a, b) => Number(UNDERFOOT.has(b.kind)) - Number(UNDERFOOT.has(a.kind))
  ).flatMap((item) => tilesOf(item).map((tile) => [key(tile), item] as const))
);

/** What stands on a tile, or hangs on its wall: on a rug, what stands on it. */
export function furnitureAt(tile: Tile): Furniture | undefined {
  return inMap(tile) ? furnitureByTile.get(key(tile)) : undefined;
}

export function isWalkable(tile: Tile): boolean {
  return inMap(tile) && floorAt(tile) !== null && !occupied.has(key(tile));
}

export function neighbours(tile: Tile): Tile[] {
  return STEPS.map((by) => ({ x: tile.x + by.x, y: tile.y + by.y }));
}

/** The way to face to look from one tile to the next. */
export function facingOf(from: Tile, to: Tile): Facing {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0 ? EAST : WEST;
  }
  return dy < 0 ? NORTH : SOUTH;
}

/** Tiles you can sit down on a seat from: the walkable ones beside it. */
export function approaches(seat: Seat): Tile[] {
  return neighbours(seat).filter(isWalkable);
}

/**
 * Where you stand up to from a seat: behind it, where a chair is pulled out
 * to, or else in front, or to a side.
 */
export function exitOf(seat: Seat): Tile | undefined {
  const order: Facing[] = [
    ((seat.facing + 2) % 4) as Facing,
    seat.facing,
    ((seat.facing + 1) % 4) as Facing,
    ((seat.facing + 3) % 4) as Facing,
  ];
  return order.map((facing) => step(seat, facing)).find(isWalkable);
}

/** Where the coffee comes out, and the tile to stand on for a cup. */
export const COFFEE_MACHINE = FURNITURE.find(
  (item) => item.kind === "coffeeMachine"
) as Furniture;
export const COFFEE_SPOT: Tile = step(COFFEE_MACHINE, COFFEE_MACHINE.facing);

/** Where people without a desk stand, in the lounge, until one frees up. */
export const SPARE_SPOTS: readonly Tile[] = [
  { x: 13, y: 2 },
  { x: 15, y: 2 },
  { x: 13, y: 4 },
  { x: 15, y: 4 },
  { x: 18, y: 3 },
];

/** The longest walk sent at once, in tiles. */
export const MAX_PATH = 64;

/** Tiles a second. */
export const WALK_SPEED = 3.5;
export const RUN_SPEED = 6;

interface Open {
  tile: Tile;
  score: number;
}

/** The open tile likeliest to lead somewhere, taken off the list. */
function takeBest(open: Open[]): Tile {
  let best = 0;
  for (let index = 1; index < open.length; index += 1) {
    if ((open[index]?.score ?? 0) < (open[best]?.score ?? 0)) {
      best = index;
    }
  }
  return (open.splice(best, 1)[0] as Open).tile;
}

/** The tiles stepped on to get to a tile, from the way each was come to. */
function trace(came: Map<number, Tile>, from: Tile, to: Tile): Tile[] {
  const path: Tile[] = [];
  let at: Tile | undefined = to;
  while (at && !sameTile(at, from)) {
    path.unshift(at);
    at = came.get(key(at));
  }
  return path;
}

/**
 * The shortest walk from a tile to any of the goals, four ways, as the tiles
 * it steps on: empty when already there, null when there's no way. The start
 * needn't be walkable, like a seat being stood up from; the goals must be.
 */
export function findPath(
  from: Tile,
  goals: readonly Tile[],
  limit = MAX_PATH
): Tile[] | null {
  const targets = goals.filter(isWalkable);
  if (targets.some((goal) => sameTile(goal, from))) {
    return [];
  }
  if (targets.length === 0 || !inMap(from)) {
    return null;
  }
  const goalKeys = new Set(targets.map(key));
  const estimate = (tile: Tile) =>
    Math.min(
      ...targets.map(
        (goal) => Math.abs(goal.x - tile.x) + Math.abs(goal.y - tile.y)
      )
    );
  const cost = new Map<number, number>([[key(from), 0]]);
  const came = new Map<number, Tile>();
  // Small enough a map to keep the open tiles in a plain list.
  const open: Open[] = [{ score: estimate(from), tile: from }];
  while (open.length > 0) {
    const tile = takeBest(open);
    if (goalKeys.has(key(tile))) {
      return trace(came, from, tile);
    }
    const here = cost.get(key(tile)) ?? 0;
    const better = neighbours(tile).filter(
      (next) =>
        here < limit &&
        isWalkable(next) &&
        (cost.get(key(next)) ?? Number.POSITIVE_INFINITY) > here + 1
    );
    for (const next of better) {
      cost.set(key(next), here + 1);
      came.set(key(next), tile);
      open.push({ score: here + 1 + estimate(next), tile: next });
    }
  }
  return null;
}

/** What's wrong with a walk, or null when every step is fine. */
export function checkWalk(from: Tile, path: readonly Tile[]): string | null {
  if (!(isWalkable(from) || seatAt(from))) {
    return "That isn’t somewhere to walk from.";
  }
  if (path.length > MAX_PATH) {
    return "That’s too far to walk at once.";
  }
  let at = from;
  for (const next of path) {
    const distance = Math.abs(next.x - at.x) + Math.abs(next.y - at.y);
    if (distance !== 1 || !isWalkable(next)) {
      return "There’s no way through there.";
    }
    at = next;
  }
  return null;
}

/** What people can do on the spot, besides walking and sitting. */
export const EMOTES = ["wave", "dance", "jump", "cheer", "drink"] as const;
export type Emote = (typeof EMOTES)[number];

/** A speech bubble's longest text. */
export const MAX_BUBBLE = 120;

// Control characters and line breaks, which a bubble shows none of.
// oxlint-disable-next-line no-control-regex
const UNPRINTABLE = /[\u0000-\u001F\u007F-\u009F]+/gu;

/** A bubble's text as shown: on one line, trimmed, and not too long. */
export function cleanBubble(text: string): string {
  return text.replace(UNPRINTABLE, " ").trim().slice(0, MAX_BUBBLE);
}
