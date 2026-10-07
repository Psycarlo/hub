import { Slider } from "@base-ui/react/slider";
import { cn } from "cn";
import type { KeyboardEvent, PointerEvent } from "react";
import { useRef, useState } from "react";

import type { Hsv } from "@/lib/color";
import { clamp01, hexToHsv, hsvToHex, parseHex } from "@/lib/color";
import type { HexColor } from "@/lib/palette";

/** The thumbs' width; the hue track's colors sit in half of it from each end. */
const THUMB_SIZE = "1.125rem";

/** A white ring around the color it stands on, lifted off any background. */
const THUMB =
  "size-4.5 rounded-full border-2 border-white shadow-[0_0_0_1px_rgb(0_0_0/0.12),0_1px_3px_rgb(0_0_0/0.3)] transition-[scale] duration-150 ease-out";

const HUES = [0, 60, 120, 180, 240, 300, 360];

/** Every hue, laid out so the thumb's center always sits on its own. */
const HUE_TRACK = `linear-gradient(to right, ${HUES.map(
  (hue) =>
    `hsl(${hue} 100% 50%) calc(${THUMB_SIZE} / 2 + (100% - ${THUMB_SIZE}) * ${hue / 360})`
).join(", ")})`;

/** Which way each arrow key moves across saturation and brightness. */
const NUDGES: Record<string, [saturation: number, brightness: number]> = {
  ArrowDown: [0, -1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, 1],
};

/** Saturation across and brightness up, for the hue set below. */
function ColorArea({
  hsv,
  color,
  onChange,
}: {
  hsv: Hsv;
  color: HexColor;
  onChange: (hsv: Hsv) => void;
}) {
  // The pointer dragging the thumb; others are ignored until it lets go.
  const pointer = useRef<number | null>(null);
  const saturation = Math.round(hsv.s * 100);
  const brightness = Math.round(hsv.v * 100);

  const moveTo = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    onChange({
      h: hsv.h,
      s: clamp01((event.clientX - rect.left) / rect.width),
      v: clamp01(1 - (event.clientY - rect.top) / rect.height),
    });
  };

  const nudge = (event: KeyboardEvent<HTMLDivElement>) => {
    const direction = NUDGES[event.key];
    if (!direction) {
      return;
    }
    event.preventDefault();
    const step = event.shiftKey ? 0.1 : 0.01;
    onChange({
      h: hsv.h,
      s: clamp01(hsv.s + direction[0] * step),
      v: clamp01(hsv.v + direction[1] * step),
    });
  };

  return (
    <div
      aria-label="Saturation and brightness"
      aria-roledescription="2D slider"
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={saturation}
      aria-valuetext={`Saturation ${saturation}%, brightness ${brightness}%`}
      className="group/area image-outline relative aspect-square touch-none rounded-sm select-none"
      onKeyDown={nudge}
      onLostPointerCapture={() => {
        pointer.current = null;
      }}
      onPointerDown={(event) => {
        if (pointer.current !== null || event.button !== 0) {
          return;
        }
        pointer.current = event.pointerId;
        event.currentTarget.setPointerCapture(event.pointerId);
        moveTo(event);
      }}
      onPointerMove={(event) => {
        if (event.pointerId === pointer.current) {
          moveTo(event);
        }
      }}
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- no native input slides two ways
      role="slider"
      style={{
        backgroundColor: `hsl(${hsv.h} 100% 50%)`,
        backgroundImage:
          "linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent)",
      }}
      tabIndex={0}
    >
      <div
        className={cn(
          THUMB,
          "group-focus-visible/area:ring-ring pointer-events-none absolute -translate-1/2 group-focus-visible/area:scale-110 group-focus-visible/area:ring-2"
        )}
        style={{
          backgroundColor: color,
          left: `${hsv.s * 100}%`,
          top: `${(1 - hsv.v) * 100}%`,
        }}
      />
    </div>
  );
}

function HueSlider({
  hue,
  onChange,
}: {
  hue: number;
  onChange: (hue: number) => void;
}) {
  return (
    <Slider.Root
      max={360}
      onValueChange={onChange}
      thumbAlignment="edge"
      value={hue}
    >
      <Slider.Control className="flex touch-none items-center py-1 select-none">
        <Slider.Track
          className="image-outline relative h-3 w-full rounded-full"
          style={{ backgroundImage: HUE_TRACK }}
        >
          <Slider.Thumb
            aria-label="Hue"
            className={cn(
              THUMB,
              "has-focus-visible:ring-ring has-focus-visible:scale-110 has-focus-visible:ring-2"
            )}
            style={{ backgroundColor: `hsl(${hue} 100% 50%)` }}
          />
        </Slider.Track>
      </Slider.Control>
    </Slider.Root>
  );
}

/** The color as hex, to copy or type over; typing applies once it's whole. */
function HexInput({
  value,
  onChange,
}: {
  value: HexColor;
  onChange: (hex: HexColor) => void;
}) {
  // What's typed while the field has focus; unset, the field shows the color.
  const [draft, setDraft] = useState<string>();

  const commit = () => {
    const hex = draft === undefined ? undefined : parseHex(draft);
    if (hex && hex !== value) {
      onChange(hex);
    }
    setDraft(undefined);
  };

  return (
    <label className="border-input bg-card focus-within:border-ring focus-within:ring-ring/30 dark:bg-input/30 flex h-8 items-center rounded-sm border pr-1.25 pl-0.75 transition-[border-color,box-shadow] focus-within:ring-3">
      <span
        aria-hidden
        className="image-outline size-6 shrink-0 rounded-xs"
        style={{ backgroundColor: value }}
      />
      <span
        aria-hidden
        className="text-muted-foreground ml-2 font-mono text-base select-none md:text-sm"
      >
        #
      </span>
      <input
        aria-label="Hex color"
        autoCapitalize="off"
        autoComplete="off"
        className="h-full min-w-0 flex-1 bg-transparent font-mono text-base uppercase outline-none md:text-sm"
        onBlur={commit}
        onChange={(event) => {
          const next = event.target.value.replaceAll(/[#\s]/gu, "");
          setDraft(next);
          const hex = next.length === 6 ? parseHex(next) : undefined;
          if (hex) {
            onChange(hex);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          }
        }}
        spellCheck={false}
        value={draft ?? value.slice(1)}
      />
      <span
        aria-hidden
        className="bg-muted text-muted-foreground flex h-5 items-center rounded-xs px-1.5 font-mono text-[0.625rem] leading-none font-medium select-none"
      >
        HEX
      </span>
    </label>
  );
}

/**
 * Picks any color: saturation and brightness on the square, hue on the slider
 * below it, or typed as hex.
 */
export function HexColorPicker({
  value,
  onChange,
  className,
}: {
  value: HexColor;
  onChange: (color: HexColor) => void;
  className?: string;
}) {
  const [hsv, setHsv] = useState(() => hexToHsv(value));
  const [shown, setShown] = useState(value);
  const color = hsvToHex(hsv);
  // A value from outside rather than one picked here: move to it.
  if (value !== shown) {
    setShown(value);
    if (value !== color) {
      setHsv(hexToHsv(value, hsv));
    }
  }

  const change = (next: Hsv) => {
    setHsv(next);
    onChange(hsvToHex(next));
  };

  return (
    <div className={cn("flex w-56 flex-col gap-3", className)}>
      <ColorArea color={color} hsv={hsv} onChange={change} />
      <HueSlider hue={hsv.h} onChange={(h) => change({ ...hsv, h })} />
      <HexInput onChange={(hex) => change(hexToHsv(hex, hsv))} value={color} />
    </div>
  );
}
