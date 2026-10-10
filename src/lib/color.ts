import type { HexColor } from "@/lib/palette";

/** Hue in degrees, saturation and brightness from 0 to 1: how a picker moves through color. */
export interface Hsv {
  h: number;
  s: number;
  v: number;
}

/** Three hex digits, or six. */
const HEX_DIGITS = /^(?:[\da-f]{3}){1,2}$/u;

/**
 * Past this OKLab lightness, dark text reads better than white. The palette's
 * greens and teals sit just under it with white text, its yellow well over.
 */
const LIGHT = 0.75;

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Reads a typed hex, with or without `#`, short like `abc` or long. */
export function parseHex(input: string): HexColor | undefined {
  const digits = input.trim().replace(/^#/u, "").toLowerCase();
  if (!HEX_DIGITS.test(digits)) {
    return undefined;
  }
  return digits.length === 3
    ? `#${[...digits].map((digit) => digit + digit).join("")}`
    : `#${digits}`;
}

function rgb(hex: HexColor): [number, number, number] {
  const channel = (start: number) =>
    Number.parseInt(hex.slice(start, start + 2), 16) / 255;
  return [channel(1), channel(3), channel(5)];
}

export function hsvToHex({ h, s, v }: Hsv): HexColor {
  const channel = (offset: number) => {
    const k = (offset + h / 60) % 6;
    const value = v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
    return Math.round(value * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${channel(5)}${channel(3)}${channel(1)}`;
}

/**
 * The hex as hue, saturation and brightness. Greys carry no hue, and black no
 * saturation either; those come from `previous`, so a picker's thumbs stay put.
 */
export function hexToHsv(hex: HexColor, previous?: Hsv): Hsv {
  const [r, g, b] = rgb(hex);
  const max = Math.max(r, g, b);
  const delta = max - Math.min(r, g, b);
  let h = previous?.h ?? 0;
  if (delta > 0 && max === r) {
    h = 60 * (((g - b) / delta + 6) % 6);
  } else if (delta > 0 && max === g) {
    h = 60 * ((b - r) / delta + 2);
  } else if (delta > 0) {
    h = 60 * ((r - g) / delta + 4);
  }
  const s = max > 0 ? delta / max : (previous?.s ?? 0);
  return { h, s, v: max };
}

/** `color` moved toward `other` by `amount`, from 0 to 1, in sRGB. */
export function mixHex(
  color: HexColor,
  other: HexColor,
  amount: number
): HexColor {
  const from = rgb(color);
  const to = rgb(other);
  const channel = (index: 0 | 1 | 2) =>
    Math.round((from[index] + (to[index] - from[index]) * amount) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${channel(0)}${channel(1)}${channel(2)}`;
}

function linear(channel: number): number {
  return channel <= 0.04045
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4;
}

/** Whether dark text reads better on the color than white, by its OKLab lightness. */
export function isLight(hex: HexColor): boolean {
  const [r, g, b] = rgb(hex);
  const [lr, lg, lb] = [linear(r), linear(g), linear(b)] as const;
  const l = Math.cbrt(
    0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb
  );
  const m = Math.cbrt(
    0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb
  );
  const s = Math.cbrt(
    0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb
  );
  return 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s > LIGHT;
}
