import type {
  Facing,
  Floor,
  Furniture,
  FurnitureKind,
  Seat,
  Tile,
  Wall,
} from "@convex/shared/office";
import {
  EAST,
  floorAt,
  FURNITURE,
  HEIGHT,
  SOUTH,
  STEPS,
  step,
  wallAt,
  WEST,
  WIDTH,
} from "@convex/shared/office";

/**
 * Where the map's tiles are in the scene: a unit each, around the origin,
 * x to the right and y toward the camera, which looks at the back wall.
 */
export function sceneX(x: number): number {
  return x - WIDTH / 2 + 0.5;
}

export function sceneZ(y: number): number {
  return y - HEIGHT / 2 + 0.5;
}

/** The tile under a point in the scene. */
export function tileAt(x: number, z: number): Tile {
  return {
    x: Math.round(x + WIDTH / 2 - 0.5),
    y: Math.round(z + HEIGHT / 2 - 0.5),
  };
}

/** How far to turn something about the up axis to face a way; props face south. */
export function headingOf(facing: Facing): number {
  return [Math.PI, Math.PI / 2, 0, -Math.PI / 2][facing] ?? 0;
}

/** A point on the map, in tiles, between tile middles. */
export interface Spot {
  x: number;
  y: number;
}

/** How far in from its tile's middle someone sits on a seat, toward the way it faces. */
const SIT_IN: Record<Seat["kind"], number> = {
  armchair: -0.04,
  chair: 0.06,
  couch: -0.04,
  desk: 0.14,
};

/** Where someone sits on a seat. */
export function seatSpot(seat: Seat): Spot {
  const by = STEPS[seat.facing] as Tile;
  const inward = SIT_IN[seat.kind];
  return { x: seat.x + by.x * inward, y: seat.y + by.y * inward };
}

/** How far a desk's chair is pushed in when nobody's at it. */
export const TUCKED = 0.32;
const PULLED_OUT = 0.1;

/** Where a desk's chair stands: pulled out for someone there, tucked in if not. */
export function chairSpot(seat: Seat, tucked: boolean): Spot {
  const by = STEPS[seat.facing] as Tile;
  const inward = tucked ? TUCKED : PULLED_OUT;
  return { x: seat.x + by.x * inward, y: seat.y + by.y * inward };
}

/** Each prop's name in office.glb. */
export const PROPS: Record<Exclude<FurnitureKind, "desk">, string> = {
  arcade: "Arcade",
  armchair: "Armchair",
  bookshelf: "Bookshelf",
  chair: "OfficeChair",
  coffeeMachine: "CoffeeMachine",
  coffeeTable: "CoffeeTable",
  couch: "Couch",
  lamp: "Lamp",
  meetingTable: "MeetingTable",
  pingPong: "PingPong",
  plant: "Plant",
  rug: "Rug",
  tv: "Tv",
  whiteboard: "Whiteboard",
};

const WALL_PROPS: Record<Wall, string> = {
  door: "WallDoor",
  low: "WallLow",
  wall: "Wall",
  window: "WallWindow",
};

/** A prop where it stands: a point on the map, and the way it faces. */
export interface Placement {
  prop: string;
  x: number;
  y: number;
  facing: Facing;
  /** What's there, to click on. */
  item?: Furniture;
}

/** The middle of the tiles a piece of furniture takes. */
function middleOf(item: Furniture): Spot {
  return {
    x: item.x + ((item.w ?? 1) - 1) / 2,
    y: item.y + ((item.d ?? 1) - 1) / 2,
  };
}

/** Each floor tile, and the room it's in. */
export const FLOOR_TILES: readonly (Tile & { room: Floor })[] = Array.from(
  { length: WIDTH * HEIGHT },
  (_, index) => ({ x: index % WIDTH, y: Math.floor(index / WIDTH) })
).flatMap((tile) => {
  const room = floorAt(tile);
  return room ? [{ ...tile, room }] : [];
});

/** Walls face into the room: the back wall to the camera, the sides inward. */
function wallFacing({ x, y }: Tile): Facing {
  if (y > 0 && x === 0) {
    return EAST;
  }
  if (y > 0 && x === WIDTH - 1) {
    return WEST;
  }
  return SOUTH;
}

/** Every wall piece, and the way it faces. */
export const WALLS: readonly Placement[] = Array.from(
  { length: WIDTH * HEIGHT },
  (_, index) => ({ x: index % WIDTH, y: Math.floor(index / WIDTH) })
).flatMap((tile) => {
  const wall = wallAt(tile);
  return wall
    ? [{ ...tile, facing: wallFacing(tile), prop: WALL_PROPS[wall] }]
    : [];
});

/** A desk: its chair, where its sitter is, and its table one tile on, facing back. */
export interface DeskPlace {
  seat: Seat;
  table: Tile;
}

/** Furniture that stays put, with each desk's table and monitor. */
export const FIXTURES: readonly Placement[] = FURNITURE.flatMap(
  (item): Placement[] => {
    if (item.kind === "desk") {
      const table = step(item, item.facing);
      const facing = ((item.facing + 2) % 4) as Facing;
      return [{ ...table, facing, item, prop: "Desk" }];
    }
    return [
      { ...middleOf(item), facing: item.facing, item, prop: PROPS[item.kind] },
    ];
  }
);

/** Room colors, a light and a dark tile each, checkered. */
export const CHECKERS: Record<Floor, readonly [string, string]> = {
  game: ["#d6cdf7", "#bfb2f0"],
  lounge: ["#f9d8c4", "#f2c2a6"],
  meeting: ["#c9e4f7", "#aed3ef"],
  office: ["#f4eee2", "#e4dac6"],
};

/** Where the island's trees and bushes stand, outside the walls, in tiles. */
export const GREENERY: readonly {
  prop: string;
  x: number;
  y: number;
  scale: number;
}[] = [
  { prop: "Tree", scale: 1, x: -1.1, y: 16.3 },
  { prop: "Bush", scale: 1.2, x: 0.4, y: 16.6 },
  { prop: "Tree", scale: 0.85, x: 22.1, y: 16.2 },
  { prop: "Bush", scale: 1, x: 20.6, y: 16.7 },
  { prop: "Tree", scale: 0.9, x: -1.3, y: 5 },
  { prop: "Bush", scale: 0.9, x: -1.4, y: 10.5 },
  { prop: "Tree", scale: 1.1, x: 22.3, y: 4 },
  { prop: "Bush", scale: 1.1, x: 22.4, y: 11 },
  { prop: "Bush", scale: 0.8, x: 9, y: 16.8 },
  { prop: "Bush", scale: 0.9, x: 14, y: 16.7 },
];
