/**
 * Reminders about cards coming due, sent at 9 in the morning where each
 * assignee is: the day before a card is due, and the day after it was.
 */
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { internalMutation } from "./_generated/server";
import { canSee } from "./lib/access";
import { notify } from "./lib/notify";
import { localTime } from "./lib/timezones";
import { isClosed } from "./shared/model";
import type { CardNews } from "./shared/notifications";

/** The local hour reminders go out at. */
const HOUR = 9;

const DAY_MS = 86_400_000;

/** The `YYYY-MM-DD` date `days` after the given one. */
function addDays(date: string, days: number): string {
  const [year = 1970, month = 1, day = 1] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

async function timeZoneOf(
  ctx: MutationCtx,
  userId: Id<"users">
): Promise<string> {
  const avatar = await ctx.db
    .query("officeAvatars")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();
  return avatar?.timeZone ?? "UTC";
}

/** Whether they were already reminded of the card for that day. */
async function reminded(
  ctx: MutationCtx,
  cardId: Id<"cards">,
  userId: Id<"users">,
  reason: CardNews,
  due: string
): Promise<boolean> {
  const sent = ctx.db
    .query("notifications")
    .withIndex("by_card_and_user", (q) =>
      q.eq("cardId", cardId).eq("userId", userId)
    );
  for await (const notification of sent) {
    if (
      "cardId" in notification &&
      notification.reason === reason &&
      notification.due === due
    ) {
      return true;
    }
  }
  return false;
}

/** Runs every hour, reminding whoever it's 9 for of their open cards due tomorrow or yesterday. */
export const due = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const today = new Date(now).toISOString().slice(0, 10);
    // Somewhere it's already tomorrow, and somewhere still yesterday.
    const cards = ctx.db
      .query("cards")
      .withIndex("by_due", (q) =>
        q.gte("due", addDays(today, -2)).lte("due", addDays(today, 2))
      );
    const zones = new Map<Id<"users">, string>();
    for await (const card of cards) {
      if (!card.due || isClosed(card.status) || card.assignees.length === 0) {
        continue;
      }
      const board = await ctx.db.get(card.boardId);
      if (!board) {
        continue;
      }
      for (const userId of card.assignees) {
        const timeZone = zones.get(userId) ?? (await timeZoneOf(ctx, userId));
        zones.set(userId, timeZone);
        const local = localTime(timeZone, now);
        if (local.hour !== HOUR) {
          continue;
        }
        let reason: CardNews | undefined;
        if (card.due === addDays(local.date, 1)) {
          reason = "due";
        } else if (card.due === addDays(local.date, -1)) {
          reason = "overdue";
        }
        if (
          reason &&
          !(await reminded(ctx, card._id, userId, reason, card.due)) &&
          (await canSee(ctx, userId, board.projectId))
        ) {
          await notify(
            ctx,
            { cardId: card._id, due: card.due, reason, userId },
            0
          );
        }
      }
    }
  },
});
