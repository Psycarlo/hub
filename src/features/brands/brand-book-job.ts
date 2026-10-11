/**
 * Gathers what a brand book is drawn from, in the browser: logos and banners
 * fetched and turned into PNG or JPEG, since PDFs take neither SVG nor WebP,
 * and each typeface's specimen drawn on a canvas in the typeface itself, as
 * the page shows it. Then it's drawn and saved.
 */
import { toast } from "sonner";

import type { BrandBook, BookImage } from "@/features/brands/brand-book";
import { fetchBrandFiles } from "@/lib/brand-kit";
import type { Brand, BrandFile, BrandFont } from "@/lib/brands";
import {
  LOGO_KINDS,
  LOGO_MODES,
  LOGO_NAMES,
  MODE_NAMES,
  bannerFiles,
  brandSlug,
  cssFamily,
  fontWeights,
  formatCmyk,
  formatHsl,
  formatRgb,
  shownFile,
  slotFiles,
} from "@/lib/brands";
import { downloadFile } from "@/lib/csv";
import { playSound } from "@/lib/sounds";
import { errorMessage } from "@/lib/utils";

/** The longest side images are drawn at: sharp in print at the size they're shown. */
const LOGO_SIDE = 1200;
const BANNER_SIDE = 2400;
/** Specimens are drawn at this many pixels per PDF point. */
const SCALE = 3;
const SPECIMEN = { height: 150, width: 420 };
const SVG_TYPE = "image/svg+xml";

/** A length like `120` or `120px` in pixels; 0 when it's none, or in other units. */
function pixels(length: string | null): number {
  return Number((length ?? "").trim().replace(/px$/u, "")) || 0;
}

/** An SVG given a width and height from its viewBox, so it draws at that size. */
function sizedSvg(text: string, side: number): string {
  const document = new DOMParser().parseFromString(text, SVG_TYPE);
  const svg = document.documentElement;
  const box = (svg.getAttribute("viewBox") ?? "")
    .split(/[\s,]+/u)
    .map(Number)
    .filter((value) => Number.isFinite(value));
  const width = box[2] || pixels(svg.getAttribute("width"));
  const height = box[3] || pixels(svg.getAttribute("height"));
  const ratio = width > 0 && height > 0 ? width / height : 1;
  // Without a viewBox, its drawing keeps its own size instead of filling the new one.
  if (box.length < 4 && width > 0 && height > 0) {
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  }
  svg.setAttribute("width", String(ratio >= 1 ? side : side * ratio));
  svg.setAttribute("height", String(ratio >= 1 ? side / ratio : side));
  return new XMLSerializer().serializeToString(svg);
}

/** Draws an image file as PNG, or JPEG for photos, no longer than `side`. */
async function rasterize(
  bytes: Uint8Array<ArrayBuffer>,
  type: string,
  side: number,
  photo = false
): Promise<BookImage | undefined> {
  const blob =
    type === SVG_TYPE
      ? new Blob([sizedSvg(new TextDecoder().decode(bytes), side)], {
          type: SVG_TYPE,
        })
      : new Blob([bytes], { type });
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const natural = {
      height: image.naturalHeight || side,
      width: image.naturalWidth || side,
    };
    const scale = Math.min(1, side / Math.max(natural.width, natural.height));
    const width = Math.max(1, Math.round(natural.width * scale));
    const height = Math.max(1, Math.round(natural.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d")?.drawImage(image, 0, 0, width, height);
    return {
      height,
      src: photo
        ? canvas.toDataURL("image/jpeg", 0.88)
        : canvas.toDataURL("image/png"),
      width,
    };
  } catch {
    return undefined;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** The typeface set in itself: "Aa", its letters and its weights, on a clear canvas. */
async function specimen(
  font: BrandFont,
  files: BrandFile[]
): Promise<BookImage | undefined> {
  const family = cssFamily(font);
  const weights = fontWeights(font, files);
  try {
    await Promise.all(
      [400, ...weights].map((weight) =>
        document.fonts.load(`${weight} 48px ${family}`, "Aa")
      )
    );
  } catch {
    // Drawn in whatever it falls back to.
  }
  const canvas = document.createElement("canvas");
  canvas.width = SPECIMEN.width * SCALE;
  canvas.height = SPECIMEN.height * SCALE;
  const context = canvas.getContext("2d");
  if (!context) {
    return undefined;
  }
  context.scale(SCALE, SCALE);
  context.fillStyle = "#0a0d14";
  context.textBaseline = "alphabetic";
  context.font = `400 76px ${family}`;
  context.fillText("Aa", 0, 70);
  context.fillStyle = "#5b6270";
  context.font = `400 13px ${family}`;
  context.fillText("ABCDEFGHIJKLMNOPQRSTUVWXYZ", 130, 22);
  context.fillText("abcdefghijklmnopqrstuvwxyz", 130, 42);
  context.fillText("0123456789 & @ ! ? € $ %", 130, 62);
  let x = 0;
  for (const weight of weights.slice(0, 9)) {
    context.fillStyle = "#0a0d14";
    context.font = `${weight} 22px ${family}`;
    context.fillText("Ag", x, 125);
    x += context.measureText("Ag").width + 4;
    context.fillStyle = "#9399a5";
    context.font = `500 8px ui-sans-serif, system-ui, sans-serif`;
    context.fillText(String(weight), x, 125);
    x += context.measureText(String(weight)).width + 14;
  }
  return {
    height: SPECIMEN.height,
    src: canvas.toDataURL("image/png"),
    width: SPECIMEN.width,
  };
}

async function gather(brand: Brand, files: BrandFile[]): Promise<BrandBook> {
  const shown = LOGO_KINDS.flatMap((kind) =>
    LOGO_MODES.flatMap((mode) => {
      const file = shownFile(slotFiles(files, kind, mode));
      return file ? [{ file, kind, mode }] : [];
    })
  );
  const banners = bannerFiles(files).filter((file) =>
    file.type.startsWith("image/")
  );
  const fetched = await fetchBrandFiles(brand._id, [
    ...shown.map(({ file }) => file),
    ...banners,
  ]);
  const draw = (file: BrandFile, side: number, photo = false) => {
    const bytes = fetched.get(file._id);
    return bytes ? rasterize(bytes, file.type, side, photo) : undefined;
  };
  const logos = await Promise.all(
    shown.map(async ({ file, kind, mode }) => ({
      image: await draw(file, LOGO_SIDE),
      kind,
      label: `${LOGO_NAMES[kind]} · ${MODE_NAMES[mode]}`,
      mode,
    }))
  );
  const bannerImages = await Promise.all(
    banners.map((file) => draw(file, BANNER_SIDE, true))
  );
  const fonts = await Promise.all(
    brand.fonts.map(async (font) => ({
      family: font.family,
      role: font.role,
      source: font.source === "google" ? "Google Fonts" : "Brand files",
      specimen: await specimen(font, files),
      weights: fontWeights(font, files),
    }))
  );
  const kept = logos.flatMap(({ image, ...logo }) =>
    image ? [{ ...logo, image }] : []
  );
  const mark =
    kept.find((logo) => logo.kind === "symbol" && logo.mode === "light") ??
    kept.find((logo) => logo.kind === "icon") ??
    kept[0];
  return {
    banners: bannerImages.filter((image) => image !== undefined),
    colors: brand.colors.map((color) => ({
      cmyk: formatCmyk(color.hex),
      hex: color.hex,
      hsl: formatHsl(color.hex),
      name: color.name,
      rgb: formatRgb(color.hex),
    })),
    date: new Intl.DateTimeFormat("en", {
      month: "long",
      year: "numeric",
    }).format(new Date()),
    description: brand.description,
    fonts,
    links: [brand.website, ...brand.socials].filter(Boolean),
    logos: kept,
    mark: mark && { image: mark.image, mode: mark.mode },
    title: brand.title,
  };
}

/** Draws the brand's book and saves it as a PDF, telling how it goes in a toast. */
export async function saveBrandBook(
  brand: Brand,
  files: BrandFile[]
): Promise<void> {
  const id = toast.loading("Gathering the brand…");
  try {
    const book = await gather(brand, files);
    toast.loading("Drawing the brand book…", { id });
    const { renderBrandBook } = await import("@/features/brands/brand-book");
    const blob = await renderBrandBook(book);
    const name = `${brandSlug(brand)}-brand-book.pdf`;
    downloadFile(name, blob, "application/pdf");
    playSound("success");
    toast.success(`${name} downloaded`, { id });
  } catch (error) {
    playSound("error");
    toast.error(errorMessage(error), { id });
  }
}
