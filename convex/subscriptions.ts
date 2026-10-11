/**
 * Following cards and Drive files, as their activity shows it: whether you
 * do, who else does, and a button to change your mind.
 */
import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { canSee, ifVisible, requireCard, requireDriveFile } from "./lib/access";
import type { Followable } from "./lib/notify";
import { followers, follows, setFollowing } from "./lib/notify";

interface Following {
  subscribed: boolean;
  /** Everyone following who can still see it, in the order they started. */
  people: Id<"users">[];
}

async function followingOf(
  ctx: QueryCtx,
  item: Followable,
  projectId: Id<"projects">,
  userId: Id<"users">
): Promise<Following> {
  const people: Id<"users">[] = [];
  for (const person of await followers(ctx, item)) {
    if (await canSee(ctx, person, projectId)) {
      people.push(person);
    }
  }
  return { people, subscribed: await follows(ctx, item, userId) };
}

export const card = query({
  args: { cardId: v.id("cards") },
  handler: async (ctx, { cardId }): Promise<Following | null> => {
    const access = await ifVisible(requireCard(ctx, cardId, "view"));
    return access
      ? followingOf(ctx, access.card, access.project._id, access.user._id)
      : null;
  },
});

export const setCard = mutation({
  args: { cardId: v.id("cards"), subscribed: v.boolean() },
  handler: async (ctx, { cardId, subscribed }) => {
    const access = await requireCard(ctx, cardId, "view");
    await setFollowing(ctx, access.card, access.user._id, subscribed);
  },
});

export const file = query({
  args: { fileId: v.id("driveFiles") },
  handler: async (ctx, { fileId }): Promise<Following | null> => {
    const access = await ifVisible(requireDriveFile(ctx, fileId, "view"));
    return access
      ? followingOf(ctx, access.file, access.project._id, access.user._id)
      : null;
  },
});

export const setFile = mutation({
  args: { fileId: v.id("driveFiles"), subscribed: v.boolean() },
  handler: async (ctx, { fileId, subscribed }) => {
    const access = await requireDriveFile(ctx, fileId, "view");
    await setFollowing(ctx, access.file, access.user._id, subscribed);
  },
});
