import { api } from "@convex/_generated/api";

import { convex, mediaUrl } from "@/lib/convex";

/** Uploads are capped here, since R2 links can't cap the size themselves. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export class UploadError extends Error {
  override name = "UploadError";
}

/**
 * Uploads a file to R2 through a signed link, then records it in Convex.
 * Resolves with the object key and the address it's served from.
 */
export async function uploadFile(
  file: File
): Promise<{ key: string; url: string }> {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new UploadError("Files can be up to 10 MB.");
  }
  const { key, url } = await convex.mutation(api.r2.generateUploadUrl, {});
  const response = await fetch(url, {
    body: file,
    headers: { "Content-Type": file.type || "application/octet-stream" },
    method: "PUT",
  });
  if (!response.ok) {
    throw new UploadError("The upload didn’t go through. Try again.");
  }
  await convex.mutation(api.r2.syncMetadata, { key });
  return { key, url: mediaUrl(key) };
}

export function isImage(file: File): boolean {
  return file.type.startsWith("image/");
}
