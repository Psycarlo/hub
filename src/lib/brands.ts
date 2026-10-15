import type { Doc } from "@convex/_generated/dataModel";
import type { BrandFile } from "@convex/brands";
import type { LogoKind, LogoMode } from "@convex/shared/brands";
import { shownFile } from "@convex/shared/brands";

import type { HexColor } from "@/lib/palette";
import { slugify } from "@/lib/project";

export type { BrandFile } from "@convex/brands";
export {
  FONT_SOURCES,
  FONT_WEIGHTS,
  LOGO_KINDS,
  LOGO_MODES,
  MAX_BANNERS,
  MAX_BRAND_DESCRIPTION,
  MAX_BRAND_NAME,
  MAX_COLORS,
  MAX_COLOR_NAME,
  MAX_FILE_LINKS,
  MAX_FONTS,
  MAX_FONT_FAMILY,
  MAX_FONT_FILES,
  MAX_FONT_ROLE,
  MAX_SLOT_FILES,
  MAX_SOCIALS,
  isShown,
  placeFit,
  samePlace,
  shownFile,
} from "@convex/shared/brands";
export type {
  BrandPlace,
  FontSource,
  LogoKind,
  LogoMode,
} from "@convex/shared/brands";

export type Brand = Doc<"brands">;
export type BrandColor = Brand["colors"][number];
export type BrandFont = Brand["fonts"][number];

export const LOGO_NAMES: Record<LogoKind, string> = {
  icon: "App icon",
  lockup: "Lockup",
  symbol: "Symbol",
  wordmark: "Wordmark",
};

/** What each logo is, for whoever fills its slot. */
export const LOGO_HINTS: Record<LogoKind, string> = {
  icon: "Square, for apps and favicons",
  lockup: "Symbol and name together",
  symbol: "The mark on its own",
  wordmark: "The name, lettered",
};

export const MODE_NAMES: Record<LogoMode, string> = {
  dark: "On dark",
  light: "On light",
};

/** The backgrounds logos are shown on: the ones they're drawn for. */
export const MODE_BACKGROUNDS: Record<LogoMode, HexColor> = {
  dark: "#0b0c0f",
  light: "#ffffff",
};

export const WEIGHT_NAMES: Record<number, string> = {
  100: "Thin",
  200: "Extra Light",
  300: "Light",
  400: "Regular",
  500: "Medium",
  600: "Semibold",
  700: "Bold",
  800: "Extra Bold",
  900: "Black",
};

/** A short id for a new color or typeface, unique within its brand. */
export function newId(): string {
  return crypto.randomUUID().slice(0, 8);
}

/** The files in a logo slot, oldest first. */
export function slotFiles(
  files: BrandFile[],
  kind: LogoKind,
  mode: LogoMode
): BrandFile[] {
  return files.filter(
    ({ place }) =>
      place.kind === "logo" && place.logo === kind && place.mode === mode
  );
}

export function logoFiles(files: BrandFile[]): BrandFile[] {
  return files.filter(({ place }) => place.kind === "logo");
}

export function bannerFiles(files: BrandFile[]): BrandFile[] {
  return files.filter(({ place }) => place.kind === "banner");
}

export function fontFiles(files: BrandFile[], fontId: string): BrandFile[] {
  return files.filter(
    ({ place }) => place.kind === "font" && place.fontId === fontId
  );
}

/** The logo of a kind to show for a background: one made for it, else the other's. */
export function logoFor(
  files: BrandFile[],
  kinds: LogoKind[],
  mode: LogoMode
): { file: BrandFile; mode: LogoMode } | undefined {
  const other: LogoMode = mode === "light" ? "dark" : "light";
  for (const wanted of [mode, other]) {
    for (const kind of kinds) {
      const file = shownFile(slotFiles(files, kind, wanted));
      if (file) {
        return { file, mode: wanted };
      }
    }
  }
  return undefined;
}

/** The file's extension, lowercase without its dot, or empty. */
export function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

/** The format a file is in, as people call it: "SVG", "PNG", "PDF". */
export function formatOf(file: { name: string; type: string }): string {
  const extension = extensionOf(file.name);
  if (extension) {
    return extension === "jpeg" ? "JPG" : extension.toUpperCase();
  }
  return file.type.split("/").at(-1)?.split("+")[0]?.toUpperCase() ?? "File";
}

/** The brand's name as file names start with it. */
export function brandSlug(brand: Pick<Brand, "title">): string {
  return slugify(brand.title) || "brand";
}

// Colors ----------------------------------------------------------------------

/** The color's channels, 0 to 255. */
export function hexRgb(hex: HexColor): [number, number, number] {
  return [1, 3, 5].map((start) =>
    Number.parseInt(hex.slice(start, start + 2), 16)
  ) as [number, number, number];
}

export function formatRgb(hex: HexColor): string {
  return hexRgb(hex).join(", ");
}

/** Hue in degrees, saturation and lightness in percent. */
export function hexHsl(hex: HexColor): [number, number, number] {
  const [r, g, b] = hexRgb(hex).map((channel) => channel / 255) as [
    number,
    number,
    number,
  ];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  const delta = max - min;
  if (delta === 0) {
    return [0, 0, Math.round(lightness * 100)];
  }
  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  let hue = 0;
  if (max === r) {
    hue = ((g - b) / delta + 6) % 6;
  } else if (max === g) {
    hue = (b - r) / delta + 2;
  } else {
    hue = (r - g) / delta + 4;
  }
  return [
    Math.round(hue * 60) % 360,
    Math.round(saturation * 100),
    Math.round(lightness * 100),
  ];
}

export function formatHsl(hex: HexColor): string {
  const [h, s, l] = hexHsl(hex);
  return `${h}°, ${s}%, ${l}%`;
}

/** A plain conversion, without a print profile: a starting point for the printer. */
export function hexCmyk(hex: HexColor): [number, number, number, number] {
  const [r, g, b] = hexRgb(hex).map((channel) => channel / 255) as [
    number,
    number,
    number,
  ];
  const key = 1 - Math.max(r, g, b);
  if (key === 1) {
    return [0, 0, 0, 100];
  }
  const ink = (channel: number) =>
    Math.round(((1 - channel - key) / (1 - key)) * 100);
  return [ink(r), ink(g), ink(b), Math.round(key * 100)];
}

export function formatCmyk(hex: HexColor): string {
  return hexCmyk(hex).join(", ");
}

/** WCAG's relative luminance. */
function luminance(hex: HexColor): number {
  const [r, g, b] = hexRgb(hex).map((value) => {
    const channel = value / 255;
    return channel <= 0.03928
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** How far apart two colors read, from 1 to 21, as WCAG measures it. */
export function contrast(a: HexColor, b: HexColor): number {
  const [light, dark] = [luminance(a), luminance(b)].toSorted((x, y) => y - x);
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
}

/** What text the contrast passes WCAG for: body text at AA or AAA, or large text only. */
export function contrastGrade(ratio: number): "AAA" | "AA" | "AA Large" | "—" {
  if (ratio >= 7) {
    return "AAA";
  }
  if (ratio >= 4.5) {
    return "AA";
  }
  return ratio >= 3 ? "AA Large" : "—";
}

/** Names for the colors as tokens: their names slugged, else their place, none twice. */
export function tokenNames(colors: BrandColor[]): string[] {
  const taken = new Set<string>();
  return colors.map((color, index) => {
    const base = slugify(color.name) || `color-${index + 1}`;
    let name = base;
    for (let number = 2; taken.has(name); number += 1) {
      name = `${base}-${number}`;
    }
    taken.add(name);
    return name;
  });
}

export type TokenFormat = "css" | "tailwind" | "json";

export const TOKEN_FORMATS: { format: TokenFormat; label: string }[] = [
  { format: "css", label: "CSS variables" },
  { format: "tailwind", label: "Tailwind theme" },
  { format: "json", label: "JSON" },
];

/** The palette as code to paste: CSS variables, a Tailwind v4 theme, or JSON. */
export function paletteTokens(
  brand: Pick<Brand, "colors" | "title">,
  format: TokenFormat
): string {
  const names = tokenNames(brand.colors);
  const pairs = brand.colors.map((color, index) => [
    names[index] ?? "",
    color.hex,
  ]);
  const slug = brandSlug(brand);
  if (format === "json") {
    return `${JSON.stringify(Object.fromEntries(pairs), null, 2)}\n`;
  }
  const lines = pairs.map(([name, hex]) =>
    format === "css"
      ? `  --${slug}-${name}: ${hex};`
      : `  --color-${name}: ${hex};`
  );
  return `${format === "css" ? ":root" : "@theme"} {\n${lines.join("\n")}\n}\n`;
}

/** A gradient across the palette, for where there's no banner to show. */
export function paletteGradient(colors: BrandColor[]): string | undefined {
  const [first, second, third] = colors;
  if (!first) {
    return undefined;
  }
  const end = second ?? first;
  const glow = third ?? end;
  return [
    `radial-gradient(120% 140% at 85% 0%, ${glow.hex}cc 0%, transparent 55%)`,
    `radial-gradient(90% 120% at 0% 100%, ${end.hex} 0%, transparent 60%)`,
    `linear-gradient(135deg, ${first.hex}, ${end.hex})`,
  ].join(", ");
}

// Type ------------------------------------------------------------------------

const WEIGHT_WORDS: [RegExp, number][] = [
  [/hairline|thin/u, 100],
  [/extra-?light|ultra-?light/u, 200],
  [/light/u, 300],
  [/semi-?bold|demi-?bold/u, 600],
  [/extra-?bold|ultra-?bold/u, 800],
  [/black|heavy/u, 900],
  [/bold/u, 700],
  [/medium/u, 500],
];

/** A font file's weight and style, told by its name, like `Inter-SemiBoldItalic.woff2`. */
export function faceOfFile(name: string): {
  weight: number;
  style: "normal" | "italic";
} {
  const words = name.toLowerCase().replace(/\.[^.]+$/u, "");
  const weight =
    WEIGHT_WORDS.find(([pattern]) => pattern.test(words))?.[1] ?? 400;
  const numbered = /(?:^|\D)(?<weight>[1-9]00)(?:\D|$)/u.exec(words)?.groups
    ?.weight;
  return {
    style: /italic|oblique/u.test(words) ? "italic" : "normal",
    weight: numbered ? Number(numbered) : weight,
  };
}

/** The weights a typeface comes in: picked from Google, or told by its files. */
export function fontWeights(font: BrandFont, files: BrandFile[]): number[] {
  if (font.source === "google") {
    return font.weights.length > 0 ? font.weights : [400];
  }
  const weights = new Set(
    fontFiles(files, font.id).map((file) => faceOfFile(file.name).weight)
  );
  return [...weights].toSorted((a, b) => a - b);
}

/**
 * The family the page draws a typeface in. Uploaded ones go by a name of
 * their own, so they never mix with a font of the same name on the device.
 */
export function cssFamily(
  font: Pick<BrandFont, "family" | "id" | "source">
): string {
  const family =
    font.source === "google" ? font.family : `${font.family} ${font.id}`;
  return `"${family.replaceAll('"', "")}", ui-sans-serif, system-ui, sans-serif`;
}

/** Where Google Fonts serves the family in the weights, or in its default without any. */
export function googleFontsUrl(family: string, weights: number[] = []): string {
  const name = encodeURIComponent(family.trim()).replaceAll("%20", "+");
  const axis = weights.length > 0 ? `:wght@${weights.join(";")}` : "";
  return `https://fonts.googleapis.com/css2?family=${name}${axis}&display=swap`;
}

/** The family's page on Google Fonts. */
export function googleFontsPage(family: string): string {
  return `https://fonts.google.com/specimen/${family.trim().replaceAll(" ", "+")}`;
}
