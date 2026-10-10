import type {
  Body,
  Bottom,
  Character,
  Cheeks,
  Eyes,
  FacialHair,
  Glasses,
  HairStyle,
  Hat,
  Mouth,
  Swatch,
  Top,
} from "@convex/shared/character";
import {
  BODIES,
  BODY_STYLES,
  CHEEKS,
  CLOTHES_COLORS,
  EYES,
  FRAME_COLORS,
  GLASSES,
  HAIR_COLORS,
  HATS,
  MOUTHS,
  SKIN_TONES,
  TOPS,
} from "@convex/shared/character";

export type {
  Body,
  BodyStyle,
  Bottom,
  Character,
  Cheeks,
  Eyes,
  FacialHair,
  Glasses,
  HairStyle,
  Hat,
  Mouth,
  Swatch,
  Top,
} from "@convex/shared/character";
export {
  BODIES,
  BODY_STYLES,
  BOTTOMS,
  CHEEKS,
  CLOTHES_COLORS,
  COVERING_HATS,
  EYES,
  FACIAL_HAIR,
  FRAME_COLORS,
  GLASSES,
  HAIR_COLORS,
  HAIR_STYLES,
  HATS,
  MOUTHS,
  onBody,
  SKIN_TONES,
  styleOf,
  TOPS,
} from "@convex/shared/character";

export const BODY_LABELS: Record<Body, string> = {
  female: "Female",
  male: "Male",
};

export const EYE_LABELS: Record<Eyes, string> = {
  happy: "Happy",
  round: "Round",
  sleepy: "Sleepy",
  sparkly: "Sparkly",
};

export const MOUTH_LABELS: Record<Mouth, string> = {
  cat: "Cat",
  grin: "Grin",
  smile: "Smile",
  wow: "Wow",
};

export const CHEEK_LABELS: Record<Cheeks, string> = {
  freckles: "Freckles",
  plain: "Plain",
  rosy: "Rosy",
};

export const FACIAL_HAIR_LABELS: Record<FacialHair, string> = {
  beard: "Beard",
  goatee: "Goatee",
  mustache: "Mustache",
  none: "None",
};

export const HAIR_LABELS: Record<HairStyle, string> = {
  bun: "Bun",
  curly: "Curly",
  long: "Long",
  none: "None",
  pigtails: "Pigtails",
  ponytail: "Ponytail",
  short: "Short",
  spiky: "Spiky",
};

export const HAT_LABELS: Record<Hat, string> = {
  beanie: "Beanie",
  cap: "Cap",
  catears: "Cat ears",
  chef: "Chef",
  crown: "Crown",
  headphones: "Headphones",
  none: "None",
  party: "Party",
};

export const GLASSES_LABELS: Record<Glasses, string> = {
  heart: "Hearts",
  none: "None",
  round: "Round",
  shades: "Shades",
  square: "Square",
};

export const TOP_LABELS: Record<Top, string> = {
  hoodie: "Hoodie",
  sweater: "Sweater",
  tee: "T-shirt",
};

export const BOTTOM_LABELS: Record<Bottom, string> = {
  overalls: "Overalls",
  pants: "Pants",
  shorts: "Shorts",
  skirt: "Skirt",
};

export function sameCharacter(a: Character, b: Character): boolean {
  return (Object.keys(a) as (keyof Character)[]).every(
    (key) => a[key] === b[key]
  );
}

function any<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)] as T;
}

/** One of the items, or the first (none, or the plainest) most of the time. */
function sometimes<T>(items: readonly T[], chance: number): T {
  return Math.random() < chance ? any(items.slice(1)) : (items[0] as T);
}

function anyColor(swatches: readonly Swatch[]) {
  return any(swatches).hex;
}

/** A character put together by chance, for when nothing comes to mind. */
export function randomCharacter(): Character {
  const body = any(BODIES);
  const suits = BODY_STYLES[body];
  return {
    body,
    bottom: any(suits.bottom),
    bottomColor: anyColor(CLOTHES_COLORS),
    cheeks: any(CHEEKS),
    eyes: sometimes(EYES, 0.5),
    facialHair: sometimes(suits.facialHair, 0.2),
    glasses: sometimes(GLASSES, 0.35),
    glassesColor: anyColor(FRAME_COLORS),
    hair: any(suits.hair),
    hairColor: anyColor(HAIR_COLORS),
    hat: sometimes(HATS, 0.35),
    hatColor: anyColor(CLOTHES_COLORS),
    mouth: sometimes(MOUTHS, 0.5),
    shoesColor: anyColor(CLOTHES_COLORS),
    skin: anyColor(SKIN_TONES),
    top: any(TOPS),
    topColor: anyColor(CLOTHES_COLORS),
  };
}
