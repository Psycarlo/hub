/** A project's brands: what both the server and the app know about them. */

/** The logos a brand keeps, each in a slot of its own. */
export const LOGO_KINDS = ["symbol", "wordmark", "lockup", "icon"] as const;
/** What a logo is drawn to sit on: dark ink for light backgrounds, light ink for dark. */
export const LOGO_MODES = ["light", "dark"] as const;
/** Where a typeface comes from: Google Fonts by its name, or files uploaded. */
export const FONT_SOURCES = ["google", "file"] as const;

export type LogoKind = (typeof LOGO_KINDS)[number];
export type LogoMode = (typeof LOGO_MODES)[number];
export type FontSource = (typeof FONT_SOURCES)[number];

/** The weights a typeface can come in, thin to black. */
export const FONT_WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900];

export const MAX_BRAND_NAME = 80;
export const MAX_BRAND_DESCRIPTION = 1000;
export const MAX_COLORS = 24;
export const MAX_COLOR_NAME = 40;
export const MAX_FONTS = 8;
export const MAX_FONT_FAMILY = 80;
export const MAX_FONT_ROLE = 40;
export const MAX_SOCIALS = 16;
export const MAX_URL = 500;
/** Formats one logo slot keeps, like the same logo as SVG, PNG and PDF. */
export const MAX_SLOT_FILES = 6;
export const MAX_BANNERS = 8;
/** Files one uploaded typeface keeps: its weights and italics. */
export const MAX_FONT_FILES = 18;
/** Download links asked for at once. */
export const MAX_FILE_LINKS = 50;

/** Kept in the order a logo stands for the brand when there's no symbol. */
const MARK_ORDER: LogoKind[] = ["symbol", "icon", "lockup", "wordmark"];

/** Images a browser shows in place, best first: an SVG stays sharp at any size. */
const SHOWN_TYPES = [
  "image/svg+xml",
  "image/png",
  "image/webp",
  "image/avif",
  "image/jpeg",
  "image/gif",
];

/** Where a brand's file sits: in a logo slot, among its banners, or with a typeface. */
export type BrandPlace =
  | { kind: "logo"; logo: LogoKind; mode: LogoMode }
  | { kind: "banner" }
  | { kind: "font"; fontId: string };

/** How well a file shows in place: lower is better, and -1 doesn't show at all. */
export function shownRank(type: string): number {
  return SHOWN_TYPES.indexOf(type.toLowerCase());
}

export function isShown(type: string): boolean {
  return shownRank(type) >= 0;
}

const FONT_FILE = /\.(?:woff2?|otf|ttf)$/iu;
/** Logos that aren't images to a browser: vectors and print files. */
const LOGO_FILE = /\.(?:svg|pdf|eps|ai)$/iu;

/** What a place takes, and what's said of a file it doesn't. */
export function placeFit(place: BrandPlace): {
  fits: (file: { name: string; type: string }) => boolean;
  misfit: string;
} {
  if (place.kind === "banner") {
    return {
      fits: (file) => isShown(file.type),
      misfit: "Banners are images, like PNG, JPG, WebP or SVG.",
    };
  }
  if (place.kind === "font") {
    return {
      fits: (file) => FONT_FILE.test(file.name),
      misfit: "Typefaces take WOFF2, WOFF, OTF or TTF files.",
    };
  }
  return {
    fits: (file) => file.type.startsWith("image/") || LOGO_FILE.test(file.name),
    misfit: "Logos take images, like SVG or PNG, or PDF, EPS and AI files.",
  };
}

/** Whether two places are the same slot. */
export function samePlace(a: BrandPlace, b: BrandPlace): boolean {
  if (a.kind === "logo" && b.kind === "logo") {
    return a.logo === b.logo && a.mode === b.mode;
  }
  if (a.kind === "font" && b.kind === "font") {
    return a.fontId === b.fontId;
  }
  return a.kind === b.kind;
}

/** The file of a slot to show: the best image among its formats. */
export function shownFile<T extends { type: string; _creationTime: number }>(
  files: T[]
): T | undefined {
  return files
    .filter((file) => isShown(file.type))
    .toSorted(
      (a, b) =>
        shownRank(a.type) - shownRank(b.type) ||
        a._creationTime - b._creationTime
    )[0];
}

/**
 * The logo that stands for the brand on cards and in lists: its symbol for
 * light backgrounds if there's one, else whatever logo comes closest.
 */
export function pickMark<
  T extends { place: BrandPlace; type: string; _creationTime: number },
>(files: T[]): { file: T; mode: LogoMode } | undefined {
  for (const mode of LOGO_MODES) {
    for (const kind of MARK_ORDER) {
      const file = shownFile(
        files.filter(
          ({ place }) =>
            place.kind === "logo" && place.logo === kind && place.mode === mode
        )
      );
      if (file) {
        return { file, mode };
      }
    }
  }
  return undefined;
}

/** The banner that leads the brand: the first one shown in place. */
export function pickCover<
  T extends { place: BrandPlace; type: string; _creationTime: number },
>(files: T[]): T | undefined {
  return files
    .filter((file) => file.place.kind === "banner" && isShown(file.type))
    .toSorted((a, b) => a._creationTime - b._creationTime)[0];
}
