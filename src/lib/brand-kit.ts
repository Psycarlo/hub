/**
 * A brand's files, fetched and zipped up in the browser: every logo at once,
 * or the whole kit with banners, typefaces and the palette as code. Progress
 * shows in a toast, so the person can carry on meanwhile.
 */
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { toast } from "sonner";

import { copyText } from "@/components/copy";
import type {
  Brand,
  BrandFile,
  BrandFont,
  LogoKind,
  LogoMode,
} from "@/lib/brands";
import {
  LOGO_KINDS,
  LOGO_MODES,
  MAX_FILE_LINKS,
  bannerFiles,
  brandSlug,
  extensionOf,
  fontFiles,
  formatCmyk,
  formatHsl,
  formatRgb,
  googleFontsPage,
  logoFiles,
  paletteTokens,
  slotFiles,
} from "@/lib/brands";
import { convex } from "@/lib/convex";
import { downloadFile } from "@/lib/csv";
import { slugify } from "@/lib/project";
import { playSound } from "@/lib/sounds";
import { errorMessage, plural } from "@/lib/utils";

/** Files fetched at once; the rest wait their turn. */
const CONCURRENT = 4;
const ZIP_TYPE = "application/zip";

/** Short-lived links to the files, asked for a batch at a time. */
async function linksFor(
  brandId: Id<"brands">,
  files: BrandFile[]
): Promise<Map<string, string>> {
  const links = new Map<string, string>();
  for (let start = 0; start < files.length; start += MAX_FILE_LINKS) {
    // oxlint-disable-next-line no-await-in-loop -- links are asked for a batch at a time
    const batch = await convex.mutation(api.brands.fileLinks, {
      brandId,
      fileIds: files
        .slice(start, start + MAX_FILE_LINKS)
        .map((file) => file._id),
    });
    for (const { fileId, url } of batch) {
      links.set(fileId, url);
    }
  }
  return links;
}

/** The files' bytes by id, a few fetched at once; any that can't be had are left out. */
export async function fetchBrandFiles(
  brandId: Id<"brands">,
  files: BrandFile[],
  onFetched?: (count: number) => void
): Promise<Map<string, Uint8Array<ArrayBuffer>>> {
  const links = await linksFor(brandId, files);
  const fetched = new Map<string, Uint8Array<ArrayBuffer>>();
  const queue = [...files];
  let count = 0;
  const lane = async () => {
    for (let file = queue.shift(); file; file = queue.shift()) {
      const url = links.get(file._id);
      try {
        // oxlint-disable-next-line no-await-in-loop -- each lane takes the next file once it's done with one
        const response = url ? await fetch(url) : undefined;
        if (response?.ok) {
          // oxlint-disable-next-line no-await-in-loop -- read before the lane moves on
          fetched.set(file._id, new Uint8Array(await response.arrayBuffer()));
        }
      } catch {
        // Left out; the zip says how many.
      }
      count += 1;
      onFetched?.(count);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENT, queue.length) }, lane)
  );
  return fetched;
}

/** A name not taken yet in its folder: `logo.svg`, then `logo-2.svg`. */
function freeName(taken: Set<string>, base: string, extension: string): string {
  const dot = extension ? `.${extension}` : "";
  let name = `${base}${dot}`;
  for (let number = 2; taken.has(name); number += 1) {
    name = `${base}-${number}${dot}`;
  }
  taken.add(name);
  return name;
}

/** What a logo is called in downloads: `acme-symbol-on-light.svg`. */
export function logoBase(
  brand: Pick<Brand, "title">,
  kind: LogoKind,
  mode: LogoMode
): string {
  return `${brandSlug(brand)}-${kind}-on-${mode}`;
}

/** Where each logo goes in a zip, by id. */
function logoPaths(
  brand: Brand,
  files: BrandFile[],
  folder: string
): Map<string, string> {
  const taken = new Set<string>();
  const paths = new Map<string, string>();
  for (const kind of LOGO_KINDS) {
    for (const mode of LOGO_MODES) {
      for (const file of slotFiles(files, kind, mode)) {
        const name = freeName(
          taken,
          logoBase(brand, kind, mode),
          extensionOf(file.name)
        );
        paths.set(file._id, `${folder}/${name}`);
      }
    }
  }
  return paths;
}

/** Banners and typeface files, where each goes in the kit. */
function otherPaths(
  brand: Brand,
  files: BrandFile[],
  root: string
): Map<string, string> {
  const paths = new Map<string, string>();
  const banners = new Set<string>();
  for (const file of bannerFiles(files)) {
    const name = freeName(
      banners,
      `${brandSlug(brand)}-banner`,
      extensionOf(file.name)
    );
    paths.set(file._id, `${root}/banners/${name}`);
  }
  for (const font of brand.fonts) {
    const folder = slugify(font.family) || font.id;
    const taken = new Set<string>();
    for (const file of fontFiles(files, font.id)) {
      const dot = file.name.lastIndexOf(".");
      const base = dot > 0 ? file.name.slice(0, dot) : file.name;
      const name = freeName(taken, base, extensionOf(file.name));
      paths.set(file._id, `${root}/fonts/${folder}/${name}`);
    }
  }
  return paths;
}

/** The brand as data, for whoever builds with it. */
function brandJson(brand: Brand): string {
  const data = {
    colors: brand.colors.map((color) => ({
      cmyk: formatCmyk(color.hex),
      hex: color.hex,
      hsl: formatHsl(color.hex),
      name: color.name,
      rgb: formatRgb(color.hex),
    })),
    description: brand.description,
    name: brand.title,
    socials: brand.socials,
    typefaces: brand.fonts.map((font) => ({
      family: font.family,
      role: font.role,
      source: font.source === "google" ? googleFontsPage(font.family) : "files",
      weights: font.weights,
    })),
    website: brand.website,
  };
  return `${JSON.stringify(data, null, 2)}\n`;
}

async function zipUp(entries: Map<string, Uint8Array | string>): Promise<Blob> {
  const { strToU8, zip } = await import("fflate");
  const data: Record<string, [Uint8Array, { level: 0 | 6 }]> = {};
  for (const [path, content] of entries) {
    // Text squeezes down; images and fonts are compressed already.
    data[path] =
      typeof content === "string"
        ? [strToU8(content), { level: 6 }]
        : [content, { level: 0 }];
  }
  // oxlint-disable-next-line promise/avoid-new -- fflate answers through a callback
  return await new Promise<Blob>((resolve, reject) => {
    zip(data, (error, zipped) => {
      if (error) {
        reject(error);
      } else {
        resolve(
          new Blob([zipped as Uint8Array<ArrayBuffer>], { type: ZIP_TYPE })
        );
      }
    });
  });
}

/**
 * Fetches the files to their paths, adds the texts, zips it all and saves it,
 * telling progress in a toast.
 */
async function pack(
  brand: Brand,
  name: string,
  paths: Map<string, string>,
  files: BrandFile[],
  texts = new Map<string, string>()
): Promise<void> {
  const wanted = files.filter((file) => paths.has(file._id));
  const id = toast.loading(`Gathering ${plural(wanted.length, "file")}…`);
  try {
    const fetched = await fetchBrandFiles(brand._id, wanted, (count) =>
      toast.loading(`Fetching ${count} of ${wanted.length}…`, { id })
    );
    toast.loading("Zipping…", { id });
    const entries = new Map<string, Uint8Array | string>(texts);
    for (const file of wanted) {
      const bytes = fetched.get(file._id);
      const path = paths.get(file._id);
      if (bytes && path) {
        entries.set(path, bytes);
      }
    }
    downloadFile(`${name}.zip`, await zipUp(entries), ZIP_TYPE);
    playSound("success");
    const missing = wanted.length - fetched.size;
    toast.success(`${name}.zip downloaded`, {
      description:
        missing > 0
          ? `${plural(missing, "file")} couldn’t be fetched and ${missing === 1 ? "was" : "were"} left out.`
          : undefined,
      id,
    });
  } catch (error) {
    playSound("error");
    toast.error(errorMessage(error), { id });
  }
}

/** Every logo of the brand, in one zip. */
export function downloadLogos(brand: Brand, files: BrandFile[]): Promise<void> {
  const name = `${brandSlug(brand)}-logos`;
  return pack(brand, name, logoPaths(brand, files, name), logoFiles(files));
}

/** Everything: logos, banners, typeface files, the palette as code and the brand as data. */
export function downloadKit(brand: Brand, files: BrandFile[]): Promise<void> {
  const root = `${brandSlug(brand)}-brand-kit`;
  const paths = new Map([
    ...logoPaths(brand, files, `${root}/logos`),
    ...otherPaths(brand, files, root),
  ]);
  const texts = new Map([[`${root}/brand.json`, brandJson(brand)]]);
  if (brand.colors.length > 0) {
    texts.set(`${root}/colors/palette.css`, paletteTokens(brand, "css"));
    texts.set(`${root}/colors/tailwind.css`, paletteTokens(brand, "tailwind"));
    texts.set(`${root}/colors/palette.json`, paletteTokens(brand, "json"));
  }
  return pack(brand, root, paths, files, texts);
}

/** One file, saved under the name the brand gives it. */
export async function downloadBrandFile(
  brand: Brand,
  file: BrandFile,
  name: string = file.name
): Promise<void> {
  try {
    const fetched = await fetchBrandFiles(brand._id, [file]);
    const bytes = fetched.get(file._id);
    if (!bytes) {
      throw new Error("That file couldn’t be fetched. Try again.");
    }
    downloadFile(name, bytes, file.type || "application/octet-stream");
  } catch (error) {
    playSound("error");
    toast.error(errorMessage(error));
  }
}

/** An uploaded typeface's files: the file itself when there's one, else a zip of them. */
export function downloadFont(
  brand: Brand,
  font: BrandFont,
  files: BrandFile[]
): Promise<void> {
  const own = fontFiles(files, font.id);
  const [only] = own;
  if (own.length === 1 && only) {
    return downloadBrandFile(brand, only);
  }
  const name = slugify(font.family) || "typeface";
  const taken = new Set<string>();
  const paths = new Map(
    own.map((file) => {
      const dot = file.name.lastIndexOf(".");
      const base = dot > 0 ? file.name.slice(0, dot) : file.name;
      return [
        file._id,
        `${name}/${freeName(taken, base, extensionOf(file.name))}`,
      ];
    })
  );
  return pack(brand, name, paths, own);
}

/** Copies an SVG logo's code, to paste straight into a design or a page. */
export async function copySvg(brand: Brand, file: BrandFile): Promise<boolean> {
  try {
    const fetched = await fetchBrandFiles(brand._id, [file]);
    const bytes = fetched.get(file._id);
    if (!bytes) {
      throw new Error("That file couldn’t be fetched. Try again.");
    }
    return await copyText(new TextDecoder().decode(bytes));
  } catch (error) {
    playSound("error");
    toast.error(errorMessage(error));
    return false;
  }
}
