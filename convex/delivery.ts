"use node";

/**
 * Pushes news to people's devices with Web Push, signed with the
 * deployment's VAPID keys. Without them nothing is pushed, and the app shows
 * news itself while it's open.
 */
import { v } from "convex/values";
import webpush from "web-push";

import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { env } from "./lib/env";

/** How long a push service keeps trying a device that's offline, in seconds. */
const TTL = 24 * 60 * 60;

/** Push services answer these for a subscription that's gone for good. */
const GONE = new Set([404, 410]);

export const send = internalAction({
  args: { at: v.number(), notificationId: v.id("notifications") },
  handler: async (ctx, { at, notificationId }) => {
    const publicKey = env("VAPID_PUBLIC_KEY");
    const privateKey = env("VAPID_PRIVATE_KEY");
    if (!(publicKey && privateKey)) {
      return;
    }
    const message = await ctx.runQuery(internal.push.message, {
      at,
      notificationId,
    });
    if (!message) {
      return;
    }
    const payload = JSON.stringify(message.payload);
    const gone: string[] = [];
    await Promise.all(
      message.devices.map(async ({ endpoint, keys }) => {
        try {
          await webpush.sendNotification({ endpoint, keys }, payload, {
            TTL,
            vapidDetails: {
              privateKey,
              publicKey,
              subject: env("VAPID_SUBJECT") ?? "mailto:admin@example.com",
            },
          });
        } catch (error) {
          if (
            error instanceof webpush.WebPushError &&
            GONE.has(error.statusCode)
          ) {
            gone.push(endpoint);
          } else {
            console.warn("A push didn’t go out:", error);
          }
        }
      })
    );
    await ctx.runMutation(internal.push.sent, { at, gone, notificationId });
  },
});
