import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { OptimisticLocalStore } from "convex/browser";

import { run } from "@/lib/actions";
import type { LabelChanges } from "@/lib/actions";
import { convex } from "@/lib/convex";
import type {
  Account,
  AccountLook,
  Category,
  Entry,
  EntryKind,
  Recurring,
} from "@/lib/finance";
import { monthOf } from "@/lib/finance";
import { sortLabels } from "@/lib/model";
import type { Fiat } from "@/lib/portfolio";
import { playSound } from "@/lib/sounds";

export interface AccountDraft {
  title: string;
  description: string;
  currency: Fiat;
  excludedFromTotal: boolean;
  /** Null draws it as the plain tile. */
  look: AccountLook | null;
}

/** The bitcoin a debit bought, recorded in a portfolio with it. */
export interface NewBuy {
  portfolioId: Id<"portfolios">;
  sats: number;
  /** When, in ms: the entry's day at a time of the person's. */
  at: number;
}

export interface EntryDraft {
  kind: EntryKind;
  name: string;
  cents: number;
  date: string;
  category?: string;
  note: string;
  paid: boolean;
}

/** How an entry's bitcoin changes: linked to a buy, a new buy, or let go. */
export type BuyChange =
  | { buyId: Id<"portfolioTransactions"> }
  | { buy: NewBuy }
  | { buyId: null };

/** Where a debit transfers to, and what arrives there in another currency. */
export interface TransferDraft {
  /** Another account, or null for none. */
  toAccountId: Id<"financeAccounts"> | null;
  /** In the destination's cents, when its currency differs. */
  receivedCents?: number;
}

export interface RecurringDraft {
  kind: EntryKind;
  name: string;
  cents: number;
  day: number;
  category?: string;
  note: string;
  /** On a debit, the account it moves to every month. */
  transfer?: Recurring["transfer"];
}

function byDate(a: Entry, b: Entry): number {
  return a.date.localeCompare(b.date) || a._creationTime - b._creationTime;
}

/** Changes one month's entries where they're loaded. */
function patchMonth(
  store: OptimisticLocalStore,
  projectId: Id<"projects">,
  month: string,
  patch: (entries: Entry[]) => Entry[]
): void {
  const args = { month, projectId };
  const current = store.getQuery(api.finance.inMonth, args);
  if (current) {
    store.setQuery(api.finance.inMonth, args, {
      ...current,
      entries: patch(current.entries).toSorted(byDate),
    });
  }
}

function patchAccounts(
  store: OptimisticLocalStore,
  patch: (accounts: Account[]) => Account[]
): void {
  const accounts = store.getQuery(api.finance.accounts, {});
  if (accounts) {
    store.setQuery(api.finance.accounts, {}, patch(accounts));
  }
}

function patchRecurring(
  store: OptimisticLocalStore,
  projectId: Id<"projects">,
  patch: (items: Recurring[]) => Recurring[]
): void {
  const items = store.getQuery(api.finance.recurring, { projectId });
  if (items) {
    store.setQuery(api.finance.recurring, { projectId }, patch(items));
  }
}

/** Starts an account in the project; resolves with its id. */
export function createAccount(projectId: Id<"projects">, draft: AccountDraft) {
  return run(
    convex.mutation(api.finance.createAccount, { projectId, ...draft })
  );
}

export function updateAccount(
  account: Account,
  changes: Partial<AccountDraft>
) {
  return run(
    convex.mutation(
      api.finance.updateAccount,
      { accountId: account._id, ...changes },
      {
        optimisticUpdate: (store) => {
          const { look, ...rest } = changes;
          patchAccounts(store, (accounts) =>
            accounts.map((item) =>
              item._id === account._id
                ? {
                    ...item,
                    ...rest,
                    ...(look === undefined ? {} : { look: look ?? undefined }),
                  }
                : item
            )
          );
        },
      }
    )
  );
}

export function deleteAccount(account: Account) {
  return run(
    convex.mutation(
      api.finance.removeAccount,
      { accountId: account._id },
      {
        optimisticUpdate: (store) =>
          patchAccounts(store, (accounts) =>
            accounts.filter((item) => item._id !== account._id)
          ),
      }
    )
  );
}

/** Adds a category, shown at once so the entry can take it right away. */
export function addCategory(projectId: Id<"projects">, category: Category) {
  return run(
    convex.mutation(
      api.finance.addCategory,
      { category, projectId },
      {
        optimisticUpdate: (store) => {
          const categories = store.getQuery(api.finance.categories, {
            projectId,
          });
          if (categories && !categories.some(({ id }) => id === category.id)) {
            store.setQuery(
              api.finance.categories,
              { projectId },
              sortLabels([...categories, category])
            );
          }
        },
      }
    )
  );
}

export function updateCategories(
  projectId: Id<"projects">,
  changes: LabelChanges
) {
  return run(
    convex.mutation(api.finance.updateCategories, { projectId, ...changes })
  );
}

export function startMonth(account: Account, month: string) {
  return run(
    convex.mutation(api.finance.startMonth, { accountId: account._id, month })
  );
}

export function addToMonth(
  account: Account,
  month: string,
  recurringIds: Id<"financeRecurring">[]
) {
  return run(
    convex.mutation(api.finance.addToMonth, {
      accountId: account._id,
      month,
      recurringIds,
    })
  );
}

export function addEntry(
  account: Account,
  draft: EntryDraft,
  buy?: BuyChange,
  transfer?: TransferDraft
) {
  playSound("success");
  return run(
    convex.mutation(api.finance.addEntry, {
      accountId: account._id,
      ...draft,
      ...(buy && "buy" in buy ? { buy: buy.buy } : {}),
      ...(buy && "buyId" in buy && buy.buyId ? { buyId: buy.buyId } : {}),
      ...(transfer?.toAccountId
        ? {
            receivedCents: transfer.receivedCents,
            toAccountId: transfer.toAccountId,
          }
        : {}),
    })
  );
}

/**
 * Changes an entry, shown at once: ticking it paid shouldn't wait on the
 * server. A transfer's other side follows where it's loaded alongside.
 */
export function updateEntry(
  entry: Entry,
  changes: Partial<EntryDraft>,
  buy?: BuyChange,
  transfer?: TransferDraft
) {
  const { category, ...rest } = changes;
  const other = entry.transfer?.entryId;
  return run(
    convex.mutation(
      api.finance.updateEntry,
      {
        entryId: entry._id,
        ...rest,
        ...("category" in changes ? { category: category ?? null } : {}),
        ...buy,
        ...transfer,
      },
      {
        optimisticUpdate: (store) => {
          const next: Entry = { ...entry, ...changes, updatedAt: Date.now() };
          if (buy && "buyId" in buy) {
            next.buyId = buy.buyId ?? undefined;
          }
          const from = monthOf(entry.date);
          const to = monthOf(next.date);
          patchMonth(store, entry.projectId, from, (entries) =>
            from === to
              ? entries.map((item) => (item._id === entry._id ? next : item))
              : entries.filter((item) => item._id !== entry._id)
          );
          if (from !== to) {
            patchMonth(store, entry.projectId, to, (entries) => [
              ...entries,
              next,
            ]);
          }
          if (other && changes.paid !== undefined) {
            patchMonth(store, entry.projectId, from, (entries) =>
              entries.map((item) =>
                item._id === other ? { ...item, paid: next.paid } : item
              )
            );
          }
        },
      }
    )
  );
}

/** Deletes an entry, and a transfer's other side with it. */
export function deleteEntry(entry: Entry) {
  playSound("whoosh");
  const other = entry.transfer?.entryId;
  return run(
    convex.mutation(
      api.finance.removeEntry,
      { entryId: entry._id },
      {
        optimisticUpdate: (store) =>
          patchMonth(store, entry.projectId, monthOf(entry.date), (entries) =>
            entries.filter(
              (item) => item._id !== entry._id && item._id !== other
            )
          ),
      }
    )
  );
}

export function createRecurring(account: Account, draft: RecurringDraft) {
  return run(
    convex.mutation(api.finance.createRecurring, {
      accountId: account._id,
      ...draft,
    })
  );
}

export function updateRecurring(
  item: Recurring,
  changes: Partial<RecurringDraft>
) {
  const { category, transfer, ...rest } = changes;
  return run(
    convex.mutation(
      api.finance.updateRecurring,
      {
        recurringId: item._id,
        ...rest,
        ...("category" in changes ? { category: category ?? null } : {}),
        ...("transfer" in changes ? { transfer: transfer ?? null } : {}),
      },
      {
        optimisticUpdate: (store) =>
          patchRecurring(store, item.projectId, (items) =>
            items.map((other) =>
              other._id === item._id ? { ...other, ...changes } : other
            )
          ),
      }
    )
  );
}

export function deleteRecurring(item: Recurring) {
  return run(
    convex.mutation(
      api.finance.removeRecurring,
      { recurringId: item._id },
      {
        optimisticUpdate: (store) =>
          patchRecurring(store, item.projectId, (items) =>
            items.filter((other) => other._id !== item._id)
          ),
      }
    )
  );
}
