import type { Infer } from "convex/values";
import { ConvexError, v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import {
  ifVisible,
  requireBrand,
  requireProject,
  requireUser,
  visibleProjects,
} from "./lib/access";
import {
  attachedFile,
  dropFile,
  isAttached,
  ownedFile,
  signedLink,
} from "./lib/files";
import { mediaUrl } from "./lib/media";
import { vBrandColor, vBrandFont, vBrandPlace } from "./lib/validators";
import type { BrandPlace } from "./shared/brands";
import {
  FONT_WEIGHTS,
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
  MAX_URL,
  pickCover,
  pickMark,
  placeFit,
  samePlace,
} from "./shared/brands";
import { canManageRole } from "./shared/model";
import { isHexColor } from "./shared/palette";

type BrandColor = Infer<typeof vBrandColor>;
type BrandFont = Infer<typeof vBrandFont>;

/** Ids the app makes for colors and typefaces are short; anything longer isn't one. */
const MAX_ID = 40;
const SCHEME = /^[a-z][\d+.a-z-]*:/iu;
const SPACES = /\s+/gu;

/** A file just uploaded for the brand, with its size in pixels when it's an image. */
const vBrandUpload = v.object({
  height: v.optional(v.number()),
  key: v.string(),
  name: v.string(),
  size: v.number(),
  type: v.string(),
  width: v.optional(v.number()),
});

/** Brands in every project the signed-in person can see. */
export const list = query({
  args: {},
  handler: async (ctx): Promise<Doc<"brands">[]> => {
    const user = await requireUser(ctx);
    const projects = await visibleProjects(ctx, user);
    const brands = await Promise.all(
      projects.map(({ project }) =>
        ctx.db
          .query("brands")
          .withIndex("by_project", (q) => q.eq("projectId", project._id))
          .collect()
      )
    );
    return brands
      .flat()
      .toSorted(
        (a, b) => a.title.localeCompare(b.title) || a._id.localeCompare(b._id)
      );
  },
});

/** A brand's file as the app shows it. */
export interface BrandFile {
  _id: Id<"brandFiles">;
  _creationTime: number;
  height?: number;
  name: string;
  place: BrandPlace;
  size: number;
  type: string;
  url: string;
  width?: number;
}

function fileView(file: Doc<"brandFiles">): BrandFile {
  return {
    _creationTime: file._creationTime,
    _id: file._id,
    height: file.height,
    name: file.name,
    place: file.place,
    size: file.size,
    type: file.type,
    url: mediaUrl(file.key),
    width: file.width,
  };
}

function filesOf(ctx: QueryCtx, brandId: Id<"brands">) {
  return ctx.db
    .query("brandFiles")
    .withIndex("by_brand", (q) => q.eq("brandId", brandId));
}

/** The brand's logos, banners and font files, oldest first, or null once it's out of reach. */
export const files = query({
  args: { brandId: v.id("brands") },
  handler: async (ctx, { brandId }): Promise<BrandFile[] | null> => {
    if (!(await ifVisible(requireBrand(ctx, brandId, "view")))) {
      return null;
    }
    const rows = await filesOf(ctx, brandId).collect();
    return rows.map(fileView);
  },
});

function cleanTitle(title: string): string {
  const trimmed = title.trim().slice(0, MAX_BRAND_NAME);
  if (!trimmed) {
    throw new ConvexError("Give the brand a name.");
  }
  return trimmed;
}

function cleanDescription(description: string): string {
  return description.trim().slice(0, MAX_BRAND_DESCRIPTION);
}

/**
 * A web address as typed, made whole: `example.com` reads as
 * `https://example.com`. Empty stays empty.
 */
function cleanUrl(input: string, refusal: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    return "";
  }
  const whole = SCHEME.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(whole);
  } catch {
    throw new ConvexError(refusal);
  }
  const web = url.protocol === "https:" || url.protocol === "http:";
  if (!(web && url.hostname.includes(".")) || whole.length > MAX_URL) {
    throw new ConvexError(refusal);
  }
  return whole;
}

function cleanSocials(socials: string[]): string[] {
  const links = socials
    .map((link) => cleanUrl(link, "One of the social links isn’t a link."))
    .filter(Boolean);
  const unique = [...new Set(links)];
  if (unique.length > MAX_SOCIALS) {
    throw new ConvexError(`A brand keeps up to ${MAX_SOCIALS} social links.`);
  }
  return unique;
}

/** Ids made in the app: present, short, and none twice. */
function checkIds(items: { id: string }[]): void {
  const ids = new Set<string>();
  for (const { id } of items) {
    if (!id || id.length > MAX_ID || ids.has(id)) {
      throw new ConvexError("Something got mixed up. Reload and try again.");
    }
    ids.add(id);
  }
}

function cleanColors(colors: BrandColor[]): BrandColor[] {
  if (colors.length > MAX_COLORS) {
    throw new ConvexError(`A brand keeps up to ${MAX_COLORS} colors.`);
  }
  checkIds(colors);
  return colors.map((color) => {
    if (!isHexColor(color.hex)) {
      throw new ConvexError("Give each color as a hex, like #2563eb.");
    }
    return {
      hex: color.hex,
      id: color.id,
      name: color.name.trim().slice(0, MAX_COLOR_NAME),
    };
  });
}

function cleanFonts(fonts: BrandFont[]): BrandFont[] {
  if (fonts.length > MAX_FONTS) {
    throw new ConvexError(`A brand keeps up to ${MAX_FONTS} typefaces.`);
  }
  checkIds(fonts);
  return fonts.map((font) => {
    const family = font.family
      .replaceAll(SPACES, " ")
      .trim()
      .slice(0, MAX_FONT_FAMILY);
    if (!family) {
      throw new ConvexError("Name each typeface.");
    }
    return {
      family,
      id: font.id,
      role: font.role.trim().slice(0, MAX_FONT_ROLE),
      source: font.source,
      // Files tell their own weights; Google's are the ones picked.
      weights:
        font.source === "google"
          ? FONT_WEIGHTS.filter((weight) => font.weights.includes(weight))
          : [],
    };
  });
}

/** A size in pixels the browser measured, if it's one. */
function pixels(value: number | undefined): number | undefined {
  return value !== undefined && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : undefined;
}

/** Keeps the logo and banner that lead the brand in step with its files. */
async function refreshLook(
  ctx: MutationCtx,
  brandId: Id<"brands">
): Promise<void> {
  const rows = await filesOf(ctx, brandId).collect();
  const mark = pickMark(rows);
  await ctx.db.patch(brandId, {
    coverKey: pickCover(rows)?.key,
    mark: mark ? { key: mark.file.key, mode: mark.mode } : undefined,
  });
}

export const create = mutation({
  args: {
    description: v.string(),
    projectId: v.id("projects"),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    const { user } = await requireProject(ctx, args.projectId, "edit");
    return await ctx.db.insert("brands", {
      colors: [],
      createdBy: user._id,
      description: cleanDescription(args.description),
      fonts: [],
      projectId: args.projectId,
      socials: [],
      title: cleanTitle(args.title),
      website: "",
    });
  },
});

/**
 * Changes what's given. Lists are given whole, in their new order; a typeface
 * taken off, or no longer from files, takes its files with it.
 */
export const update = mutation({
  args: {
    brandId: v.id("brands"),
    colors: v.optional(v.array(vBrandColor)),
    description: v.optional(v.string()),
    fonts: v.optional(v.array(vBrandFont)),
    socials: v.optional(v.array(v.string())),
    title: v.optional(v.string()),
    website: v.optional(v.string()),
  },
  handler: async (ctx, { brandId, ...changes }) => {
    await requireBrand(ctx, brandId, "edit");
    const patch: Partial<Doc<"brands">> = {};
    if (changes.title !== undefined) {
      patch.title = cleanTitle(changes.title);
    }
    if (changes.description !== undefined) {
      patch.description = cleanDescription(changes.description);
    }
    if (changes.website !== undefined) {
      patch.website = cleanUrl(changes.website, "The website isn’t a link.");
    }
    if (changes.socials !== undefined) {
      patch.socials = cleanSocials(changes.socials);
    }
    if (changes.colors !== undefined) {
      patch.colors = cleanColors(changes.colors);
    }
    if (changes.fonts !== undefined) {
      const fonts = cleanFonts(changes.fonts);
      patch.fonts = fonts;
      const fromFiles = new Set(
        fonts.filter((font) => font.source === "file").map((font) => font.id)
      );
      const rows = await filesOf(ctx, brandId).collect();
      for (const file of rows) {
        if (file.place.kind === "font" && !fromFiles.has(file.place.fontId)) {
          await ctx.db.delete(file._id);
          await dropFile(ctx, file.key);
        }
      }
    }
    await ctx.db.patch(brandId, patch);
  },
});

/** Whoever made the brand and the project's owners can delete it. */
export const remove = mutation({
  args: { brandId: v.id("brands") },
  handler: async (ctx, { brandId }) => {
    const { brand, role, user } = await requireBrand(ctx, brandId, "edit");
    if (!(canManageRole(role) || brand.createdBy === user._id)) {
      throw new ConvexError(
        "Only whoever made the brand and the project’s owners can delete it."
      );
    }
    await ctx.db.delete(brandId);
    await ctx.scheduler.runAfter(0, internal.cleanup.brand, { brandId });
  },
});

/** How many files a place keeps, and what's said when it's full. */
function placeLimit(place: BrandPlace): { limit: number; full: string } {
  if (place.kind === "banner") {
    return {
      full: `A brand keeps up to ${MAX_BANNERS} banners.`,
      limit: MAX_BANNERS,
    };
  }
  if (place.kind === "font") {
    return {
      full: `A typeface keeps up to ${MAX_FONT_FILES} files.`,
      limit: MAX_FONT_FILES,
    };
  }
  return {
    full: `Each logo keeps up to ${MAX_SLOT_FILES} formats.`,
    limit: MAX_SLOT_FILES,
  };
}

/** Keeps someone's uploads with the brand: in a logo slot, as banners, or with a typeface. */
export const addFiles = mutation({
  args: {
    brandId: v.id("brands"),
    files: v.array(vBrandUpload),
    place: vBrandPlace,
  },
  handler: async (ctx, { brandId, files: uploads, place }) => {
    const { brand, user } = await requireBrand(ctx, brandId, "edit");
    if (place.kind === "font") {
      const font = brand.fonts.find((item) => item.id === place.fontId);
      if (font?.source !== "file") {
        throw new ConvexError("That typeface doesn’t take files.");
      }
    }
    const { limit, full } = placeLimit(place);
    const { fits, misfit } = placeFit(place);
    const rows = await filesOf(ctx, brandId).collect();
    const kept = rows.filter((file) => samePlace(file.place, place));
    if (kept.length + uploads.length > limit) {
      throw new ConvexError(full);
    }
    for (const upload of uploads) {
      if (!fits(upload)) {
        throw new ConvexError(misfit);
      }
      await ownedFile(ctx, upload.key, user._id, "attachment");
      if (await isAttached(ctx, upload.key)) {
        throw new ConvexError("That file is attached already.");
      }
      await ctx.db.insert("brandFiles", {
        brandId,
        height: pixels(upload.height),
        key: upload.key,
        place,
        projectId: brand.projectId,
        uploadedBy: user._id,
        width: pixels(upload.width),
        ...attachedFile(upload),
      });
    }
    await refreshLook(ctx, brandId);
  },
});

export const removeFile = mutation({
  args: { fileId: v.id("brandFiles") },
  handler: async (ctx, { fileId }) => {
    const file = await ctx.db.get(fileId);
    if (!file) {
      return;
    }
    await requireBrand(ctx, file.brandId, "edit");
    await ctx.db.delete(fileId);
    await dropFile(ctx, file.key);
    await refreshLook(ctx, file.brandId);
  },
});

/**
 * Short-lived links the app can fetch the brand's files from, a few at a
 * time: to zip them up, or to load its typefaces.
 */
export const fileLinks = mutation({
  args: { brandId: v.id("brands"), fileIds: v.array(v.id("brandFiles")) },
  handler: async (
    ctx,
    { brandId, fileIds }
  ): Promise<{ fileId: Id<"brandFiles">; url: string }[]> => {
    await requireBrand(ctx, brandId, "view");
    if (fileIds.length > MAX_FILE_LINKS) {
      throw new ConvexError(`Ask for up to ${MAX_FILE_LINKS} files at a time.`);
    }
    const links: { fileId: Id<"brandFiles">; url: string }[] = [];
    for (const fileId of fileIds) {
      const file = await ctx.db.get(fileId);
      // One deleted since, or another brand's, is left out.
      if (file?.brandId === brandId) {
        links.push({ fileId, url: await signedLink(file, true) });
      }
    }
    return links;
  },
});
