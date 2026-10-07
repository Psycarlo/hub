export const COLORS = [
  "gray",
  "red",
  "orange",
  "yellow",
  "green",
  "teal",
  "blue",
  "purple",
  "pink",
] as const;

export type Color = (typeof COLORS)[number];

/** A color picked off the palette, as lowercase `#rrggbb`. */
export type HexColor = `#${string}`;

const HEX_COLOR = /^#[\da-f]{6}$/u;

/** Whether the value is a picked color rather than one from the palette. */
export function isHexColor(value: string): value is HexColor {
  return HEX_COLOR.test(value);
}

export function parseColor(
  value: string | undefined,
  fallback: Color = "gray"
): Color {
  return COLORS.find((color) => color === value) ?? fallback;
}
