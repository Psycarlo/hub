import { api } from "@convex/_generated/api";
import type { Upload } from "@convex/lib/validators";
import { toast } from "sonner";

import { convex, mediaUrl } from "@/lib/convex";

export type { Upload } from "@convex/lib/validators";

/** Uploads are capped here, since R2 links can't cap the size themselves. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const TOO_BIG = "Files can be up to 10 MB.";

export class UploadError extends Error {
  override name = "UploadError";
}

/** The files small enough to upload, telling the person about any that aren't. */
export function uploadable(files: File[]): File[] {
  const fitting = files.filter((file) => file.size <= MAX_UPLOAD_BYTES);
  if (fitting.length < files.length) {
    toast.error(TOO_BIG);
  }
  return fitting;
}

let sending = 0;

/** Whether a photo, image or attachment is on its way up, so a reload would drop it. */
export function sendingUploads(): boolean {
  return sending > 0;
}

/**
 * Uploads a file to the signed link `target` makes, then records it in
 * Convex. Resolves with the object key.
 */
async function upload(
  file: File,
  target: () => Promise<{ key: string; url: string }>
): Promise<string> {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new UploadError(TOO_BIG);
  }
  sending += 1;
  try {
    const { key, url } = await target();
    const response = await fetch(url, {
      body: file,
      headers: { "Content-Type": file.type || "application/octet-stream" },
      method: "PUT",
    });
    if (!response.ok) {
      throw new UploadError("The upload didn’t go through. Try again.");
    }
    await convex.mutation(api.r2.syncMetadata, { key });
    return key;
  } finally {
    sending -= 1;
  }
}

/**
 * Uploads a file to R2 through a signed link, then records it in Convex.
 * Resolves with the object key and the address it's served from.
 */
export async function uploadFile(
  file: File
): Promise<{ key: string; url: string }> {
  const key = await upload(file, () =>
    convex.mutation(api.r2.generateUploadUrl, {})
  );
  return { key, url: mediaUrl(key) };
}

/** Uploads a file to attach to a card or a comment, keeping its name for downloads. */
export async function uploadAttachment(file: File): Promise<Upload> {
  const key = await upload(file, () =>
    convex.mutation(api.attachments.generateUploadUrl, { name: file.name })
  );
  return { key, name: file.name, size: file.size, type: file.type };
}

export function isImage(file: File): boolean {
  return file.type.startsWith("image/");
}
