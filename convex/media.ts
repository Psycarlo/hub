import { v } from "convex/values";

import { internal } from "./_generated/api";
import { httpAction, internalQuery } from "./_generated/server";
import { r2 } from "./r2";

/** Signed R2 links last a day; browsers keep the redirect a little less. */
const LINK_SECONDS = 60 * 60 * 24;
const CACHE_SECONDS = LINK_SECONDS - 60 * 60;
const PREFIX = "/media/";

export const exists = internalQuery({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    const file = await ctx.db
      .query("files")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    return file !== null;
  },
});

/**
 * Serves an uploaded file by redirecting to a signed R2 link. Keys start with a
 * random UUID, so the address works like a capability: images in docs and
 * avatars load in plain <img> tags, which can't send the session token.
 */
export const serve = httpAction(async (ctx, request) => {
  const { pathname } = new URL(request.url);
  const key = decodeURIComponent(pathname.slice(PREFIX.length));
  if (!(key && (await ctx.runQuery(internal.media.exists, { key })))) {
    return new Response("Not found", { status: 404 });
  }
  const url = await r2.getUrl(key, { expiresIn: LINK_SECONDS });
  return new Response(null, {
    headers: {
      "Cache-Control": `private, max-age=${CACHE_SECONDS}`,
      Location: url,
    },
    status: 302,
  });
});
