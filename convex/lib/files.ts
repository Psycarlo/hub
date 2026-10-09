import { ConvexError } from "convex/values";

import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { r2 } from "../r2";
import type { KeyKind } from "../shared/drive";
import { keyKind } from "../shared/drive";

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
