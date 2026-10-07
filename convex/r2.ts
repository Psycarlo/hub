import { R2 } from "@convex-dev/r2";

import { components } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { requireUser } from "./lib/access";

/** The bucket, configured through the R2_* environment variables. */
export const r2 = new R2(components.r2);

// Only uploads are open to the app. Files are served through /media/ (see http.ts).
export const { generateUploadUrl, syncMetadata } = r2.clientApi<DataModel>({
  checkUpload: async (ctx) => {
    await requireUser(ctx);
  },
  onUpload: async (ctx, _bucket, key) => {
    const user = await requireUser(ctx);
    const existing = await ctx.db
      .query("files")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    if (!existing) {
      await ctx.db.insert("files", { key, ownerId: user._id });
    }
  },
});
