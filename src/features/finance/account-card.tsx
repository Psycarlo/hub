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
import type { Account, Entry, MonthTotals } from "@/lib/finance";
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

/** What's still waiting, in a line under the net. */
function waiting(totals: MonthTotals, currency: Fiat): string {
  const parts = [
    totals.toPay > 0 && `${formatMoney(totals.toPay, currency)} to pay`,
    totals.toReceive > 0 &&
      `${formatMoney(totals.toReceive, currency)} to receive`,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "Nothing waiting";
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

export function Figures({
  totals,
  currency,
  note,
  wallet = false,
}: {
  totals?: MonthTotals;
  currency: Fiat;
  /** Says the month hasn't started, in place of what's waiting. */
  note?: string;
  /** In a wallet's pocket: larger, in the leather's colors. */
  wallet?: boolean;
}) {
  if (!totals) {
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
        <Net cents={totals.net} currency={currency} wallet={wallet} />
      </span>
      <span
        className={cn(
          "text-sm",
          wallet ? "truncate text-(--wallet-muted)" : "text-muted-foreground"
        )}
      >
        {note ?? waiting(totals, currency)}
      </span>
    </>
  );
  return wallet ? <Appear>{figures}</Appear> : figures;
}

/**
 * Nets of the counted accounts, one per currency they're in. Transfers
 * between two of them in one currency only moved money, so stay out.
 */
function TotalFigures({
  accounts,
  entries,
  today,
}: {
  accounts: Account[];
  entries?: Entry[];
  today: string;
}) {
  if (!entries) {
    return <Figures currency="USD" />;
  }
  const currencies = [...new Set(accounts.map(({ currency }) => currency))];
  const counted = new Map<string, Fiat>(
    accounts.map((account) => [account._id, account.currency])
  );
  const nets = currencies.map((currency) => {
    const ids = new Set(
      accounts
        .filter((account) => account.currency === currency)
        .map(({ _id }) => _id)
    );
    return {
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
  const [first, ...rest] = nets;
  if (!first) {
    return null;
  }
  return (
    <>
      <span className="text-lg font-semibold tracking-tight">
        <Net cents={first.totals.net} currency={first.currency} />
      </span>
      <span className="text-muted-foreground text-sm">
        {rest.length > 0
          ? rest
              .map(({ currency, totals }) =>
                formatMoney(totals.net, currency, { signed: true })
              )
              .join(" · ")
          : waiting(first.totals, first.currency)}
      </span>
    </>
  );
}

/**
 * The project's accounts as cards, with this month's net; `withTotal` leads
 * with one for all of them together, once there's more than one.
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
  const entries = data?.entries;
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
          title={`Total in ${monthName(month)}`}
        >
          <TotalFigures accounts={counted} entries={entries} today={today} />
        </AccountCardLink>
      )}
      {accounts.map((account) => {
        const figures = (
          <Figures
            currency={account.currency}
            note={
              data && !started.has(account._id)
                ? `${monthName(month)} not started`
                : undefined
            }
            totals={
              entries &&
              monthTotals(
                entries.filter((entry) => entry.accountId === account._id),
                today
              )
            }
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
