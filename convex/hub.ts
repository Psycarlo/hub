import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { requireAdmin } from "./lib/access";
import { dropFile, ownedFile } from "./lib/files";
import { mediaUrl } from "./lib/media";

/** The hub's logo, or null for the default mark. Open to everyone: the sign-in page shows it. */
export const branding = query({
  args: {},
  handler: async (ctx) => {
    const settings = await ctx.db.query("hubSettings").first();
    return { logo: settings?.logoKey ? mediaUrl(settings.logoKey) : null };
  },
});

/** Sets the logo to an uploaded image, or back to the default mark. */
export const setLogo = mutation({
  args: { key: v.union(v.string(), v.null()) },
  handler: async (ctx, { key }) => {
    const admin = await requireAdmin(ctx);
    if (key) {
      await ownedFile(ctx, key, admin._id);
    }
    const settings = await ctx.db.query("hubSettings").first();
    const previous = settings?.logoKey;
    if (settings) {
      await ctx.db.patch(settings._id, { logoKey: key ?? undefined });
    } else if (key) {
      await ctx.db.insert("hubSettings", { logoKey: key });
    }
    if (previous && previous !== key) {
      await dropFile(ctx, previous);
    }
  },
});
