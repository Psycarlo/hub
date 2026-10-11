/**
 * A brand's typefaces, drawn on the page: Google's through their stylesheet,
 * uploaded ones fetched and added as font faces. Each loads once a visit;
 * text set in them redraws on its own once they arrive.
 */
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useEffect } from "react";

import type { Brand, BrandFile, BrandFont } from "@/lib/brands";
import {
  FONT_WEIGHTS,
  MAX_FILE_LINKS,
  faceOfFile,
  fontFiles,
  googleFontsUrl,
} from "@/lib/brands";
import { convex } from "@/lib/convex";

/** Google stylesheets on the page, by address, and whether Google had them. */
const sheets = new Map<string, Promise<boolean>>();
/** Uploaded font files added as faces, or on their way. */
const faces = new Set<string>();

/** Adds a Google Fonts stylesheet to the page; resolves with whether Google has it. */
function addSheet(url: string): Promise<boolean> {
  let loading = sheets.get(url);
  if (!loading) {
    // oxlint-disable-next-line promise/avoid-new -- a link only answers through events
    loading = new Promise<boolean>((resolve) => {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = url;
      link.addEventListener("load", () => resolve(true), { once: true });
      link.addEventListener(
        "error",
        () => {
          link.remove();
          resolve(false);
        },
        { once: true }
      );
      document.head.append(link);
    });
    sheets.set(url, loading);
  }
  return loading;
}

/**
 * Loads a Google family in the weights; should Google lack one of them, in
 * whatever it has by default. Resolves with whether it has the family at all.
 */
export async function loadGoogleFont(
  family: string,
  weights: number[]
): Promise<boolean> {
  if (weights.length > 0 && (await addSheet(googleFontsUrl(family, weights)))) {
    return true;
  }
  return await addSheet(googleFontsUrl(family));
}

async function hasStyles(url: string, signal?: AbortSignal): Promise<boolean> {
  try {
    const response = await fetch(url, { signal });
    return response.ok;
  } catch {
    return false;
  }
}

/** "open sans" as Google writes it: "Open Sans". */
function titleCase(family: string): string {
  return family.replaceAll(/\b\p{L}/gu, (letter) => letter.toLocaleUpperCase());
}

/**
 * Whether Google Fonts has the family, as it names it, and the weights it
 * comes in; null when it doesn't. Names are matched as typed, then with
 * capitals, since Google's are case-sensitive.
 */
export async function findGoogleFamily(
  typed: string,
  signal?: AbortSignal
): Promise<{ family: string; weights: number[] } | null> {
  const trimmed = typed.trim().replaceAll(/\s+/gu, " ");
  if (!trimmed) {
    return null;
  }
  let family: string | undefined;
  for (const candidate of new Set([trimmed, titleCase(trimmed)])) {
    // oxlint-disable-next-line no-await-in-loop -- the next spelling is only tried if this one isn't Google's
    if (await hasStyles(googleFontsUrl(candidate), signal)) {
      family = candidate;
      break;
    }
  }
  if (!family) {
    return null;
  }
  const name = family;
  const found = await Promise.all(
    FONT_WEIGHTS.map((weight) =>
      hasStyles(googleFontsUrl(name, [weight]), signal)
    )
  );
  const weights = FONT_WEIGHTS.filter((_, index) => found[index]);
  return { family: name, weights: weights.length > 0 ? weights : [400] };
}

/** Fetches the uploaded files and adds each as a face of the typeface's own family. */
async function addFaces(
  brandId: Id<"brands">,
  font: BrandFont,
  files: BrandFile[]
): Promise<void> {
  const family = `${font.family} ${font.id}`;
  for (let start = 0; start < files.length; start += MAX_FILE_LINKS) {
    const batch = files.slice(start, start + MAX_FILE_LINKS);
    // oxlint-disable-next-line no-await-in-loop -- links are asked for a batch at a time
    const links = await convex.mutation(api.brands.fileLinks, {
      brandId,
      fileIds: batch.map((file) => file._id),
    });
    // oxlint-disable-next-line no-await-in-loop -- each batch's faces load together
    await Promise.all(
      links.map(async ({ fileId, url }) => {
        const file = batch.find((item) => item._id === fileId);
        if (!file) {
          return;
        }
        try {
          const response = await fetch(url);
          const { style, weight } = faceOfFile(file.name);
          const face = new FontFace(family, await response.arrayBuffer(), {
            display: "swap",
            style,
            weight: String(weight),
          });
          document.fonts.add(await face.load());
        } catch {
          // A file the browser can't read stays out; the others still show.
          faces.delete(file._id);
        }
      })
    );
  }
}

/** Adds the files as faces; should that fail, they're tried again on the next visit to the page. */
async function addFacesOnce(
  brandId: Id<"brands">,
  font: BrandFont,
  files: BrandFile[]
): Promise<void> {
  for (const file of files) {
    faces.add(file._id);
  }
  try {
    await addFaces(brandId, font, files);
  } catch {
    for (const file of files) {
      faces.delete(file._id);
    }
  }
}

/** Loads the brand's typefaces while its page is open, each once a visit. */
export function useBrandFonts(
  brand: Pick<Brand, "_id" | "fonts">,
  files: BrandFile[] | undefined
): void {
  const google = brand.fonts
    .filter((font) => font.source === "google")
    .map((font) => `${font.family}:${font.weights.join(";")}`)
    .join("|");

  useEffect(() => {
    for (const entry of google.split("|").filter(Boolean)) {
      const [family = "", weights = ""] = entry.split(":");
      loadGoogleFont(family, weights.split(";").filter(Boolean).map(Number));
    }
  }, [google]);

  // Runs on every update of the brand or its files, but only files not yet added load.
  useEffect(() => {
    if (!files) {
      return;
    }
    for (const font of brand.fonts) {
      const fresh = fontFiles(files, font.id).filter(
        (file) => !faces.has(file._id)
      );
      if (font.source === "file" && fresh.length > 0) {
        addFacesOnce(brand._id, font, fresh);
      }
    }
  }, [brand._id, brand.fonts, files]);
}
