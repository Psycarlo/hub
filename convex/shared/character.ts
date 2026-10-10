/**
 * Characters: the 3D figure someone walks around as. What both the server and
 * the app know about them. The ids name the parts in
 * src/features/character/character.glb, built by blender/character.py.
 */

import type { HexColor } from "./palette";
import { isHexColor } from "./palette";

export const BODIES = ["male", "female"] as const;
export const EYES = ["round", "happy", "sleepy", "sparkly"] as const;
export const MOUTHS = ["smile", "grin", "cat", "wow"] as const;
export const CHEEKS = ["rosy", "freckles", "plain"] as const;
export const FACIAL_HAIR = ["none", "mustache", "beard", "goatee"] as const;
export const HAIR_STYLES = [
  "short",
  "spiky",
  "long",
  "ponytail",
  "pigtails",
  "bun",
  "curly",
  "none",
] as const;
export const HATS = [
  "none",
  "beanie",
  "cap",
  "chef",
  "crown",
  "party",
  "catears",
  "headphones",
] as const;
export const GLASSES = ["none", "round", "square", "shades", "heart"] as const;
export const TOPS = ["tee", "hoodie", "sweater"] as const;
export const BOTTOMS = ["pants", "shorts", "skirt", "overalls"] as const;

export type Body = (typeof BODIES)[number];
export type Eyes = (typeof EYES)[number];
export type Mouth = (typeof MOUTHS)[number];
export type Cheeks = (typeof CHEEKS)[number];
export type FacialHair = (typeof FACIAL_HAIR)[number];
export type HairStyle = (typeof HAIR_STYLES)[number];
export type Hat = (typeof HATS)[number];
export type Glasses = (typeof GLASSES)[number];
export type Top = (typeof TOPS)[number];
export type Bottom = (typeof BOTTOMS)[number];

/**
 * Hats that come down over the hair, worn over a cut of it made to fit. The
 * rest perch on top of whatever hair is there.
 */
export const COVERING_HATS: ReadonlySet<Hat> = new Set<Hat>([
  "beanie",
  "cap",
  "chef",
]);

export interface Character {
  body: Body;
  skin: HexColor;
  eyes: Eyes;
  mouth: Mouth;
  cheeks: Cheeks;
  facialHair: FacialHair;
  hair: HairStyle;
  hairColor: HexColor;
  hat: Hat;
  hatColor: HexColor;
  glasses: Glasses;
  glassesColor: HexColor;
  top: Top;
  topColor: HexColor;
  bottom: Bottom;
  bottomColor: HexColor;
  shoesColor: HexColor;
}

/** Fields added after characters were first saved, so missing on those. */
type Later =
  | "body"
  | "eyes"
  | "mouth"
  | "cheeks"
  | "facialHair"
  | "glassesColor"
  | "bottom";

/** A character as stored, maybe from before some fields were added. */
export type StoredCharacter = Omit<Character, Later> &
  Partial<Pick<Character, Later>>;

/** What suits each body, of what a body's look turns on. */
export type BodyStyle = Pick<Character, "hair" | "bottom" | "facialHair">;

/**
 * What suits each body: characters are made from these, and switching body
 * swaps what doesn't suit the new one for the first that does. Anything else,
 * colors included, suits both.
 */
export const BODY_STYLES: Record<
  Body,
  {
    [Field in keyof BodyStyle]: readonly BodyStyle[Field][];
  }
> = {
  female: {
    bottom: ["skirt", "pants", "shorts", "overalls"],
    facialHair: ["none"],
    hair: ["long", "ponytail", "pigtails", "bun", "curly"],
  },
  male: {
    bottom: ["pants", "shorts", "overalls"],
    facialHair: FACIAL_HAIR,
    hair: ["short", "spiky", "curly", "none"],
  },
};

export function styleOf(character: Character): BodyStyle {
  const { hair, bottom, facialHair } = character;
  return { bottom, facialHair, hair };
}

function suited<T>(value: T, options: readonly T[]): T {
  return options.includes(value) ? value : (options[0] as T);
}

/**
 * The character on another body: wearing what it wore there before, if given,
 * or else with what doesn't suit the body swapped for what does.
 */
export function onBody(
  character: Character,
  body: Body,
  before?: BodyStyle
): Character {
  if (before) {
    return { ...character, ...before, body };
  }
  const suits = BODY_STYLES[body];
  return {
    ...character,
    body,
    bottom: suited(character.bottom, suits.bottom),
    facialHair: suited(character.facialHair, suits.facialHair),
    hair: suited(character.hair, suits.hair),
  };
}

/** A color picked out ahead, with a name to read it by. */
export interface Swatch {
  name: string;
  hex: HexColor;
}

export const SKIN_TONES: readonly Swatch[] = [
  { hex: "#ffe3d1", name: "Porcelain" },
  { hex: "#f9c9a7", name: "Peach" },
  { hex: "#eab38a", name: "Sand" },
  { hex: "#d99a6c", name: "Honey" },
  { hex: "#c07e4f", name: "Caramel" },
  { hex: "#9a5b34", name: "Bronze" },
  { hex: "#7a4528", name: "Mocha" },
  { hex: "#4f2c1d", name: "Espresso" },
];

export const HAIR_COLORS: readonly Swatch[] = [
  { hex: "#1f1a1a", name: "Black" },
  { hex: "#4a2f22", name: "Dark brown" },
  { hex: "#7b4a2c", name: "Brown" },
  { hex: "#9c3f24", name: "Auburn" },
  { hex: "#d2692d", name: "Ginger" },
  { hex: "#e8b25e", name: "Blonde" },
  { hex: "#efe2c4", name: "Platinum" },
  { hex: "#a7a3a0", name: "Gray" },
  { hex: "#f08bb3", name: "Pink" },
  { hex: "#4f7fd9", name: "Blue" },
];

export const CLOTHES_COLORS: readonly Swatch[] = [
  { hex: "#f4f1ea", name: "Cream" },
  { hex: "#3a3a40", name: "Charcoal" },
  { hex: "#ff7a59", name: "Coral" },
  { hex: "#e5484d", name: "Red" },
  { hex: "#f2c94c", name: "Mustard" },
  { hex: "#4cc38a", name: "Mint" },
  { hex: "#4f9ee8", name: "Sky" },
  { hex: "#3d5a80", name: "Denim" },
  { hex: "#8e7cf0", name: "Lilac" },
  { hex: "#f285b5", name: "Pink" },
  { hex: "#b89b72", name: "Khaki" },
];

export const FRAME_COLORS: readonly Swatch[] = [
  { hex: "#2b2b33", name: "Black" },
  { hex: "#7a4a2a", name: "Tortoiseshell" },
  { hex: "#c9a227", name: "Gold" },
  { hex: "#b8bcc6", name: "Silver" },
  { hex: "#e5484d", name: "Red" },
  { hex: "#f285b5", name: "Pink" },
  { hex: "#4f9ee8", name: "Sky" },
  { hex: "#4cc38a", name: "Mint" },
];

/** What fields added later start as, on characters saved before them. */
const LATER_DEFAULTS: Pick<Character, Later> = {
  body: "male",
  bottom: "pants",
  cheeks: "rosy",
  eyes: "round",
  facialHair: "none",
  glassesColor: "#2b2b33",
  mouth: "smile",
};

export function completeCharacter(stored: StoredCharacter): Character {
  return { ...LATER_DEFAULTS, ...stored };
}

/** The color fields, each of which must be `#rrggbb`. */
const COLOR_FIELDS = [
  "skin",
  "hairColor",
  "hatColor",
  "glassesColor",
  "topColor",
  "bottomColor",
  "shoesColor",
] as const satisfies readonly (keyof Character)[];

export function isCharacter(character: StoredCharacter): boolean {
  return COLOR_FIELDS.every((field) => {
    const color = character[field];
    return color === undefined || isHexColor(color);
  });
}

/** A number from a string, the same every time, to pick with. */
function hash(text: string): number {
  let value = 7;
  for (const char of text) {
    value = (value * 31 + (char.codePointAt(0) ?? 0)) % 2_147_483_647;
  }
  return value;
}

function pick<T>(items: readonly T[], seed: number): T {
  return items[seed % items.length] as T;
}

const NATURAL_HAIR = HAIR_COLORS.slice(0, 7);
const STARTING_BOTTOMS: readonly HexColor[] = ["#3d5a80", "#3a3a40", "#b89b72"];
/** What each body starts out in, most often the first. */
const STARTING_STYLES: Record<Body, readonly Bottom[]> = {
  female: ["skirt", "skirt", "pants", "shorts", "overalls"],
  male: ["pants", "pants", "pants", "shorts", "overalls"],
};

/**
 * What someone looks like before they make their character: picked from their
 * id, so everyone starts out different, and the same every time.
 */
export function startingCharacter(seed: string): Character {
  const roll = (salt: string) => hash(`${seed}:${salt}`);
  const top = pick(CLOTHES_COLORS.slice(2), roll("top")).hex;
  const body = pick(BODIES, roll("body"));
  // Bald is for picking, not for starting out.
  const hair = BODY_STYLES[body].hair.filter((style) => style !== "none");
  return {
    body,
    bottom: pick(STARTING_STYLES[body], roll("bottomStyle")),
    bottomColor: pick(STARTING_BOTTOMS, roll("bottom")),
    cheeks: roll("cheeks") % 5 === 0 ? "freckles" : "rosy",
    eyes: "round",
    facialHair: "none",
    glasses: roll("glasses") % 4 === 0 ? "round" : "none",
    glassesColor: "#2b2b33",
    hair: pick(hair, roll("hair")),
    hairColor: pick(NATURAL_HAIR, roll("hairColor")).hex,
    hat: "none",
    hatColor: top,
    mouth: "smile",
    shoesColor: "#f4f1ea",
    skin: pick(SKIN_TONES, roll("skin")).hex,
    top: pick(TOPS, roll("topStyle")),
    topColor: top,
  };
}
