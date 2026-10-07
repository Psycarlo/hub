import { ConvexError } from "convex/values";

import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { r2 } from "../r2";

/** An upload the person made themselves, so they can't claim someone else's. */
export async function ownedFile(
  ctx: QueryCtx,
  key: string,
  owner: Id<"users">
) {
  const file = await ctx.db
    .query("files")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  if (file?.ownerId !== owner) {
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
