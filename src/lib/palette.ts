import type { Color, HexColor } from "@convex/shared/palette";
import { COLORS, isHexColor } from "@convex/shared/palette";
import type { CSSProperties } from "react";

import { isLight } from "@/lib/color";

export type { Color, HexColor } from "@convex/shared/palette";
export {
  COLORS,
  HEX_COLORS,
  isHexColor,
  nearestColor,
  parseColor,
} from "@convex/shared/palette";

/** Tinted background with readable text, for option chips. */
export const CHIP_COLORS: Record<Color, string> = {
  blue: "bg-blue-500/12 text-blue-800 dark:bg-blue-400/16 dark:text-blue-200",
  gray: "bg-foreground/7 text-foreground/80",
  green:
    "bg-green-500/14 text-green-800 dark:bg-green-400/16 dark:text-green-200",
  orange:
    "bg-orange-500/14 text-orange-800 dark:bg-orange-400/16 dark:text-orange-200",
  pink: "bg-pink-500/12 text-pink-800 dark:bg-pink-400/16 dark:text-pink-200",
  purple:
    "bg-violet-500/12 text-violet-800 dark:bg-violet-400/16 dark:text-violet-200",
  red: "bg-red-500/12 text-red-800 dark:bg-red-400/16 dark:text-red-200",
  teal: "bg-teal-500/14 text-teal-800 dark:bg-teal-400/16 dark:text-teal-200",
  yellow:
    "bg-yellow-400/25 text-yellow-900 dark:bg-yellow-300/16 dark:text-yellow-100",
};

/** The swatch's color as text, for icons and strokes drawn in it. */
export const TEXT_COLORS: Record<Color, string> = {
  blue: "text-blue-500",
  gray: "text-neutral-400 dark:text-neutral-500",
  green: "text-green-500",
  orange: "text-orange-500",
  pink: "text-pink-500",
  purple: "text-violet-500",
  red: "text-red-500",
  teal: "text-teal-500",
  yellow: "text-yellow-400",
};

/** Solid swatch for dots, bars and badges. */
export const SWATCH_COLORS: Record<Color, string> = {
  blue: "bg-blue-500",
  gray: "bg-neutral-400 dark:bg-neutral-500",
  green: "bg-green-500",
  orange: "bg-orange-500",
  pink: "bg-pink-500",
  purple: "bg-violet-500",
  red: "bg-red-500",
  teal: "bg-teal-500",
  yellow: "bg-yellow-400",
};

/** What reads on each swatch: white, but dark on yellow, which is too light for it. */
export const ON_SWATCH: Record<Color, string> = {
  blue: "text-white",
  gray: "text-white",
  green: "text-white",
  orange: "text-white",
  pink: "text-white",
  purple: "text-white",
  red: "text-white",
  teal: "text-white",
  yellow: "text-yellow-950",
};

/** How a color is laid on: tinted with readable text, solid, solid with text on it, or as text and strokes. */
export type Look = "chip" | "swatch" | "onSwatch" | "text";

const PALETTE_LOOKS: Record<Look, Record<Color, string>> = {
  chip: CHIP_COLORS,
  onSwatch: Object.fromEntries(
    COLORS.map((color) => [
      color,
      `${SWATCH_COLORS[color]} ${ON_SWATCH[color]}`,
    ])
  ) as Record<Color, string>,
  swatch: SWATCH_COLORS,
  text: TEXT_COLORS,
};

/**
 * A picked color's looks, read off the `--tone` its style sets. Chip text
 * keeps a lightness of its own, like the palette's 800 and 200 shades, so
 * whatever was picked still reads on its tint.
 */
const HEX_LOOKS: Record<Exclude<Look, "onSwatch">, string> = {
  chip: "bg-(--tone)/14 text-[oklch(from_var(--tone)_0.45_calc(c*0.6)_h)] dark:bg-(--tone)/16 dark:text-[oklch(from_var(--tone)_0.9_calc(c*0.4)_h)]",
  swatch: "bg-(--tone)",
  text: "text-(--tone)",
};

/** Class and style that lay a color on an element. */
export interface Paint {
  className: string;
  style?: CSSProperties;
}

/** How to lay a palette color, or one picked off it, on an element. */
export function paint(color: Color | HexColor, look: Look): Paint {
  if (!isHexColor(color)) {
    return { className: PALETTE_LOOKS[look][color] };
  }
  return {
    className:
      look === "onSwatch"
        ? `${HEX_LOOKS.swatch} ${isLight(color) ? "text-black/75" : "text-white"}`
        : HEX_LOOKS[look],
    style: { "--tone": color } as CSSProperties,
  };
}
