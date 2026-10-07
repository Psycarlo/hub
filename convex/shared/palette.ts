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

export function parseColor(
  value: string | undefined,
  fallback: Color = "gray"
): Color {
  return COLORS.find((color) => color === value) ?? fallback;
}
