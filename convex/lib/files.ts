import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ConvexError } from "convex/values";

import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { r2 } from "../r2";
import type { KeyKind } from "../shared/drive";
import { keyKind } from "../shared/drive";

/** Links to download or read a file last long enough to start, not to share. */
const LINK_SECONDS = 10 * 60;
/** RFC 6266 wants these escaped too, though encodeURIComponent leaves them. */
const UNRESERVED = /['()*]/gu;
/** Left out of the plain filename that old browsers read: anything but printable ASCII, quotes and backslashes. */
const NOT_PLAIN = /[^\u0020-\u007E]|["\\]/gu;

/** How much of a file's name its key keeps. */
const MAX_KEY_NAME = 80;
const DIACRITICS = /\p{Diacritic}/gu;

/** The file's name as a key can end in: plain letters, digits, dots and dashes. */
export function keyName(name: string): string {
  const plain = name
    .normalize("NFD")
    .replace(DIACRITICS, "")
    .replaceAll(/[^\w.-]+/gu, "-")
    .replaceAll(/^[.-]+|[.-]+$/gu, "");
  return plain.slice(-MAX_KEY_NAME) || "file";
}

/**
 * An upload the person made themselves, for what it's being used for, so they
 * can't claim someone else's, nor make a Drive file their photo and have it
 * deleted along with the photo.
 */
export async function ownedFile(
  ctx: QueryCtx,
  key: string,
  owner: Id<"users">,
  kind: KeyKind
) {
  const file = await ctx.db
    .query("files")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  if (file?.ownerId !== owner || keyKind(key) !== kind) {
    throw new ConvexError("That upload couldn’t be found.");
  }
  return file;
}

const MAX_NAME = 200;
const MAX_TYPE = 100;

/** What's kept about a file attached to something: its name, size and type, tidied. */
export function attachedFile(upload: {
  name: string;
  size: number;
  type: string;
}): { name: string; size: number; type: string } {
  return {
    name: upload.name.trim().slice(0, MAX_NAME) || "Untitled file",
    size: Number.isFinite(upload.size)
      ? Math.max(0, Math.round(upload.size))
      : 0,
    type: upload.type.slice(0, MAX_TYPE),
  };
}

/** Whether an upload made to attach is attached already: to a card, a comment or an entry. */
export async function isAttached(ctx: QueryCtx, key: string): Promise<boolean> {
  const attachment = await ctx.db
    .query("attachments")
    .withIndex("by_key", (q) => q.eq("key", key))
    .first();
  if (attachment) {
    return true;
  }
  const entryFile = await ctx.db
    .query("financeFiles")
    .withIndex("by_key", (q) => q.eq("key", key))
    .first();
  return entryFile !== null;
}

/** Forgets an upload and deletes it from R2. */
export async function dropFile(ctx: MutationCtx, key: string) {
  const file = await ctx.db
    .query("files")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  if (file) {
    await ctx.db.delete(file._id);
  }
  await r2.deleteObject(ctx, key);
}

/** Tells the browser to show or save the file, under the name it has now. */
function disposition(kind: "inline" | "attachment", name: string): string {
  const encoded = encodeURIComponent(name).replaceAll(
    UNRESERVED,
    (char) => `%${char.codePointAt(0)?.toString(16).toUpperCase()}`
  );
  return `${kind}; filename="${name.replaceAll(NOT_PLAIN, "_")}"; filename*=UTF-8''${encoded}`;
}

/**
 * A short-lived link straight to the file in R2, to download or show in
 * place, under the name it has now. Unlike its /media/ address, the app can
 * fetch it, as R2 answers the app's origin.
 */
export async function signedLink(
  file: { key: string; name: string; type: string },
  download: boolean
): Promise<string> {
  return await getSignedUrl(
    r2.client,
    new GetObjectCommand({
      Bucket: r2.config.bucket,
      Key: file.key,
      ResponseContentDisposition: disposition(
        download ? "attachment" : "inline",
        file.name
      ),
      // Shown in place, it's read as what it is, whatever R2 kept it as.
      ResponseContentType: download ? undefined : file.type || undefined,
    }),
    { expiresIn: LINK_SECONDS }
  );
}
