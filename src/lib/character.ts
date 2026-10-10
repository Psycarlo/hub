import type {
  Character,
  Glasses,
  HairStyle,
  Hat,
  Swatch,
  Top,
} from "@convex/shared/character";
import {
  CLOTHES_COLORS,
  GLASSES,
  HAIR_COLORS,
  HAIR_STYLES,
  HATS,
  SKIN_TONES,
  TOPS,
} from "@convex/shared/character";

export type {
  Character,
  Glasses,
  HairStyle,
  Hat,
  Swatch,
  Top,
} from "@convex/shared/character";
export {
  CLOTHES_COLORS,
  GLASSES,
  HAIR_COLORS,
  HAIR_STYLES,
  HATS,
  SKIN_TONES,
  TOPS,
} from "@convex/shared/character";

export const HAIR_LABELS: Record<HairStyle, string> = {
  bun: "Bun",
  curly: "Curly",
  long: "Long",
  none: "None",
  short: "Short",
};

export const HAT_LABELS: Record<Hat, string> = {
  beanie: "Beanie",
  cap: "Cap",
  chef: "Chef",
  none: "None",
};

export const GLASSES_LABELS: Record<Glasses, string> = {
  none: "None",
  round: "Round",
  shades: "Shades",
  square: "Square",
};

export const TOP_LABELS: Record<Top, string> = {
  hoodie: "Hoodie",
  tee: "T-shirt",
};

export function sameCharacter(a: Character, b: Character): boolean {
  return (Object.keys(a) as (keyof Character)[]).every(
    (key) => a[key] === b[key]
  );
}

function any<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)] as T;
}

function anyColor(swatches: readonly Swatch[]) {
  return any(swatches).hex;
}

/** A character put together by chance, for when nothing comes to mind. */
export function randomCharacter(): Character {
  return {
    bottomColor: anyColor(CLOTHES_COLORS),
    // Mostly bare-faced and bare-headed, as people tend to be.
    glasses: Math.random() < 0.35 ? any(GLASSES.slice(1)) : "none",
    hair: any(HAIR_STYLES),
    hairColor: anyColor(HAIR_COLORS),
    hat: Math.random() < 0.35 ? any(HATS.slice(1)) : "none",
    hatColor: anyColor(CLOTHES_COLORS),
    shoesColor: anyColor(CLOTHES_COLORS),
    skin: anyColor(SKIN_TONES),
    top: any(TOPS),
    topColor: anyColor(CLOTHES_COLORS),
  };
}
