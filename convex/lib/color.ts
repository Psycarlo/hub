import { ConvexError } from "convex/values";

import type { Color, HexColor } from "../shared/palette";
import { COLORS, isHexColor } from "../shared/palette";

/** A palette color as it is, or a picked one as lowercase `#rrggbb`. */
export function cleanColor(color: string): Color | HexColor {
  const hex = color.toLowerCase();
  if (isHexColor(hex)) {
    return hex;
  }
  const named = COLORS.find((item) => item === color);
  if (!named) {
    throw new ConvexError(
      "Pick a color from the palette, or a hex like #2b7fff."
    );
  }
  return named;
}
