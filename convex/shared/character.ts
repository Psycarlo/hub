/**
 * Characters: the 3D figure someone walks around as. What both the server and
 * the app know about them. The ids name the parts in
 * src/features/character/character.glb, built by blender/character.py.
 */

import type { HexColor } from "./palette";
import { isHexColor } from "./palette";

export const HAIR_STYLES = ["short", "long", "bun", "curly", "none"] as const;
export const HATS = ["none", "beanie", "cap", "chef"] as const;
export const GLASSES = ["none", "round", "square", "shades"] as const;
export const TOPS = ["tee", "hoodie"] as const;

export type HairStyle = (typeof HAIR_STYLES)[number];
export type Hat = (typeof HATS)[number];
export type Glasses = (typeof GLASSES)[number];
export type Top = (typeof TOPS)[number];

export interface Character {
  skin: HexColor;
  hair: HairStyle;
  hairColor: HexColor;
  hat: Hat;
  hatColor: HexColor;
  glasses: Glasses;
  top: Top;
  topColor: HexColor;
  bottomColor: HexColor;
  shoesColor: HexColor;
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

/** The color fields, all of which must be `#rrggbb`. */
const COLOR_FIELDS = [
  "skin",
  "hairColor",
  "hatColor",
  "topColor",
  "bottomColor",
  "shoesColor",
] as const satisfies readonly (keyof Character)[];

export function isCharacter(character: Character): boolean {
  return COLOR_FIELDS.every((field) => isHexColor(character[field]));
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

const STARTING_HAIR: readonly HairStyle[] = ["short", "long", "bun", "curly"];
const NATURAL_HAIR = HAIR_COLORS.slice(0, 7);
const STARTING_BOTTOMS: readonly HexColor[] = ["#3d5a80", "#3a3a40", "#b89b72"];

/**
 * What someone looks like before they make their character: picked from their
 * id, so everyone starts out different, and the same every time.
 */
export function startingCharacter(seed: string): Character {
  const roll = (salt: string) => hash(`${seed}:${salt}`);
  const top = pick(CLOTHES_COLORS.slice(2), roll("top")).hex;
  return {
    bottomColor: pick(STARTING_BOTTOMS, roll("bottom")),
    glasses: roll("glasses") % 4 === 0 ? "round" : "none",
    hair: pick(STARTING_HAIR, roll("hair")),
    hairColor: pick(NATURAL_HAIR, roll("hairColor")).hex,
    hat: "none",
    hatColor: top,
    shoesColor: "#f4f1ea",
    // Peach, until they pick their own.
    skin: "#f9c9a7",
    top: pick(TOPS, roll("topStyle")),
    topColor: top,
  };
}
