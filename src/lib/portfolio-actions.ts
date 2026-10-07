import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { OptimisticLocalStore } from "convex/browser";

import { run } from "@/lib/actions";
import { convex } from "@/lib/convex";
import type {
  Fiat,
  Portfolio,
  Transaction,
  TransactionKind,
} from "@/lib/portfolio";

export interface PortfolioDraft {
  title: string;
  description: string;
}

export interface TransactionDraft {
  kind: TransactionKind;
  sats: number;
  /** What one bitcoin cost, in `currency`. */
  price: number;
  currency: Fiat;
  at: number;
  note: string;
}

function patchTransactions(
  store: OptimisticLocalStore,
  projectId: Id<"projects">,
  patch: (transactions: Transaction[]) => Transaction[]
): void {
  const transactions = store.getQuery(api.portfolios.transactions, {
    projectId,
  });
  if (transactions) {
    store.setQuery(
      api.portfolios.transactions,
      { projectId },
      patch(transactions)
    );
  }
}

/** Starts a portfolio in the project; resolves with its id. */
export function createPortfolio(
  projectId: Id<"projects">,
  draft: PortfolioDraft
) {
  return run(convex.mutation(api.portfolios.create, { projectId, ...draft }));
}

export function updatePortfolio(
  portfolio: Portfolio,
  changes: Partial<PortfolioDraft>
) {
  return run(
    convex.mutation(
      api.portfolios.update,
      { portfolioId: portfolio._id, ...changes },
      {
        optimisticUpdate: (store) => {
          const portfolios = store.getQuery(api.portfolios.list, {});
          if (portfolios) {
            store.setQuery(
              api.portfolios.list,
              {},
              portfolios.map((item) =>
                item._id === portfolio._id ? { ...item, ...changes } : item
              )
            );
          }
        },
      }
    )
  );
}

export function deletePortfolio(portfolio: Portfolio) {
  return run(
    convex.mutation(
      api.portfolios.remove,
      { portfolioId: portfolio._id },
      {
        optimisticUpdate: (store) => {
          const portfolios = store.getQuery(api.portfolios.list, {});
          if (portfolios) {
            store.setQuery(
              api.portfolios.list,
              {},
              portfolios.filter((item) => item._id !== portfolio._id)
            );
          }
          patchTransactions(store, portfolio.projectId, (transactions) =>
            transactions.filter((item) => item.portfolioId !== portfolio._id)
          );
        },
      }
    )
  );
}

export function addTransaction(portfolio: Portfolio, draft: TransactionDraft) {
  return run(
    convex.mutation(api.portfolios.addTransaction, {
      portfolioId: portfolio._id,
      ...draft,
    })
  );
}

export function updateTransaction(
  transaction: Transaction,
  changes: Partial<TransactionDraft>
) {
  return run(
    convex.mutation(api.portfolios.updateTransaction, {
      transactionId: transaction._id,
      ...changes,
    })
  );
}

export function deleteTransaction(transaction: Transaction) {
  return run(
    convex.mutation(
      api.portfolios.removeTransaction,
      { transactionId: transaction._id },
      {
        optimisticUpdate: (store) =>
          patchTransactions(store, transaction.projectId, (transactions) =>
            transactions.filter((item) => item._id !== transaction._id)
          ),
      }
    )
  );
}
