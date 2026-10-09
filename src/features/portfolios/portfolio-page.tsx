import { api } from "@convex/_generated/api";
import { cn } from "cn";
import { useQuery } from "convex/react";
import { format, parseISO } from "date-fns";
import {
  ArrowDownLeftIcon,
  ArrowUpRightIcon,
  BitcoinIcon,
  ChartSplineIcon,
  PlusIcon,
  Settings2Icon,
  WalletIcon,
} from "lucide-react";
import type { MouseEvent } from "react";
import { useMemo, useState } from "react";

import { IconButton } from "@/components/icon-button";
import { ProjectAvatar } from "@/components/project-avatar";
import { TopBar } from "@/components/top-bar";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Discreet } from "@/features/portfolios/discreet";
import { HoldingsCard } from "@/features/portfolios/holdings-card";
import { portfoliosPath } from "@/features/portfolios/portfolio-context";
import { PortfolioDialog } from "@/features/portfolios/portfolio-dialog";
import { TransactionDialog } from "@/features/portfolios/transaction-dialog";
import { Section } from "@/features/projects/project-page";
import { useMe } from "@/hooks/use-users";
import type { Portfolio, Transaction } from "@/lib/portfolio";
import { fiatValue, formatBtc, formatFiat } from "@/lib/portfolio";
import type { Project } from "@/lib/project";
import { canEdit, canManage, projectPath } from "@/lib/project";

const NUMERIC = "text-right tabular-nums";
/** Rows shown at first, and how many more each "Show more" adds. */
const PAGE = 25;

/** Marks a buy a finance debit paid for, saying which on hover. */
function PaidFrom({ children }: { children: string }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span className="text-muted-foreground inline-flex size-5 items-center justify-center rounded-full" />
        }
      >
        <WalletIcon aria-hidden className="size-3.5" />
        <span className="sr-only">{children}</span>
      </TooltipTrigger>
      <TooltipContent>{children}</TooltipContent>
    </Tooltip>
  );
}

/** Which debit paid for each buy, said in a line, by transaction id. */
function usePaidFrom(project: Project): Map<string, string> {
  const links = useQuery(api.finance.buyLinks, { projectId: project._id });
  const accounts = useQuery(api.finance.accounts);
  const paid = new Map<string, string>();
  for (const link of links ?? []) {
    const account = accounts?.find((item) => item._id === link.accountId);
    const day = format(parseISO(link.date), "MMM d");
    paid.set(
      link.buyId,
      `Paid from ${account?.title ?? "an account"} on ${day}: ${link.name}`
    );
  }
  return paid;
}

function TransactionRows({
  transactions,
  paidFrom,
  onOpen,
}: {
  /** Newest first. */
  transactions: Transaction[];
  /** What paid for each buy a debit paid for, by transaction id. */
  paidFrom: ReadonlyMap<string, string>;
  /** Opens a transaction to change it; rows stay still without it. */
  onOpen?: (transaction: Transaction) => void;
}) {
  const [shown, setShown] = useState(PAGE);
  const rest = transactions.length - shown;
  const open = (
    event: MouseEvent<HTMLTableRowElement>,
    transaction: Transaction
  ) => {
    if (!onOpen || (event.target as Element).closest("a, button")) {
      return;
    }
    onOpen(transaction);
  };
  return (
    <div className="flex flex-col items-center gap-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead className="max-sm:hidden">Type</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead className="text-right max-lg:hidden">Price</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead className="max-md:hidden">Note</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {transactions.slice(0, shown).map((transaction) => {
            const sell = transaction.kind === "sell";
            const paid = paidFrom.get(transaction._id);
            const date = (
              <>
                {format(transaction.at, "MMM d, yyyy")}
                <span className="max-sm:hidden">
                  , {format(transaction.at, "HH:mm")}
                </span>
              </>
            );
            return (
              <TableRow
                className={cn(
                  onOpen && "hover:bg-foreground/[0.025] cursor-pointer"
                )}
                key={transaction._id}
                onClick={(event) => open(event, transaction)}
              >
                <TableCell className="tabular-nums">
                  {onOpen ? (
                    // The row's click, reachable by keyboard too.
                    <button
                      className="focus-visible:ring-ring/50 -mx-1.5 rounded-md px-1.5 py-0.5 outline-none focus-visible:ring-3"
                      onClick={() => onOpen(transaction)}
                      type="button"
                    >
                      {date}
                    </button>
                  ) : (
                    date
                  )}
                </TableCell>
                <TableCell className="max-sm:hidden">
                  <span className="flex items-center gap-1.5">
                    {sell ? (
                      <ArrowUpRightIcon className="text-muted-foreground size-3.5" />
                    ) : (
                      <ArrowDownLeftIcon className="text-primary size-3.5" />
                    )}
                    {sell ? "Sell" : "Buy"}
                    {paid && <PaidFrom>{paid}</PaidFrom>}
                  </span>
                </TableCell>
                <TableCell className={cn(NUMERIC, "font-medium")}>
                  <Discreet>
                    {`${sell ? "−" : "+"}${formatBtc(transaction.sats)}`}
                  </Discreet>
                </TableCell>
                <TableCell className={cn(NUMERIC, "max-lg:hidden")}>
                  {formatFiat(transaction.price, transaction.currency)}
                </TableCell>
                <TableCell className={NUMERIC}>
                  <Discreet>
                    {formatFiat(
                      fiatValue(transaction.sats, transaction.price),
                      transaction.currency
                    )}
                  </Discreet>
                </TableCell>
                <TableCell className="text-muted-foreground max-w-72 truncate max-md:hidden">
                  {transaction.note}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {rest > 0 && (
        <Button
          onClick={() => setShown((count) => count + PAGE)}
          variant="ghost"
        >
          Show {Math.min(rest, PAGE)} more
        </Button>
      )}
    </div>
  );
}

/** One portfolio: what it's worth over time, and the buys and sells behind it. */
export function PortfolioPage({
  project,
  portfolio,
  alone = false,
}: {
  project: Project;
  portfolio: Portfolio;
  /** The project's only portfolio, with no list of them to go back to. */
  alone?: boolean;
}) {
  const me = useMe();
  const editable = canEdit(project);
  const manageable =
    editable && (canManage(project) || portfolio.createdBy === me._id);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [transactionOpen, setTransactionOpen] = useState(false);
  // Kept while the dialog closes, so it doesn't change under its exit.
  const [editing, setEditing] = useState<Transaction>();
  const projectTransactions = useQuery(api.portfolios.transactions, {
    projectId: project._id,
  });
  const transactions = useMemo(
    () =>
      projectTransactions?.filter(
        (transaction) => transaction.portfolioId === portfolio._id
      ),
    [projectTransactions, portfolio._id]
  );
  const newest = useMemo(() => transactions?.toReversed(), [transactions]);
  const paidFrom = usePaidFrom(project);

  const openTransaction = (transaction?: Transaction) => {
    setEditing(transaction);
    setTransactionOpen(true);
  };

  let list = (
    <TransactionRows
      onOpen={editable ? openTransaction : undefined}
      paidFrom={paidFrom}
      transactions={newest ?? []}
    />
  );
  if (newest?.length === 0) {
    list = editable ? (
      <Empty className="bg-muted/60 rounded-2xl py-10">
        <EmptyDescription className="mt-0 max-w-sm">
          Add what was bought or sold, when, and at what price.
        </EmptyDescription>
        <Button onClick={() => openTransaction()}>
          <PlusIcon />
          Add transaction
        </Button>
      </Empty>
    ) : (
      <p className="text-muted-foreground text-sm">No transactions yet.</p>
    );
  }

  return (
    <>
      <TopBar
        crumbs={[
          {
            href: projectPath(project),
            icon: <ProjectAvatar project={project} />,
            label: project.title,
          },
          ...(alone
            ? []
            : [
                {
                  href: portfoliosPath(project),
                  icon: (
                    <ChartSplineIcon className="text-muted-foreground size-4 shrink-0" />
                  ),
                  label: "Portfolios",
                },
              ]),
          {
            icon: (
              <BitcoinIcon className="text-muted-foreground size-4 shrink-0" />
            ),
            label: portfolio.title,
          },
        ]}
      >
        {editable && (
          <Button onClick={() => openTransaction()} size="sm">
            <PlusIcon />
            <span className="max-sm:sr-only">Add transaction</span>
          </Button>
        )}
      </TopBar>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10 px-4 pt-4 pb-10 sm:px-6">
        <div className="flex flex-col gap-6">
          <header className="flex items-start gap-4">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <h2 className="text-2xl font-semibold tracking-tight">
                {portfolio.title}
              </h2>
              {portfolio.description && (
                <p className="text-muted-foreground max-w-2xl text-sm">
                  {portfolio.description}
                </p>
              )}
            </div>
            {manageable && (
              <IconButton
                label="Portfolio settings"
                onClick={() => setSettingsOpen(true)}
              >
                <Settings2Icon />
              </IconButton>
            )}
          </header>
          <HoldingsCard
            label="Holdings"
            sats={portfolio.sats}
            transactions={transactions}
          />
        </div>
        {/* Nothing to list until they load; the chart above shows it's loading. */}
        {newest && <Section title="Transactions">{list}</Section>}
      </main>
      {manageable && (
        <PortfolioDialog
          onOpenChange={setSettingsOpen}
          open={settingsOpen}
          portfolio={portfolio}
          project={project}
        />
      )}
      {editable && (
        <TransactionDialog
          key={editing?._id ?? "new"}
          onOpenChange={setTransactionOpen}
          open={transactionOpen}
          portfolio={portfolio}
          transaction={editing}
          transactions={transactions ?? []}
        />
      )}
    </>
  );
}
