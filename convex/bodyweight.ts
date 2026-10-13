import { ConvexError, v } from "convex/values";

import type { Doc } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { ifVisible, requireBodyWeight, requireProject } from "./lib/access";
import { cleanDate, requireGymOf } from "./lib/gym";
import { MAX_BODY_WEIGHT, MIN_BODY_WEIGHT } from "./shared/gym";
import { isDay } from "./shared/habits";

/** What the project weighed from `from` on, oldest first; null once out of reach. */
export const list = query({
  args: { from: v.string(), projectId: v.id("projects") },
  handler: async (
    ctx,
    { from, projectId }
  ): Promise<Doc<"bodyWeights">[] | null> => {
    const access = await ifVisible(requireProject(ctx, projectId, "view"));
    if (!(access && isDay(from))) {
      return null;
    }
    return await ctx.db
      .query("bodyWeights")
      .withIndex("by_project_and_date", (q) =>
        q.eq("projectId", projectId).gte("date", from)
      )
      .collect();
  },
});

/** Keeps what someone weighed on a day, in kilograms, in place of any weighing that day. */
export const log = mutation({
  args: { date: v.string(), projectId: v.id("projects"), weight: v.number() },
  handler: async (ctx, { date, projectId, weight }) => {
    await requireGymOf(ctx, projectId, "edit");
    cleanDate(date);
    if (!(weight >= MIN_BODY_WEIGHT && weight <= MAX_BODY_WEIGHT)) {
      throw new ConvexError("That’s off the scale.");
    }
    const kept = Math.round(weight * 10_000) / 10_000;
    const existing = await ctx.db
      .query("bodyWeights")
      .withIndex("by_project_and_date", (q) =>
        q.eq("projectId", projectId).eq("date", date)
      )
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { weight: kept });
      return existing._id;
    }
    return await ctx.db.insert("bodyWeights", {
      date,
      projectId,
      weight: kept,
    });
  },
});

export const remove = mutation({
  args: { weightId: v.id("bodyWeights") },
  handler: async (ctx, { weightId }) => {
    await requireBodyWeight(ctx, weightId, "edit");
    await ctx.db.delete(weightId);
  },
});
