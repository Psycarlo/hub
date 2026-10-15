import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { OptimisticLocalStore } from "convex/browser";
import { toast } from "sonner";

import { discardUpload, run } from "@/lib/actions";
import type { Brand, BrandFile, BrandPlace } from "@/lib/brands";
import { placeFit } from "@/lib/brands";
import { convex } from "@/lib/convex";
import { fileKind, typeOf } from "@/lib/drive";
import { playSound } from "@/lib/sounds";
import { uploadable, uploadAttachment } from "@/lib/upload";

export interface BrandDraft {
  title: string;
  description: string;
}

/** What can change on a brand; lists go whole, in their new order. */
export type BrandChanges = Partial<
  Pick<
    Brand,
    "title" | "description" | "website" | "socials" | "colors" | "fonts"
  >
>;

function patchBrands(
  store: OptimisticLocalStore,
  patch: (brands: Brand[]) => Brand[]
): void {
  const brands = store.getQuery(api.brands.list, {});
  if (brands) {
    store.setQuery(api.brands.list, {}, patch(brands));
  }
}

/** Starts a brand in the project; resolves with its id. */
export function createBrand(projectId: Id<"projects">, draft: BrandDraft) {
  playSound("sparkle");
  return run(convex.mutation(api.brands.create, { projectId, ...draft }));
}

export function updateBrand(brand: Brand, changes: BrandChanges) {
  return run(
    convex.mutation(
      api.brands.update,
      { brandId: brand._id, ...changes },
      {
        optimisticUpdate: (store) =>
          patchBrands(store, (brands) =>
            brands.map((item) =>
              item._id === brand._id ? { ...item, ...changes } : item
            )
          ),
      }
    )
  );
}

export function deleteBrand(brand: Brand) {
  playSound("whoosh");
  return run(
    convex.mutation(
      api.brands.remove,
      { brandId: brand._id },
      {
        optimisticUpdate: (store) =>
          patchBrands(store, (brands) =>
            brands.filter((item) => item._id !== brand._id)
          ),
      }
    )
  );
}

/** An image's size in pixels, when the browser can read it. */
async function imageSize(
  file: File
): Promise<{ width?: number; height?: number }> {
  if (!typeOf(file).startsWith("image/")) {
    return {};
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    // SVGs without a width or height report none.
    return image.naturalWidth > 0
      ? { height: image.naturalHeight, width: image.naturalWidth }
      : {};
  } catch {
    return {};
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function uploadToBrand(
  brand: Brand,
  place: BrandPlace,
  files: File[]
): Promise<void> {
  const settled = await Promise.allSettled(
    files.map(async (file) => ({
      ...(await uploadAttachment(file)),
      ...(await imageSize(file)),
    }))
  );
  const uploads = settled.flatMap((result) =>
    result.status === "fulfilled" ? [result.value] : []
  );
  const failed = settled.find((result) => result.status === "rejected");
  try {
    if (failed) {
      throw failed.reason;
    }
    await convex.mutation(api.brands.addFiles, {
      brandId: brand._id,
      files: uploads,
      place,
    });
  } catch (error) {
    // Not kept, so nothing would ever point at the uploads.
    for (const upload of uploads) {
      discardUpload(upload.key);
    }
    throw error;
  }
}

/**
 * The files a place takes, telling the person about any it doesn't, so a
 * ZIP dropped on a logo isn't uploaded only to be turned away.
 */
function placeable(place: BrandPlace, files: File[]): File[] {
  const { fits, misfit } = placeFit(place);
  const fitting = files.filter((file) =>
    fits({ name: file.name, type: typeOf(file) })
  );
  const left = files.find((file) => !fitting.includes(file));
  if (left) {
    toast.error(
      fileKind(left) === "archive"
        ? `${misfit} Unzip ${left.name} first, then add the files inside.`
        : misfit
    );
  }
  return fitting;
}

/** Uploads files to a place in the brand. Resolves once they show there, or failed. */
export async function addBrandFiles(
  brand: Brand,
  place: BrandPlace,
  files: File[]
): Promise<void> {
  const fitting = uploadable(placeable(place, files));
  if (fitting.length === 0) {
    return;
  }
  const done = await run(uploadToBrand(brand, place, fitting).then(() => true));
  if (done) {
    playSound("drop");
  }
}

export function removeBrandFile(brand: Brand, file: BrandFile) {
  const query = { brandId: brand._id };
  return run(
    convex.mutation(
      api.brands.removeFile,
      { fileId: file._id },
      {
        optimisticUpdate: (store) => {
          const files = store.getQuery(api.brands.files, query);
          if (files) {
            store.setQuery(
              api.brands.files,
              query,
              files.filter((item) => item._id !== file._id)
            );
          }
        },
      }
    )
  );
}
