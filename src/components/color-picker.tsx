import { cn } from "cn";

import { HexColorPicker } from "@/components/hex-color-picker";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { Color, HexColor } from "@/lib/palette";
import { COLORS, HEX_COLORS, isHexColor, SWATCH_COLORS } from "@/lib/palette";

/** A round swatch; a ring around it marks the color picked. */
const SWATCH =
  "ring-offset-popover ring-foreground/70 size-6 rounded-full ring-offset-2 transition-shadow duration-150";

/** Every hue, softened to sit among the palette's swatches. */
const WHEEL = `conic-gradient(in oklch, ${[30, 90, 150, 210, 270, 330, 30]
  .map((hue) => `oklch(0.72 0.17 ${hue})`)
  .join(", ")})`;

/** Trims a disc to the 2px ring at its edge. */
const RING =
  "radial-gradient(closest-side, transparent calc(100% - 2.5px), #000 calc(100% - 2px))";

interface ColorPickerProps {
  /** A color off the palette leaves every swatch unpressed. */
  value: Color | HexColor;
  onChange: (color: Color) => void;
  className?: string;
  "aria-labelledby"?: string;
}

export function ColorPicker({
  value,
  onChange,
  className,
  ...props
}: ColorPickerProps) {
  return (
    <ToggleGroup
      className={cn("flex-wrap gap-2", className)}
      onValueChange={(next) => {
        const color = COLORS.find((item) => item === next[0]);
        if (color) {
          onChange(color);
        }
      }}
      value={[value]}
      {...props}
    >
      {COLORS.map((color) => (
        <ToggleGroupItem
          aria-label={color}
          className={cn(SWATCH, "data-pressed:ring-2", SWATCH_COLORS[color])}
          key={color}
          value={color}
        />
      ))}
    </ToggleGroup>
  );
}

/** A swatch to follow the palette's, opening a picker for any other color. */
export function CustomColorPicker({
  value,
  onChange,
}: {
  value: Color | HexColor;
  onChange: (color: HexColor) => void;
}) {
  const custom = isHexColor(value);
  return (
    <Popover>
      <PopoverTrigger
        aria-label={custom ? `Custom color, ${value}` : "Custom color"}
        className={cn(
          SWATCH,
          "group/custom image-outline focus-visible:ring-ring/50 relative focus-visible:ring-3"
        )}
        style={{ background: custom ? value : WHEEL }}
      >
        {custom && (
          // Once picked, the wheel becomes the ring that marks it chosen.
          <span
            aria-hidden
            className="absolute -inset-1 rounded-full group-focus-visible/custom:hidden"
            style={{
              WebkitMaskImage: RING,
              background: WHEEL,
              maskImage: RING,
            }}
          />
        )}
      </PopoverTrigger>
      <PopoverContent
        aria-label="Custom color"
        className="rounded-2xl"
        sideOffset={8}
      >
        <HexColorPicker
          onChange={onChange}
          value={custom ? value : HEX_COLORS[value]}
        />
      </PopoverContent>
    </Popover>
  );
}
