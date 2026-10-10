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
  "aria-label"?: string;
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
  custom = isHexColor(value),
}: {
  value: Color | HexColor;
  onChange: (color: HexColor) => void;
  /** Whether the value is off the swatches beside it; any hex is, unless said. */
  custom?: boolean;
}) {
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
          value={isHexColor(value) ? value : HEX_COLORS[value]}
        />
      </PopoverContent>
    </Popover>
  );
}

/** A color picked out ahead, with a name to read it by. */
export interface HexSwatch {
  name: string;
  hex: HexColor;
}

/** Swatches of colors picked out ahead, and the custom one after them for any other. */
export function HexSwatchPicker({
  swatches,
  value,
  onChange,
  ...props
}: {
  swatches: readonly HexSwatch[];
  value: HexColor;
  onChange: (color: HexColor) => void;
  "aria-labelledby"?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <ToggleGroup
        className="flex-wrap gap-2"
        onValueChange={(next) => {
          const swatch = swatches.find(({ hex }) => hex === next[0]);
          if (swatch) {
            onChange(swatch.hex);
          }
        }}
        value={[value]}
        {...props}
      >
        {swatches.map(({ name, hex }) => (
          <ToggleGroupItem
            aria-label={name}
            // Outlined, so the darkest swatches still stand off the popover.
            className={cn(
              SWATCH,
              "shadow-[inset_0_0_0_1px_rgb(0_0_0/0.1)] data-pressed:ring-2 dark:shadow-[inset_0_0_0_1px_rgb(255_255_255/0.2)]"
            )}
            key={hex}
            style={{ background: hex }}
            value={hex}
          />
        ))}
      </ToggleGroup>
      <CustomColorPicker
        custom={!swatches.some(({ hex }) => hex === value)}
        onChange={onChange}
        value={value}
      />
    </div>
  );
}
