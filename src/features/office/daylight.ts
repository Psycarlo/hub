import { Color } from "three";

import { LIGHTS } from "../character/model";
import type { Phase } from "./phase";

export interface Palette {
  /** The sky behind the island, from the top of the view to the bottom. */
  skyTop: Color;
  skyBottom: Color;
  sun: Color;
  sunIntensity: number;
  /** Where the sun shines from, around the office's middle. */
  sunAngle: number;
  sunHeight: number;
  hemiSky: Color;
  hemiGround: Color;
  hemiIntensity: number;
  /** 0 by day to 1 at night: lamps, lit windows, glowing screens. */
  lamps: number;
  /** What windows show: the sky, lit from outside by day and glowing at night. */
  window: Color;
  clouds: Color;
}

interface Stop {
  skyTop: string;
  skyBottom: string;
  sun: string;
  sunIntensity: number;
  sunAngle: number;
  sunHeight: number;
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  lamps: number;
  window: string;
  clouds: string;
}

const STOPS: Record<Phase, Stop> = {
  // The character's own studio light, LIGHTS, out in the sun.
  day: {
    clouds: "#ffffff",
    hemiGround: LIGHTS.ground,
    hemiIntensity: 1.05,
    hemiSky: LIGHTS.sky,
    lamps: 0,
    skyBottom: "#cfeaff",
    skyTop: "#6fb7f2",
    sun: "#fff4e0",
    sunAngle: 0.5,
    sunHeight: 1.5,
    sunIntensity: 1.9,
    window: "#a9dcf5",
  },
  golden: {
    clouds: "#ffe2c4",
    hemiGround: "#c9a08a",
    hemiIntensity: 0.85,
    hemiSky: "#ffe1b8",
    lamps: 0.35,
    skyBottom: "#ffd29b",
    skyTop: "#f39a6b",
    sun: "#ffc27a",
    sunAngle: 1.15,
    sunHeight: 0.75,
    sunIntensity: 1.75,
    window: "#ffd59c",
  },
  morning: {
    clouds: "#f4f7ff",
    hemiGround: "#aab6d6",
    hemiIntensity: 0.9,
    hemiSky: "#eef3ff",
    lamps: 0.1,
    skyBottom: "#e8eefc",
    skyTop: "#9cc0ec",
    sun: "#e8efff",
    sunAngle: -0.9,
    sunHeight: 0.85,
    sunIntensity: 1.45,
    window: "#c4dcf5",
  },
  night: {
    clouds: "#5a6390",
    hemiGround: "#2a3150",
    hemiIntensity: 0.55,
    hemiSky: "#8a98d8",
    lamps: 1,
    skyBottom: "#2c3566",
    skyTop: "#0d1230",
    sun: "#9fb2ff",
    sunAngle: -0.4,
    sunHeight: 1.3,
    sunIntensity: 0.55,
    window: "#ffcf80",
  },
};

function paletteOf(stop: Stop): Palette {
  return {
    clouds: new Color(stop.clouds),
    hemiGround: new Color(stop.hemiGround),
    hemiIntensity: stop.hemiIntensity,
    hemiSky: new Color(stop.hemiSky),
    lamps: stop.lamps,
    skyBottom: new Color(stop.skyBottom),
    skyTop: new Color(stop.skyTop),
    sun: new Color(stop.sun),
    sunAngle: stop.sunAngle,
    sunHeight: stop.sunHeight,
    sunIntensity: stop.sunIntensity,
    window: new Color(stop.window),
  };
}

export const PALETTES: Record<Phase, Palette> = {
  day: paletteOf(STOPS.day),
  golden: paletteOf(STOPS.golden),
  morning: paletteOf(STOPS.morning),
  night: paletteOf(STOPS.night),
};

/** Seconds a change of phase eases in over. */
export const EASE_IN = 60;

const COLORS = [
  "skyTop",
  "skyBottom",
  "sun",
  "hemiSky",
  "hemiGround",
  "window",
  "clouds",
] as const;
const NUMBERS = [
  "sunIntensity",
  "sunAngle",
  "sunHeight",
  "hemiIntensity",
  "lamps",
] as const;

export function copyPalette(palette: Palette): Palette {
  const copy = { ...palette };
  for (const key of COLORS) {
    copy[key] = palette[key].clone();
  }
  return copy;
}

/** Sets `into` part way from one palette to another. */
export function mixPalettes(
  into: Palette,
  from: Palette,
  to: Palette,
  t: number
) {
  for (const key of COLORS) {
    into[key].copy(from[key]).lerp(to[key], t);
  }
  for (const key of NUMBERS) {
    into[key] = from[key] + (to[key] - from[key]) * t;
  }
}
