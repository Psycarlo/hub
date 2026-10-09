import { api } from "@convex/_generated/api";
import { useQuery } from "convex/react";
import { format } from "date-fns";
import {
  CalendarPlusIcon,
  LandmarkIcon,
  PlusIcon,
  RepeatIcon,
  Settings2Icon,
  TagsIcon,
  WalletIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { useSearchParams } from "wouter";

import { IconButton } from "@/components/icon-button";
import { ProjectAvatar } from "@/components/project-avatar";
import type { Crumb } from "@/components/top-bar";
import { TopBar } from "@/components/top-bar";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyTitle } from "@/components/ui/empty";
import { FluidTooltip } from "@/components/ui/fluid-tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { AccountDialog } from "@/features/finance/account-dialog";
import { CategoriesDialog } from "@/features/finance/categories-dialog";
import { EntriesCalendar } from "@/features/finance/entries-calendar";
import { EntriesTable } from "@/features/finance/entries-table";
import { EntryDialog } from "@/features/finance/entry-dialog";
import {
  ActiveFilters,
  EntrySearch,
  FilterButton,
} from "@/features/finance/entry-filters";
import { financePath } from "@/features/finance/finance-context";
import type { FinanceView } from "@/features/finance/finance-parts";
import { useFinanceView } from "@/features/finance/finance-parts";
import { MonthSummary } from "@/features/finance/month-summary";
import { RecurringDialog } from "@/features/finance/recurring-dialog";
import { useToday } from "@/hooks/use-today";
import { useMe } from "@/hooks/use-users";
import type {
  Account,
  Category,
  Entry,
  EntryFilters,
  FinanceMonth,
  Recurring,
} from "@/lib/finance";
import {
  NO_FILTERS,
  filterCount,
  formatMoney,
  matchesFilters,
  monthName,
  monthOf,
  monthTotals,
  parseMonth,
} from "@/lib/finance";
import { addToMonth, startMonth } from "@/lib/finance-actions";
import type { Portfolio, Transaction } from "@/lib/portfolio";
import { formatBtc, formatFiat } from "@/lib/portfolio";
import type { Project } from "@/lib/project";
import { canEdit, canManage, projectPath } from "@/lib/project";

const NO_CATEGORIES: Category[] = [];

type Dialog = "settings" | "entry" | "recurring" | "categories";

function monthlyEntries(count: number): string {
  return count === 1 ? "1 monthly entry" : `${count} monthly entries`;
}

/** What each linked debit bought, said in a line, by entry id. */
function describeBuys(
  entries: Entry[] | undefined,
  transactions: Transaction[] | null | undefined,
  portfolios: Portfolio[]
): Map<string, string> {
  const buys = new Map<string, string>();
  for (const entry of entries ?? []) {
    const buy = transactions?.find((item) => item._id === entry.buyId);
    if (!buy) {
      continue;
    }
    const portfolio = portfolios.find((item) => item._id === buy.portfolioId);
    const into = portfolio ? ` into ${portfolio.title}` : "";
    buys.set(
      entry._id,
      `Bought ${formatBtc(buy.sats)}${into} at ${formatFiat(buy.price, buy.currency)}`
    );
  }
  return buys;
}

/** Everything about one account's month the page shows, as it loads. */
function useAccountMonth(
  project: Project,
  account: Account,
  portfolios: Portfolio[],
  month: string
) {
  const projectId = project._id;
  const data = useQuery(api.finance.inMonth, { month, projectId });
  const allRecurring = useQuery(api.finance.recurring, { projectId });
  const categories =
    useQuery(api.finance.categories, { projectId }) ?? NO_CATEGORIES;
  const entries = useMemo(
    () => data?.entries.filter((entry) => entry.accountId === account._id),
    [data, account._id]
  );
  const recurring = useMemo(
    () => allRecurring?.filter((item) => item.accountId === account._id) ?? [],
    [allRecurring, account._id]
  );
  const hasBuys = entries?.some((entry) => entry.buyId) ?? false;
  const transactions = useQuery(
    api.portfolios.transactions,
    hasBuys ? { projectId } : "skip"
  );
  const started = data?.months.find((item) => item.accountId === account._id);
  return {
    buys: describeBuys(entries, transactions, portfolios),
    categories,
    entries,
    recurring,
    started,
  };
}

/** A line above the entries about the month, with what to do about it. */
function Notice({
  icon,
  children,
  action,
}: {
  icon: ReactNode;
  children: ReactNode;
  action: ReactNode;
}) {
  return (
    <div className="bg-card shadow-surface flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl py-2 pr-2 pl-4 text-sm">
      <span className="text-muted-foreground [&_svg]:size-4">{icon}</span>
      <p className="min-w-0 flex-1">{children}</p>
      {action}
    </div>
  );
}

/** Runs a change from a button, saying so while it does. */
function BusyButton({
  onClick,
  children,
  icon,
  size,
  variant,
}: {
  onClick: () => Promise<unknown>;
  children: ReactNode;
  icon?: ReactNode;
  size?: "sm";
  variant?: "outline";
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await onClick();
        setBusy(false);
      }}
      size={size}
      variant={variant}
    >
      {busy ? <Spinner /> : icon}
      {children}
    </Button>
  );
}

/** Where a month not started yet would be: a way to start it. */
function NotStarted({
  account,
  month,
  recurring,
  editable,
  onSetUp,
}: {
  account: Account;
  month: string;
  recurring: Recurring[];
  editable: boolean;
  onSetUp: () => void;
}) {
  const name = monthName(month);
  let description = `${name} hasn’t started yet.`;
  if (editable && recurring.length > 0) {
    description = `Start it to bring in your ${monthlyEntries(recurring.length)}, not paid yet, and tick them off as they’re paid.`;
  } else if (editable) {
    description =
      "Start it to follow what goes out and comes in. Monthly entries, like rent or a salary, come with every month you start.";
  }
  return (
    <Empty className="bg-muted/60 rounded-2xl py-12">
      <CalendarPlusIcon
        aria-hidden
        className="text-muted-foreground size-8"
        strokeWidth={1.5}
      />
      <EmptyTitle>{name} hasn’t started</EmptyTitle>
      <EmptyDescription className="max-w-sm">{description}</EmptyDescription>
      {editable && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          <BusyButton
            icon={<CalendarPlusIcon />}
            onClick={() => startMonth(account, month)}
          >
            Start {name}
          </BusyButton>
          {recurring.length === 0 && (
            <Button onClick={onSetUp} variant="ghost">
              <RepeatIcon />
              Set up monthly entries
            </Button>
          )}
        </div>
      )}
    </Empty>
  );
}

/** Asks to start a month that already has entries, or to bring in monthly entries made since. */
function MonthNotices({
  account,
  month,
  started,
  recurring,
}: {
  account: Account;
  month: string;
  started?: FinanceMonth;
  recurring: Recurring[];
}) {
  const name = monthName(month);
  if (!started) {
    return (
      <Notice
        action={
          <BusyButton
            icon={<CalendarPlusIcon />}
            onClick={() => startMonth(account, month)}
            size="sm"
            variant="outline"
          >
            Start {name}
          </BusyButton>
        }
        icon={<CalendarPlusIcon />}
      >
        {name} hasn’t started.
        {recurring.length > 0 &&
          ` Starting it brings in ${monthlyEntries(recurring.length)}.`}
      </Notice>
    );
  }
  // Made since the month started, and not for months before they were made.
  const offered = recurring.filter(
    (item) =>
      !started.recurring.includes(item._id) &&
      format(item._creationTime, "yyyy-MM") <= month
  );
  const [first] = offered;
  if (!first) {
    return null;
  }
  return (
    <Notice
      action={
        <BusyButton
          onClick={() =>
            addToMonth(
              account,
              month,
              offered.map((item) => item._id)
            )
          }
          size="sm"
          variant="outline"
        >
          Add to {name}
        </BusyButton>
      }
      icon={<RepeatIcon />}
    >
      {offered.length === 1
        ? `${first.name} became a monthly entry after ${name} started.`
        : `${monthlyEntries(offered.length)} were made after ${name} started.`}
    </Notice>
  );
}

interface MonthEntriesProps {
  account: Account;
  month: string;
  today: string;
  view: FinanceView;
  editable: boolean;
  /** The account's entries in the month. */
  entries: Entry[];
  categories: Category[];
  buys: ReadonlyMap<string, string>;
  filters: EntryFilters;
  onFiltersChange: (filters: EntryFilters) => void;
  onOpen: (entry?: Entry, date?: string) => void;
}

/** The entries as the view lays them out, or why there are none to show. */
function EntryList({
  account,
  month,
  today,
  view,
  editable,
  entries,
  shown,
  categories,
  buys,
  onFiltersChange,
  onOpen,
}: MonthEntriesProps & { shown: Entry[] }) {
  const open = editable ? onOpen : undefined;
  if (view === "calendar") {
    return (
      <EntriesCalendar
        account={account}
        categories={categories}
        editable={editable}
        entries={shown}
        month={month}
        onAdd={editable ? (date) => onOpen(undefined, date) : undefined}
        onOpen={open}
        today={today}
      />
    );
  }
  if (entries.length === 0) {
    return (
      <Empty className="bg-muted/60 rounded-2xl py-10">
        <EmptyDescription className="mt-0">
          Nothing in {monthName(month)} yet.
        </EmptyDescription>
        {editable && (
          <Button onClick={() => onOpen()}>
            <PlusIcon />
            Add transaction
          </Button>
        )}
      </Empty>
    );
  }
  if (shown.length === 0) {
    return (
      <Empty className="bg-muted/60 rounded-2xl py-10">
        <EmptyDescription className="mt-0">No entries match.</EmptyDescription>
        <Button onClick={() => onFiltersChange(NO_FILTERS)} variant="outline">
          Clear search and filters
        </Button>
      </Empty>
    );
  }
  return (
    <EntriesTable
      account={account}
      buys={buys}
      categories={categories}
      editable={editable}
      entries={shown}
      onOpen={open}
      today={today}
    />
  );
}

/** Searching and filtering the month, then its entries. */
function MonthEntries(props: MonthEntriesProps) {
  const { account, today, entries, categories, filters, onFiltersChange } =
    props;
  const shown = entries.filter((entry) =>
    matchesFilters(entry, filters, categories)
  );
  const filtered = filterCount(filters) > 0 || filters.search.trim() !== "";
  return (
    <>
      {entries.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <EntrySearch filters={filters} onChange={onFiltersChange} />
            <FilterButton
              categories={categories}
              entries={entries}
              filters={filters}
              onChange={onFiltersChange}
            />
            {filtered && (
              <p className="text-muted-foreground ml-auto text-sm tabular-nums">
                {shown.length} of {entries.length}
                <span aria-hidden> · </span>
                <span className="text-foreground font-medium">
                  {formatMoney(
                    monthTotals(shown, today).net,
                    account.currency,
                    {
                      signed: true,
                    }
                  )}
                </span>{" "}
                net
              </p>
            )}
          </div>
          <ActiveFilters
            categories={categories}
            filters={filters}
            onChange={onFiltersChange}
          />
        </>
      )}
      <EntryList {...props} shown={shown} />
    </>
  );
}

/** The account's name, and its monthly entries, categories and settings. */
function AccountHeader({
  account,
  recurring,
  editable,
  manageable,
  onOpen,
}: {
  account: Account;
  recurring: number;
  editable: boolean;
  manageable: boolean;
  onOpen: (dialog: Dialog) => void;
}) {
  return (
    <header className="flex items-start gap-4">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h2 className="text-2xl font-semibold tracking-tight">
          {account.title}
        </h2>
        {account.description && (
          <p className="text-muted-foreground max-w-2xl text-sm">
            {account.description}
          </p>
        )}
      </div>
      <FluidTooltip.Group>
        <div className="flex items-center gap-1">
          <IconButton
            label={recurring > 0 ? `Every month · ${recurring}` : "Every month"}
            onClick={() => onOpen("recurring")}
          >
            <RepeatIcon />
          </IconButton>
          {editable && (
            <IconButton label="Categories" onClick={() => onOpen("categories")}>
              <TagsIcon />
            </IconButton>
          )}
          {manageable && (
            <IconButton
              label="Account settings"
              onClick={() => onOpen("settings")}
            >
              <Settings2Icon />
            </IconButton>
          )}
        </div>
      </FluidTooltip.Group>
    </header>
  );
}

/** Where a new entry starts: today in this month, the 1st in any other. */
function startDay(month: string, today: string): string {
  return monthOf(today) === month ? today : `${month}-01`;
}

/** Where the account sits: its project, the project's finance unless it's alone, then itself. */
function accountCrumbs(
  project: Project,
  account: Account,
  alone: boolean
): Crumb[] {
  const finance = {
    href: financePath(project),
    icon: <LandmarkIcon className="text-muted-foreground size-4 shrink-0" />,
    label: "Finance",
  };
  return [
    {
      href: projectPath(project),
      icon: <ProjectAvatar project={project} />,
      label: project.title,
    },
    ...(alone ? [] : [finance]),
    {
      icon: <WalletIcon className="text-muted-foreground size-4 shrink-0" />,
      label: account.title,
    },
  ];
}

/** One account's month: what it adds up to, then every entry in it. */
export function AccountPage({
  project,
  account,
  portfolios,
  alone = false,
}: {
  project: Project;
  account: Account;
  /** The project's portfolios, which debits can buy bitcoin into. */
  portfolios: Portfolio[];
  /** The project's only account, with no list of them to go back to. */
  alone?: boolean;
}) {
  const me = useMe();
  const today = useToday();
  const current = monthOf(today);
  const [params, setParams] = useSearchParams();
  const month = parseMonth(params.get("month")) ?? current;
  const [view, setView] = useFinanceView();
  const [filters, setFilters] = useState(NO_FILTERS);
  const [dialog, setDialog] = useState<Dialog>();
  // Kept while the dialog closes, so it doesn't change under its exit.
  const [editing, setEditing] = useState<Entry>();
  const [newDate, setNewDate] = useState<string>();
  const editable = canEdit(project);
  const manageable =
    editable && (canManage(project) || account.createdBy === me._id);
  const { entries, started, recurring, categories, buys } = useAccountMonth(
    project,
    account,
    portfolios,
    month
  );

  const openEntry = (entry?: Entry, date?: string) => {
    setEditing(entry);
    setNewDate(date);
    setDialog("entry");
  };
  const dialogProps = (name: Dialog) => ({
    onOpenChange: (open: boolean) => setDialog(open ? name : undefined),
    open: dialog === name,
  });

  let body: ReactNode = (
    <div aria-busy className="flex flex-col gap-3">
      <Skeleton className="h-9 w-72 rounded-full" />
      <Skeleton className="h-64 rounded-2xl" />
    </div>
  );
  if (entries?.length === 0 && !started) {
    body = (
      <NotStarted
        account={account}
        editable={editable}
        month={month}
        onSetUp={() => setDialog("recurring")}
        recurring={recurring}
      />
    );
  } else if (entries) {
    body = (
      <div className="flex flex-col gap-3">
        {editable && (
          <MonthNotices
            account={account}
            month={month}
            recurring={recurring}
            started={started}
          />
        )}
        <MonthEntries
          account={account}
          buys={buys}
          categories={categories}
          editable={editable}
          entries={entries}
          filters={filters}
          month={month}
          onFiltersChange={setFilters}
          onOpen={openEntry}
          today={today}
          view={view}
        />
      </div>
    );
  }

  return (
    <>
      <TopBar crumbs={accountCrumbs(project, account, alone)}>
        {editable && (
          <Button onClick={() => openEntry()} size="sm">
            <PlusIcon />
            <span className="max-sm:sr-only">Add transaction</span>
          </Button>
        )}
      </TopBar>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 pt-4 pb-10 sm:px-6">
        <AccountHeader
          account={account}
          editable={editable}
          manageable={manageable}
          onOpen={setDialog}
          recurring={recurring.length}
        />
        <MonthSummary
          currency={account.currency}
          current={current}
          month={month}
          onMonthChange={(next) =>
            setParams(next === current ? {} : { month: next })
          }
          onViewChange={setView}
          started={started !== undefined}
          totals={entries && monthTotals(entries, today)}
          view={view}
        />
        {body}
      </main>
      {manageable && (
        <AccountDialog
          {...dialogProps("settings")}
          account={account}
          project={project}
        />
      )}
      {editable && (
        <EntryDialog
          {...dialogProps("entry")}
          account={account}
          categories={categories}
          defaultDate={newDate ?? startDay(month, today)}
          entry={editing}
          key={editing?._id ?? `new-${newDate ?? month}`}
          portfolios={portfolios}
        />
      )}
      <RecurringDialog
        {...dialogProps("recurring")}
        account={account}
        categories={categories}
        editable={editable}
        items={recurring}
      />
      {editable && (
        <CategoriesDialog
          {...dialogProps("categories")}
          categories={categories === NO_CATEGORIES ? undefined : categories}
          projectId={project._id}
        />
      )}
    </>
  );
}
