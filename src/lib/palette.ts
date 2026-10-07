import type { Color, HexColor } from "@convex/shared/palette";

export type { Color, HexColor } from "@convex/shared/palette";
export { COLORS, isHexColor, parseColor } from "@convex/shared/palette";

/** Each swatch as hex, where picking a custom color starts from. */
export const HEX_COLORS: Record<Color, HexColor> = {
  blue: "#2b7fff",
  gray: "#a1a1a1",
  green: "#00c950",
  orange: "#ff6900",
  pink: "#f6339a",
  purple: "#8e51ff",
  red: "#fb2c36",
  teal: "#00bba7",
  yellow: "#fdc700",
};

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
