/**
 * Who hears about what. People follow cards and Drive files: a card's maker
 * and assignees, and a file's uploader, follow it unless they unsubscribe,
 * and commenting or being mentioned subscribes anyone. News waits a little
 * before it's pushed, so a change undone at once never goes out.
 */
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { mentionedUsers } from "../shared/mentions";
import { BURST_MS } from "../shared/model";
import { NEWS_CHANGES, PUSH_DELAY_MS } from "../shared/notifications";
import { canSee } from "./access";
import { changesNothing, fold } from "./changes";
import type { CardChange } from "./validators";

/** A card or Drive file, with who follows it unless they say otherwise. */
export type Followable =
  | Pick<Doc<"cards">, "_id" | "assignees" | "createdBy">
  | Pick<Doc<"driveFiles">, "_id" | "uploadedBy">;

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;

/** A notification as it's made: unread, in the inbox, and not pushed yet. */
type NewNotification = DistributiveOmit<
  Doc<"notifications">,
  "_creationTime" | "_id" | "archived" | "pushAt" | "read"
>;

function byDefault(item: Followable): Id<"users">[] {
  return "uploadedBy" in item
    ? [item.uploadedBy]
    : [item.createdBy, ...item.assignees];
}

function subscriptionsOf(
  ctx: QueryCtx,
  item: Followable
): Promise<Doc<"subscriptions">[]> {
  return "uploadedBy" in item
    ? ctx.db
        .query("subscriptions")
        .withIndex("by_file_and_user", (q) => q.eq("fileId", item._id))
        .collect()
    : ctx.db
        .query("subscriptions")
        .withIndex("by_card_and_user", (q) => q.eq("cardId", item._id))
        .collect();
}

function subscriptionOf(
  ctx: QueryCtx,
  item: Followable,
  userId: Id<"users">
): Promise<Doc<"subscriptions"> | null> {
  return "uploadedBy" in item
    ? ctx.db
        .query("subscriptions")
        .withIndex("by_file_and_user", (q) =>
          q.eq("fileId", item._id).eq("userId", userId)
        )
        .unique()
    : ctx.db
        .query("subscriptions")
        .withIndex("by_card_and_user", (q) =>
          q.eq("cardId", item._id).eq("userId", userId)
        )
        .unique();
}

/** Everyone following the card or file, whether or not they can still see it. */
export async function followers(
  ctx: QueryCtx,
  item: Followable
): Promise<Id<"users">[]> {
  const rows = await subscriptionsOf(ctx, item);
  const said = new Map(rows.map((row) => [row.userId, row.subscribed]));
  const people = new Set<Id<"users">>();
  for (const userId of byDefault(item)) {
    if (said.get(userId) !== false) {
      people.add(userId);
    }
  }
  for (const [userId, subscribed] of said) {
    if (subscribed) {
      people.add(userId);
    }
  }
  return [...people];
}

export async function follows(
  ctx: QueryCtx,
  item: Followable,
  userId: Id<"users">
): Promise<boolean> {
  const row = await subscriptionOf(ctx, item, userId);
  return row ? row.subscribed : byDefault(item).includes(userId);
}

/** Subscribes or unsubscribes someone, until they or something they do says otherwise. */
export async function setFollowing(
  ctx: MutationCtx,
  item: Followable,
  userId: Id<"users">,
  subscribed: boolean
): Promise<void> {
  const row = await subscriptionOf(ctx, item, userId);
  if (row) {
    if (row.subscribed !== subscribed) {
      await ctx.db.patch(row._id, { subscribed });
    }
    return;
  }
  await ctx.db.insert(
    "subscriptions",
    "uploadedBy" in item
      ? { fileId: item._id, subscribed, userId }
      : { cardId: item._id, subscribed, userId }
  );
}

/**
 * Keeps someone following as they do now, for when what made them follow
 * goes away: an assignee taken off a card still hears about it.
 */
async function keepFollowing(
  ctx: MutationCtx,
  item: Followable,
  userId: Id<"users">
): Promise<void> {
  if (!(await subscriptionOf(ctx, item, userId))) {
    await setFollowing(ctx, item, userId, byDefault(item).includes(userId));
  }
}

/** Pushes the notification after `delay`, to the devices of anyone who has some. */
async function schedulePush(
  ctx: MutationCtx,
  notificationId: Id<"notifications">,
  userId: Id<"users">,
  delay: number
): Promise<void> {
  const device = await ctx.db
    .query("pushDevices")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();
  if (!device) {
    return;
  }
  const at = Date.now() + delay;
  await ctx.db.patch(notificationId, { pushAt: at });
  await ctx.scheduler.runAfter(delay, internal.delivery.send, {
    at,
    notificationId,
  });
}

/** Puts news in someone's inbox, and pushes it a little later. */
export async function notify(
  ctx: MutationCtx,
  news: NewNotification,
  delay = PUSH_DELAY_MS
): Promise<Id<"notifications">> {
  const notificationId = await ctx.db.insert("notifications", {
    ...news,
    archived: false,
    read: false,
  });
  await schedulePush(ctx, notificationId, news.userId, delay);
  return notificationId;
}

/** The people in the list who can see the project, but not whoever acted. */
async function audience(
  ctx: QueryCtx,
  people: Iterable<Id<"users">>,
  projectId: Id<"projects">,
  actorId: Id<"users">
): Promise<Id<"users">[]> {
  const result: Id<"users">[] = [];
  for (const userId of new Set(people)) {
    if (userId !== actorId && (await canSee(ctx, userId, projectId))) {
      result.push(userId);
    }
  }
  return result;
}

/** Users the text mentions, as ids. */
function mentioned(ctx: QueryCtx, text: string): Id<"users">[] {
  return mentionedUsers(text).flatMap((id) => {
    const userId = ctx.db.normalizeId("users", id);
    return userId ? [userId] : [];
  });
}

/** Later changes folded into earlier ones, dropping any that end where they started. */
function foldChanges(earlier: CardChange[], later: CardChange[]): CardChange[] {
  const result = [...earlier];
  for (const change of later) {
    const at = result.findIndex(({ kind }) => kind === change.kind);
    const before = result[at];
    if (before) {
      result[at] = fold(before, change) ?? change;
    } else {
      result.push(change);
    }
  }
  return result.filter((change) => !changesNothing(change));
}

/**
 * Tells the card's followers what someone changed, and anyone they assigned
 * or took off it. A burst of changes by one person folds into one unread
 * notification, which a change set back takes away.
 */
export async function notifyChanges(
  ctx: MutationCtx,
  actorId: Id<"users">,
  card: Doc<"cards">,
  projectId: Id<"projects">,
  changes: CardChange[]
): Promise<void> {
  const news = changes.filter(({ kind }) => NEWS_CHANGES.includes(kind));
  if (news.length === 0) {
    return;
  }
  const touched: Id<"users">[] = [];
  for (const change of news) {
    if (change.kind !== "assignees") {
      continue;
    }
    for (const userId of change.to.filter((id) => !change.from.includes(id))) {
      await setFollowing(ctx, card, userId, true);
      touched.push(userId);
    }
    for (const userId of change.from.filter((id) => !change.to.includes(id))) {
      await keepFollowing(ctx, card, userId);
      touched.push(userId);
    }
  }
  const people = [...(await followers(ctx, card)), ...touched];
  const now = Date.now();
  for (const userId of await audience(ctx, people, projectId, actorId)) {
    const latest = await ctx.db
      .query("notifications")
      .withIndex("by_card_and_user", (q) =>
        q.eq("cardId", card._id).eq("userId", userId)
      )
      .order("desc")
      .first();
    if (
      latest &&
      "cardId" in latest &&
      latest.reason === "change" &&
      latest.actorId === actorId &&
      !(latest.read || latest.archived) &&
      now - latest._creationTime < BURST_MS
    ) {
      const folded = foldChanges(latest.changes ?? [], news);
      if (folded.length === 0) {
        await ctx.db.delete(latest._id);
      } else {
        await ctx.db.patch(latest._id, { changes: folded });
        await schedulePush(ctx, latest._id, userId, PUSH_DELAY_MS);
      }
      continue;
    }
    await notify(ctx, {
      actorId,
      cardId: card._id,
      changes: news,
      reason: "change",
      userId,
    });
  }
}

/**
 * The comment subscribes its author and whoever it mentions. They're told
 * they were mentioned; the card's other followers, that someone commented.
 */
export async function notifyCardComment(
  ctx: MutationCtx,
  actorId: Id<"users">,
  card: Doc<"cards">,
  projectId: Id<"projects">,
  commentId: Id<"comments">,
  content: string
): Promise<void> {
  await setFollowing(ctx, card, actorId, true);
  const named = await audience(
    ctx,
    mentioned(ctx, content),
    projectId,
    actorId
  );
  for (const userId of named) {
    await setFollowing(ctx, card, userId, true);
    await notify(ctx, {
      actorId,
      cardId: card._id,
      commentId,
      content,
      reason: "mention",
      userId,
    });
  }
  const following = await followers(ctx, card);
  const rest = following.filter((userId) => !named.includes(userId));
  for (const userId of await audience(ctx, rest, projectId, actorId)) {
    await notify(ctx, {
      actorId,
      cardId: card._id,
      commentId,
      content,
      reason: "comment",
      userId,
    });
  }
}

/** As with a card's comments: mentions and followers of a Drive file. */
export async function notifyFileComment(
  ctx: MutationCtx,
  actorId: Id<"users">,
  file: Doc<"driveFiles">,
  driveCommentId: Id<"driveComments">,
  content: string
): Promise<void> {
  await setFollowing(ctx, file, actorId, true);
  const named = await audience(
    ctx,
    mentioned(ctx, content),
    file.projectId,
    actorId
  );
  for (const userId of named) {
    await setFollowing(ctx, file, userId, true);
    await notify(ctx, {
      actorId,
      content,
      driveCommentId,
      fileId: file._id,
      reason: "mention",
      userId,
    });
  }
  const following = await followers(ctx, file);
  const rest = following.filter((userId) => !named.includes(userId));
  for (const userId of await audience(ctx, rest, file.projectId, actorId)) {
    await notify(ctx, {
      actorId,
      content,
      driveCommentId,
      fileId: file._id,
      reason: "comment",
      userId,
    });
  }
}

/** Deletes a card's or file's subscriptions, with it. */
export async function dropSubscriptions(
  ctx: MutationCtx,
  item: Followable
): Promise<void> {
  for (const row of await subscriptionsOf(ctx, item)) {
    await ctx.db.delete(row._id);
  }
}
