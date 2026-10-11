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

function channels(hex: HexColor): [number, number, number] {
  return [1, 3, 5].map((start) =>
    Number.parseInt(hex.slice(start, start + 2), 16)
  ) as [number, number, number];
}

/** The palette's color closest to a picked one, or the color itself when it's on the palette. */
export function nearestColor(value: Color | HexColor): Color {
  if (!isHexColor(value)) {
    return value;
  }
  const [r, g, b] = channels(value);
  let nearest: Color = "gray";
  let best = Number.POSITIVE_INFINITY;
  for (const color of COLORS) {
    const [cr, cg, cb] = channels(HEX_COLORS[color]);
    const distance = (r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2;
    if (distance < best) {
      best = distance;
      nearest = color;
    }
  }
  return nearest;
}

export function parseColor(
  value: string | undefined,
  fallback: Color = "gray"
): Color {
  return COLORS.find((color) => color === value) ?? fallback;
}
