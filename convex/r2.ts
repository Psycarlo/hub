import type { R2Callbacks } from "@convex-dev/r2";
import { R2 } from "@convex-dev/r2";

import { components, internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { requireUser } from "./lib/access";
import { keyKind } from "./shared/drive";

/** The bucket, configured through the R2_* environment variables. */
export const r2 = new R2(components.r2);

// Typed apart, since this module's own functions are among them.
const callbacks: R2Callbacks = internal.r2;

// Only uploads are open to the app. Files are served through /media/ (see http.ts).
export const { generateUploadUrl, syncMetadata, onSyncMetadata } =
  r2.clientApi<DataModel>({
    callbacks,
    checkUpload: async (ctx) => {
      await requireUser(ctx);
    },
    // R2 now says how big the file really is, which the browser only claimed.
    onSyncMetadata: async (ctx, { key }) => {
      if (keyKind(key) === "drive") {
        await ctx.scheduler.runAfter(0, internal.drive.checkUpload, { key });
      }
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
