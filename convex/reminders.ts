/**
 * Reminders, sent at 9 in the morning where each person is. A card's
 * assignees hear the day before it's due and the day after it was. Everyone
 * who can change a project hears of its bills still to pay or receive three
 * days before they're due, the day before, and on the day, unless they
 * turned that off for the account.
 */
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { internalMutation } from "./_generated/server";
import { canChange, canSee } from "./lib/access";
import { mutedOn } from "./lib/finance";
import { notify } from "./lib/notify";
import { localTime } from "./lib/timezones";
import { isClosed } from "./shared/model";
import type { CardNews, EntryNews } from "./shared/notifications";
import { ENTRY_NEWS, ENTRY_REMINDER_DAYS } from "./shared/notifications";

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

/**
 * Everyone on the project who can still change it, so can settle what's
 * due: its owner too, for a personal one.
 */
async function editorsOf(
  ctx: MutationCtx,
  project: Doc<"projects">
): Promise<Id<"users">[]> {
  const members = await ctx.db
    .query("projectMembers")
    .withIndex("by_project_and_user", (q) => q.eq("projectId", project._id))
    .collect();
  const people = new Set(members.map((member) => member.userId));
  if (project.personalFor) {
    people.add(project.personalFor);
  }
  const result: Id<"users">[] = [];
  for (const userId of people) {
    if (await canChange(ctx, userId, project._id)) {
      result.push(userId);
    }
  }
  return result;
}

/** Which reminder of an entry due on `dueDay` goes out on `local`, if any does. */
function entryNewsOn(dueDay: string, local: string): EntryNews | undefined {
  return ENTRY_NEWS.find(
    (reason) => addDays(local, ENTRY_REMINDER_DAYS[reason]) === dueDay
  );
}

/** Whether they were already reminded of the entry so, for that due day. */
async function remindedOfEntry(
  ctx: MutationCtx,
  entryId: Id<"financeEntries">,
  userId: Id<"users">,
  reason: EntryNews,
  dueDay: string
): Promise<boolean> {
  const sent = ctx.db
    .query("notifications")
    .withIndex("by_entry_and_user", (q) =>
      q.eq("entryId", entryId).eq("userId", userId)
    );
  for await (const notification of sent) {
    if (
      "entryId" in notification &&
      notification.reason === reason &&
      notification.due === dueDay
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Runs every hour, reminding whoever it's 9 for of their projects' entries
 * still to pay or receive that come due in three days, tomorrow or today.
 */
export const bills = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const today = new Date(now).toISOString().slice(0, 10);
    // Somewhere it's already tomorrow, and somewhere still yesterday.
    const entries = ctx.db
      .query("financeEntries")
      .withIndex("by_paid_and_due", (q) =>
        q
          .eq("paid", false)
          .gte("due", addDays(today, -1))
          .lte("due", addDays(today, 1 + ENTRY_REMINDER_DAYS.soon))
      );
    const zones = new Map<Id<"users">, string>();
    const editors = new Map<Id<"projects">, Id<"users">[]>();
    const muted = new Map<Id<"financeAccounts">, Set<Id<"users">>>();
    for await (const entry of entries) {
      // A transfer's credit only repeats its debit, which reminds instead.
      if (!entry.due || (entry.kind === "credit" && entry.transfer)) {
        continue;
      }
      let people = editors.get(entry.projectId);
      if (!people) {
        const project = await ctx.db.get(entry.projectId);
        people = project ? await editorsOf(ctx, project) : [];
        editors.set(entry.projectId, people);
      }
      let quiet = muted.get(entry.accountId);
      if (!quiet) {
        quiet = await mutedOn(ctx, entry.accountId);
        muted.set(entry.accountId, quiet);
      }
      for (const userId of people) {
        if (quiet.has(userId)) {
          continue;
        }
        const timeZone = zones.get(userId) ?? (await timeZoneOf(ctx, userId));
        zones.set(userId, timeZone);
        const local = localTime(timeZone, now);
        if (local.hour !== HOUR) {
          continue;
        }
        const reason = entryNewsOn(entry.due, local.date);
        if (
          reason &&
          !(await remindedOfEntry(ctx, entry._id, userId, reason, entry.due))
        ) {
          await notify(
            ctx,
            { due: entry.due, entryId: entry._id, reason, userId },
            0
          );
        }
      }
    }
  },
});
