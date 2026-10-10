import { ConvexError, v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { requireUser } from "./lib/access";
import { isTimeZone } from "./lib/time-zones";
import type { WidgetSettings } from "./lib/validators";
import { vWidgetSettings } from "./lib/validators";
import { rankBetween } from "./shared/model";
import { isRepeatable, MAX_WIDGETS, MY_TASKS_DEFAULTS } from "./shared/widgets";

/** Puts what every new home starts with on a person's, who has none yet. */
export async function addStarterWidgets(
  ctx: MutationCtx,
  userId: Id<"users">
): Promise<void> {
  await ctx.db.insert("widgets", {
    rank: rankBetween(),
    settings: MY_TASKS_DEFAULTS,
    userId,
  });
}

function widgetsOf(
  ctx: QueryCtx,
  userId: Id<"users">
): Promise<Doc<"widgets">[]> {
  return ctx.db
    .query("widgets")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
}

/** One of the person's widgets; someone else's is as good as gone. */
async function ownWidget(
  ctx: QueryCtx,
  user: Doc<"users">,
  widgetId: Id<"widgets">
): Promise<Doc<"widgets">> {
  const widget = await ctx.db.get(widgetId);
  if (widget?.userId !== user._id) {
    throw new ConvexError("This widget doesn’t exist anymore.");
  }
  return widget;
}

/** Settings fit to keep: a clock's time zone has to be one there is. */
function checkSettings(settings: WidgetSettings): void {
  if (
    settings.type === "clock" &&
    settings.timeZone !== undefined &&
    !isTimeZone(settings.timeZone)
  ) {
    throw new ConvexError("That time zone doesn’t exist.");
  }
}

/** The signed-in person's widgets, in the order they arranged them. */
export const list = query({
  args: {},
  handler: async (ctx): Promise<Doc<"widgets">[]> => {
    const user = await requireUser(ctx);
    const widgets = await widgetsOf(ctx, user._id);
    return widgets.toSorted(
      (a, b) => a.rank - b.rank || a._creationTime - b._creationTime
    );
  },
});

/** Puts a widget at the end of the person's home; resolves with its id. */
export const add = mutation({
  args: { settings: vWidgetSettings },
  handler: async (ctx, { settings }) => {
    const user = await requireUser(ctx);
    checkSettings(settings);
    const widgets = await widgetsOf(ctx, user._id);
    if (widgets.length >= MAX_WIDGETS) {
      throw new ConvexError(`Your home holds up to ${MAX_WIDGETS} widgets.`);
    }
    if (
      !isRepeatable(settings.type) &&
      widgets.some((widget) => widget.settings.type === settings.type)
    ) {
      throw new ConvexError("That widget is already on your home.");
    }
    const last =
      widgets.length > 0
        ? Math.max(...widgets.map((widget) => widget.rank))
        : undefined;
    return await ctx.db.insert("widgets", {
      rank: rankBetween(last),
      settings,
      userId: user._id,
    });
  },
});

/** Changes how the widget shows what it shows; it stays the same kind of widget. */
export const update = mutation({
  args: { settings: vWidgetSettings, widgetId: v.id("widgets") },
  handler: async (ctx, { settings, widgetId }) => {
    const user = await requireUser(ctx);
    const widget = await ownWidget(ctx, user, widgetId);
    if (settings.type !== widget.settings.type) {
      throw new ConvexError("A widget can’t turn into another kind.");
    }
    checkSettings(settings);
    await ctx.db.patch(widgetId, { settings });
  },
});

export const remove = mutation({
  args: { widgetId: v.id("widgets") },
  handler: async (ctx, { widgetId }) => {
    const user = await requireUser(ctx);
    await ownWidget(ctx, user, widgetId);
    await ctx.db.delete(widgetId);
  },
});

/** Reorders the person's widgets: usually one moves, sometimes all are spaced out again. */
export const move = mutation({
  args: {
    moves: v.array(v.object({ rank: v.number(), widgetId: v.id("widgets") })),
  },
  handler: async (ctx, { moves }) => {
    const user = await requireUser(ctx);
    for (const { rank, widgetId } of moves) {
      await ownWidget(ctx, user, widgetId);
      if (!Number.isFinite(rank)) {
        throw new ConvexError("That isn’t a place on your home.");
      }
      await ctx.db.patch(widgetId, { rank });
    }
  },
});
