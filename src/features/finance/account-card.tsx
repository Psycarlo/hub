import { api } from "@convex/_generated/api";
import { cn } from "cn";
import { useQuery } from "convex/react";
import { LandmarkIcon, PlusIcon, WalletIcon } from "lucide-react";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import { Link } from "wouter";

import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { CARD_SURFACE } from "@/features/boards/board-card";
import { accountPath, financePath } from "@/features/finance/finance-context";
import { CREDIT_TEXT } from "@/features/finance/finance-parts";
import { WalletCard } from "@/features/finance/wallet-card";
import { useToday } from "@/hooks/use-today";
import type { Account, Carried, Entry, MonthTotals } from "@/lib/finance";
import {
  formatMoney,
  isInternalTransfer,
  monthName,
  monthOf,
  monthTotals,
} from "@/lib/finance";
import type { Fiat } from "@/lib/portfolio";
import type { Project } from "@/lib/project";
import { plural } from "@/lib/utils";

/** What's still waiting this month, or empty once nothing is. */
function waiting(totals: MonthTotals, currency: Fiat): string {
  return [
    totals.toPay > 0 && `${formatMoney(totals.toPay, currency)} to pay`,
    totals.toReceive > 0 &&
      `${formatMoney(totals.toReceive, currency)} to receive`,
  ]
    .filter(Boolean)
    .join(" · ");
}

function Net({
  cents,
  currency,
  wallet = false,
}: {
  cents: number;
  currency: Fiat;
  wallet?: boolean;
}) {
  return (
    <span
      className={cn(
        cents > 0 && (wallet ? "text-(--wallet-credit)" : CREDIT_TEXT)
      )}
    >
      {formatMoney(cents, currency, { signed: true })}
    </span>
  );
}

/** This month, in a line under the balance: what it came to, and what's still waiting. */
function MonthLine({
  totals,
  currency,
  wallet = false,
}: {
  totals: MonthTotals;
  currency: Fiat;
  wallet?: boolean;
}) {
  const rest = waiting(totals, currency);
  if (totals.net === 0) {
    return rest || "Nothing waiting";
  }
  return (
    <>
      <Net cents={totals.net} currency={currency} wallet={wallet} /> this month
      {rest && ` · ${rest}`}
    </>
  );
}

function AccountCardLink({
  href,
  icon,
  title,
  description,
  excluded = false,
  children,
}: {
  href: string;
  icon: ReactNode;
  title: string;
  description?: string;
  /** Left out of the project's total. */
  excluded?: boolean;
  /** The month's figures, or a placeholder while they load. */
  children: ReactNode;
}) {
  return (
    <Link className={CARD_SURFACE} href={href}>
      <div className="flex items-center gap-3">
        <span className="bg-muted flex size-8 shrink-0 items-center justify-center rounded-lg [&_svg]:size-4">
          {icon}
        </span>
        <h3 className="min-w-0 truncate leading-snug font-medium">{title}</h3>
        {excluded && (
          <span className="text-muted-foreground ml-auto shrink-0 text-xs">
            Not in total
          </span>
        )}
      </div>
      {description && (
        <p className="text-muted-foreground line-clamp-2 text-sm">
          {description}
        </p>
      )}
      <div className="mt-auto flex flex-col pt-2 tabular-nums">{children}</div>
    </Link>
  );
}

const EASE = [0.23, 1, 0.32, 1] as const;

/** Brings the figures into a wallet's pocket out of a soft blur, as they load. */
function Appear({ children }: { children: ReactNode }) {
  return (
    <motion.div
      animate={{ filter: "blur(0px)", opacity: 1 }}
      className="flex min-w-0 flex-col"
      initial={{ filter: "blur(4px)", opacity: 0 }}
      transition={{ duration: 0.45, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

/** What an account comes to in a month: its entries' sums, and what it holds at the end. */
interface AccountMonth {
  totals: MonthTotals;
  balance: number;
}

/** Each account's month, by id: what it carried in, and its entries on top. */
function accountMonths(
  entries: Entry[],
  carried: Carried[],
  today: string
): Map<string, AccountMonth> {
  return new Map(
    carried.map(({ accountId, cents }) => {
      const totals = monthTotals(
        entries.filter((entry) => entry.accountId === accountId),
        today
      );
      return [accountId, { balance: cents + totals.net, totals }];
    })
  );
}

export function Figures({
  balance,
  totals,
  currency,
  note,
  wallet = false,
}: {
  /** What the account holds; undefined while it loads. */
  balance?: number;
  /** This month's sums, under the balance. */
  totals?: MonthTotals;
  currency: Fiat;
  /** Says the month hasn't started, in place of its sums. */
  note?: string;
  /** In a wallet's pocket: larger, in the leather's colors. */
  wallet?: boolean;
}) {
  if (balance === undefined || !totals) {
    return wallet ? (
      <>
        <Skeleton className="my-1.5 h-6 w-36 rounded-md bg-(--wallet-skeleton)" />
        <Skeleton className="my-1 h-3.5 w-40 rounded-md bg-(--wallet-skeleton)" />
      </>
    ) : (
      <>
        <Skeleton className="my-0.5 h-6 w-28 rounded-md" />
        <Skeleton className="my-1 h-3.5 w-36 rounded-md" />
      </>
    );
  }
  const figures = (
    <>
      <span
        className={cn(
          "font-semibold tracking-tight",
          wallet ? "truncate text-[1.75rem] leading-9" : "text-lg"
        )}
      >
        {formatMoney(balance, currency)}
      </span>
      <span
        className={cn(
          "text-sm",
          wallet ? "truncate text-(--wallet-muted)" : "text-muted-foreground"
        )}
      >
        {note ?? (
          <MonthLine currency={currency} totals={totals} wallet={wallet} />
        )}
      </span>
    </>
  );
  return wallet ? <Appear>{figures}</Appear> : figures;
}

/**
 * What the counted accounts hold together, one balance per currency they're
 * in. This month's net leaves out transfers between two of them in one
 * currency, which only moved money.
 */
function TotalFigures({
  accounts,
  entries,
  months,
  today,
}: {
  accounts: Account[];
  entries?: Entry[];
  months?: Map<string, AccountMonth>;
  today: string;
}) {
  if (!(entries && months)) {
    return <Figures currency="USD" />;
  }
  const currencies = [...new Set(accounts.map(({ currency }) => currency))];
  const counted = new Map<string, Fiat>(
    accounts.map((account) => [account._id, account.currency])
  );
  const sums = currencies.map((currency) => {
    const ids = new Set(
      accounts
        .filter((account) => account.currency === currency)
        .map(({ _id }) => _id)
    );
    let balance = 0;
    for (const id of ids) {
      balance += months.get(id)?.balance ?? 0;
    }
    return {
      balance,
      currency,
      totals: monthTotals(
        entries.filter(
          (entry) =>
            ids.has(entry.accountId) &&
            !isInternalTransfer(entry, currency, counted)
        ),
        today
      ),
    };
  });
  const [first, ...rest] = sums;
  if (!first) {
    return null;
  }
  return (
    <>
      <span className="text-lg font-semibold tracking-tight">
        {formatMoney(first.balance, first.currency)}
      </span>
      <span className="text-muted-foreground text-sm">
        {rest.length > 0 ? (
          rest
            .map(({ balance, currency }) => formatMoney(balance, currency))
            .join(" · ")
        ) : (
          <MonthLine currency={first.currency} totals={first.totals} />
        )}
      </span>
    </>
  );
}

/**
 * The project's accounts as cards, with what each holds and its month;
 * `withTotal` leads with one for all of them together, once there's more
 * than one.
 */
export function AccountGrid({
  project,
  accounts,
  withTotal = false,
}: {
  project: Project;
  accounts: Account[];
  withTotal?: boolean;
}) {
  const today = useToday();
  const month = monthOf(today);
  const data = useQuery(api.finance.inMonth, { month, projectId: project._id });
  const months = data
    ? accountMonths(data.entries, data.carried, today)
    : undefined;
  const started = new Set(data?.months.map(({ accountId }) => accountId));
  const counted = accounts.filter((account) => !account.excludedFromTotal);
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {withTotal && counted.length > 1 && (
        <AccountCardLink
          description={
            counted.length === accounts.length
              ? `${plural(counted.length, "account")} together`
              : `${counted.length} of ${plural(accounts.length, "account")}`
          }
          href={financePath(project)}
          icon={<LandmarkIcon />}
          title="Total"
        >
          <TotalFigures
            accounts={counted}
            entries={data?.entries}
            months={months}
            today={today}
          />
        </AccountCardLink>
      )}
      {accounts.map((account) => {
        const own = months?.get(account._id);
        const figures = (
          <Figures
            balance={own?.balance}
            currency={account.currency}
            note={
              data && !started.has(account._id)
                ? `${monthName(month)} not started`
                : undefined
            }
            totals={own?.totals}
            wallet={account.look !== undefined}
          />
        );
        if (account.look) {
          return (
            <Link
              className="focus-visible:ring-ring/50 rounded-[1.375rem] transition-[scale] duration-150 ease-out outline-none focus-visible:ring-3 active:scale-[0.99]"
              href={accountPath(project, account)}
              key={account._id}
            >
              <WalletCard
                currency={account.currency}
                excluded={account.excludedFromTotal}
                look={account.look}
                title={account.title}
              >
                {figures}
              </WalletCard>
            </Link>
          );
        }
        return (
          <AccountCardLink
            description={account.description}
            excluded={account.excludedFromTotal}
            href={accountPath(project, account)}
            icon={<WalletIcon />}
            key={account._id}
            title={account.title}
          >
            {figures}
          </AccountCardLink>
        );
      })}
    </div>
  );
}

/** Where accounts would be: a way to start one, for whoever can. */
export function NoAccounts({
  editable,
  onNew,
}: {
  editable: boolean;
  onNew: () => void;
}) {
  return (
    <Empty>
      <LandmarkIcon
        aria-hidden
        className="text-muted-foreground size-8"
        strokeWidth={1.5}
      />
      <EmptyTitle>No accounts yet</EmptyTitle>
      <EmptyDescription>
        {editable
          ? "Follow the money going out and coming in, month by month."
          : "Finance accounts in this project show up here."}
      </EmptyDescription>
      {editable && (
        <Button onClick={onNew}>
          <PlusIcon />
          New account
        </Button>
      )}
    </Empty>
  );
}
