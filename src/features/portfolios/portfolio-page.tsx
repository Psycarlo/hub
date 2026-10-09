import { api } from "@convex/_generated/api";
import { cn } from "cn";
import { useQuery } from "convex/react";
import { format, parseISO } from "date-fns";
import {
  ArrowDownLeftIcon,
  ArrowLeftToLineIcon,
  ArrowRightFromLineIcon,
  ArrowUpRightIcon,
  BitcoinIcon,
  ChartSplineIcon,
  DownloadIcon,
  PlusIcon,
  Settings2Icon,
  Trash2Icon,
  UploadIcon,
  WalletIcon,
  XIcon,
} from "lucide-react";
import type { MouseEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import { IconButton } from "@/components/icon-button";
import { ProjectAvatar } from "@/components/project-avatar";
import { TopBar } from "@/components/top-bar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { ImportDialog } from "@/features/portfolios/import-dialog";
import { portfoliosPath } from "@/features/portfolios/portfolio-context";
import { PortfolioDialog } from "@/features/portfolios/portfolio-dialog";
import { TransactionDialog } from "@/features/portfolios/transaction-dialog";
import { Section } from "@/features/projects/project-page";
import { useMe } from "@/hooks/use-users";
import { downloadFile } from "@/lib/csv";
import type { Portfolio, Transaction, TransactionKind } from "@/lib/portfolio";
import {
  KIND_NAMES,
  MAX_IMPORT,
  formatBtc,
  formatFiat,
  formatSats,
  isIncoming,
  transactionTotal,
} from "@/lib/portfolio";
import { deleteTransactions } from "@/lib/portfolio-actions";
import { exportCsv, exportName } from "@/lib/portfolio-csv";
import type { Project } from "@/lib/project";
import { canEdit, canManage, projectPath } from "@/lib/project";
import { plural } from "@/lib/utils";

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

const KIND_ICONS: Record<TransactionKind, typeof ArrowDownLeftIcon> = {
  buy: ArrowDownLeftIcon,
  receive: ArrowLeftToLineIcon,
  sell: ArrowUpRightIcon,
  send: ArrowRightFromLineIcon,
};

/** A transaction's fee as it was entered: money on a trade, satoshis on a send. */
function feeText(transaction: Transaction): string | undefined {
  if (transaction.feeSats) {
    return formatSats(transaction.feeSats);
  }
  if (transaction.fee) {
    return formatFiat(transaction.fee, transaction.currency);
  }
  return undefined;
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

/** Picked rows, by transaction id; changing it needs editing the portfolio. */
interface Selection {
  ids: ReadonlySet<string>;
  onChange: (ids: Set<string>) => void;
}

function TransactionRows({
  transactions,
  paidFrom,
  portfolioTitles,
  onOpen,
  selection,
}: {
  /** Newest first. */
  transactions: Transaction[];
  /** What paid for each buy a debit paid for, by transaction id. */
  paidFrom: ReadonlyMap<string, string>;
  /** Every portfolio the person can see, to name where sends went and receives came from. */
  portfolioTitles: ReadonlyMap<string, string>;
  /** Opens a transaction to change it; rows stay still without it. */
  onOpen?: (transaction: Transaction) => void;
  /** Rows picked to act on many at once; no checkboxes without it. */
  selection?: Selection;
}) {
  const [shown, setShown] = useState(PAGE);
  const rest = transactions.length - shown;
  const visible = transactions.slice(0, shown);
  // Where the last pick was, so a shift-click picks everything between.
  const anchor = useRef<number | null>(null);
  const picked = visible.filter((item) => selection?.ids.has(item._id));
  const allPicked = visible.length > 0 && picked.length === visible.length;

  const pick = (index: number, checked: boolean, range: boolean) => {
    if (!selection) {
      return;
    }
    const next = new Set(selection.ids);
    const from = range && anchor.current !== null ? anchor.current : index;
    const [start, end] = from < index ? [from, index] : [index, from];
    for (const item of visible.slice(start, end + 1)) {
      if (checked) {
        next.add(item._id);
      } else {
        next.delete(item._id);
      }
    }
    anchor.current = index;
    selection.onChange(next);
  };

  const pickAll = (checked: boolean) => {
    if (!selection) {
      return;
    }
    const next = new Set(selection.ids);
    for (const item of visible) {
      if (checked) {
        next.add(item._id);
      } else {
        next.delete(item._id);
      }
    }
    anchor.current = null;
    selection.onChange(next);
  };

  const open = (
    event: MouseEvent<HTMLTableRowElement>,
    transaction: Transaction
  ) => {
    if (
      !onOpen ||
      (event.target as Element).closest("a, button, [role=checkbox]")
    ) {
      return;
    }
    onOpen(transaction);
  };
  return (
    <div className="flex flex-col items-center gap-3">
      <Table>
        <TableHeader>
          <TableRow>
            {selection && (
              <TableHead className="w-8 pr-0">
                <Checkbox
                  aria-label="Select all shown"
                  checked={allPicked}
                  indeterminate={picked.length > 0 && !allPicked}
                  onCheckedChange={pickAll}
                />
              </TableHead>
            )}
            <TableHead>Date</TableHead>
            <TableHead className="max-sm:hidden">Type</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead className="text-right max-lg:hidden">Price</TableHead>
            <TableHead className="text-right max-lg:hidden">Fee</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead className="max-md:hidden">Note</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visible.map((transaction, index) => {
            const isPicked = selection?.ids.has(transaction._id) ?? false;
            const incoming = isIncoming(transaction.kind);
            const KindIcon = KIND_ICONS[transaction.kind];
            const paid = paidFrom.get(transaction._id);
            const fee = feeText(transaction);
            const other =
              transaction.transfer &&
              (portfolioTitles.get(transaction.transfer.portfolioId) ??
                "another portfolio");
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
                  onOpen && "hover:bg-foreground/[0.025] cursor-pointer",
                  "data-selected:bg-primary/[0.06] data-selected:hover:bg-primary/[0.08]"
                )}
                data-selected={isPicked || undefined}
                key={transaction._id}
                onClick={(event) => open(event, transaction)}
              >
                {selection && (
                  <TableCell className="w-8 pr-0">
                    <Checkbox
                      aria-label={`Select ${KIND_NAMES[transaction.kind].toLowerCase()} on ${format(transaction.at, "MMM d, yyyy")}`}
                      checked={isPicked}
                      onCheckedChange={(checked, details) =>
                        pick(
                          index,
                          checked,
                          (details.event as globalThis.MouseEvent).shiftKey
                        )
                      }
                    />
                  </TableCell>
                )}
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
                <TableCell className="max-w-56 max-sm:hidden">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <KindIcon
                      className={cn(
                        "size-3.5 shrink-0",
                        incoming ? "text-primary" : "text-muted-foreground"
                      )}
                    />
                    {KIND_NAMES[transaction.kind]}
                    {other && (
                      <span className="text-muted-foreground truncate">
                        {transaction.kind === "send" ? "to" : "from"} {other}
                      </span>
                    )}
                    {paid && <PaidFrom>{paid}</PaidFrom>}
                  </span>
                </TableCell>
                <TableCell className={cn(NUMERIC, "font-medium")}>
                  <Discreet>
                    {`${incoming ? "+" : "−"}${formatBtc(transaction.sats)}`}
                  </Discreet>
                </TableCell>
                <TableCell className={cn(NUMERIC, "max-lg:hidden")}>
                  {formatFiat(transaction.price, transaction.currency)}
                </TableCell>
                <TableCell
                  className={cn(NUMERIC, "text-muted-foreground max-lg:hidden")}
                >
                  {fee ? <Discreet>{fee}</Discreet> : "—"}
                </TableCell>
                <TableCell className={NUMERIC}>
                  <Discreet>
                    {formatFiat(
                      transactionTotal(transaction),
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

/** Acts on the picked transactions at once, floating above the page. */
function BulkBar({
  selected,
  portfolio,
  portfolioTitles,
  onClear,
}: {
  /** In the order they happened. */
  selected: Transaction[];
  portfolio: Portfolio;
  portfolioTitles: ReadonlyMap<string, string>;
  onClear: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const label = plural(selected.length, "transaction");
  const transfers = selected.some((item) => item.transfer);
  const tooMany = selected.length > MAX_IMPORT;
  return (
    <div className="bg-popover shadow-raised fixed bottom-4 left-1/2 z-40 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-1 overflow-x-auto rounded-full py-1.5 pr-1.5 pl-4 text-sm">
      <span className="shrink-0 font-medium tabular-nums">
        {selected.length} selected
      </span>
      <span aria-hidden className="bg-border mx-2 h-5 w-px shrink-0" />
      <Button
        onClick={() =>
          downloadFile(
            exportName(portfolio),
            exportCsv(selected, portfolioTitles),
            "text/csv;charset=utf-8"
          )
        }
        size="sm"
        variant="ghost"
      >
        <DownloadIcon />
        Export
      </Button>
      <Button
        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
        disabled={tooMany}
        onClick={() => setConfirming(true)}
        size="sm"
        variant="ghost"
      >
        <Trash2Icon />
        Delete
      </Button>
      <IconButton label="Clear selection" onClick={onClear}>
        <XIcon />
      </IconButton>
      <AlertDialog onOpenChange={setConfirming} open={confirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {label}?</AlertDialogTitle>
            <AlertDialogDescription>
              {transfers
                ? "They come off the portfolio for everyone. Sends between portfolios come off both."
                : "They come off the portfolio for everyone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                deleteTransactions(selected);
                onClear();
              }}
              variant="destructive"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Picked transactions, cleared with Escape while any are. */
function useSelection(): [Set<string>, (ids: Set<string>) => void] {
  const [ids, setIds] = useState<Set<string>>(() => new Set());
  const any = ids.size > 0;
  useEffect(() => {
    if (!any) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      // A dialog's Escape closes the dialog, not the selection behind it.
      const dialog = document.querySelector(
        "[role=dialog], [role=alertdialog]"
      );
      if (event.key === "Escape" && !event.defaultPrevented && !dialog) {
        setIds(new Set());
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [any]);
  return [ids, setIds];
}

/** The portfolio's transactions in both orders, and every visible portfolio's name. */
function usePortfolioTransactions(project: Project, portfolio: Portfolio) {
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
  const portfolios = useQuery(api.portfolios.list);
  const portfolioTitles = useMemo(
    () => new Map(portfolios?.map((item) => [item._id, item.title])),
    [portfolios]
  );
  return { newest, portfolioTitles, transactions };
}

/** Where the list goes while it's empty: a way in for whoever can edit. */
function NoTransactions({
  onAdd,
  onImport,
}: {
  /** Left out for viewers. */
  onAdd?: () => void;
  onImport: () => void;
}) {
  if (!onAdd) {
    return (
      <p className="text-muted-foreground text-sm">No transactions yet.</p>
    );
  }
  return (
    <Empty className="bg-muted/60 rounded-2xl py-10">
      <EmptyDescription className="mt-0 max-w-sm">
        Add what was bought, sold, sent or received, when, and at what price.
      </EmptyDescription>
      <div className="flex flex-wrap justify-center gap-2">
        <Button onClick={onAdd}>
          <PlusIcon />
          Add transaction
        </Button>
        <Button onClick={onImport} variant="outline">
          <UploadIcon />
          Import CSV
        </Button>
      </div>
    </Empty>
  );
}

function CsvActions({
  onExport,
  onImport,
}: {
  onExport: () => void;
  /** Left out for viewers. */
  onImport?: () => void;
}) {
  return (
    <div className="flex items-center gap-1">
      {onImport && (
        <IconButton label="Import CSV" onClick={onImport}>
          <UploadIcon />
        </IconButton>
      )}
      <IconButton label="Export CSV" onClick={onExport}>
        <DownloadIcon />
      </IconButton>
    </div>
  );
}

/** The portfolio's transactions: the list, picking many to act on, and CSV in and out. */
function TransactionsSection({
  project,
  portfolio,
  editable,
  transactions,
  newest,
  portfolioTitles,
  onOpen,
}: {
  project: Project;
  portfolio: Portfolio;
  editable: boolean;
  /** In the order they happened. */
  transactions: Transaction[];
  /** Newest first. */
  newest: Transaction[];
  portfolioTitles: ReadonlyMap<string, string>;
  /** Opens a transaction to change it, or a new one without. */
  onOpen: (transaction?: Transaction) => void;
}) {
  const [importOpen, setImportOpen] = useState(false);
  const [picked, setPicked] = useSelection();
  const paidFrom = usePaidFrom(project);
  // Only what's still there: picked rows deleted elsewhere drop out.
  const selected = transactions.filter((item) => picked.has(item._id));

  const exportAll = () =>
    downloadFile(
      exportName(portfolio),
      exportCsv(transactions, portfolioTitles),
      "text/csv;charset=utf-8"
    );

  return (
    <>
      <Section
        action={
          newest.length > 0 && (
            <CsvActions
              onExport={exportAll}
              onImport={editable ? () => setImportOpen(true) : undefined}
            />
          )
        }
        title="Transactions"
      >
        {newest.length === 0 ? (
          <NoTransactions
            onAdd={editable ? () => onOpen() : undefined}
            onImport={() => setImportOpen(true)}
          />
        ) : (
          <TransactionRows
            onOpen={editable ? onOpen : undefined}
            paidFrom={paidFrom}
            portfolioTitles={portfolioTitles}
            selection={
              editable ? { ids: picked, onChange: setPicked } : undefined
            }
            transactions={newest}
          />
        )}
      </Section>
      {editable && (
        <ImportDialog
          onOpenChange={setImportOpen}
          open={importOpen}
          portfolio={portfolio}
          transactions={transactions}
        />
      )}
      {editable && selected.length > 0 && (
        <BulkBar
          onClear={() => setPicked(new Set())}
          portfolio={portfolio}
          portfolioTitles={portfolioTitles}
          selected={selected}
        />
      )}
    </>
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
  const { transactions, newest, portfolioTitles } = usePortfolioTransactions(
    project,
    portfolio
  );

  const openTransaction = (transaction?: Transaction) => {
    setEditing(transaction);
    setTransactionOpen(true);
  };

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
        {transactions && newest && (
          <TransactionsSection
            editable={editable}
            newest={newest}
            onOpen={openTransaction}
            portfolio={portfolio}
            portfolioTitles={portfolioTitles}
            project={project}
            transactions={transactions}
          />
        )}
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
