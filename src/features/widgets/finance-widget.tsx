import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { cn } from "cn";
import { useQuery } from "convex/react";
import { format, parseISO } from "date-fns";
import {
  CircleAlertIcon,
  CircleCheckIcon,
  ClockIcon,
  WalletIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { useId } from "react";
import { Link } from "wouter";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { accountPath } from "@/features/finance/finance-context";
import { CREDIT_TEXT } from "@/features/finance/finance-parts";
import type { WidgetKind } from "@/features/widgets/widget-kind";
import { WidgetBleed } from "@/features/widgets/widget-parts";
import { useToday } from "@/hooks/use-today";
import { useMe } from "@/hooks/use-users";
import type { FinanceOverview, UnpaidEntry } from "@/lib/finance";
import { formatMoney, monthName, monthOf, signedCents } from "@/lib/finance";
import { CHIP_COLORS } from "@/lib/palette";
import type { SettingsOf } from "@/lib/widgets";
import { FINANCE_DEFAULTS } from "@/lib/widgets";

type Settings = SettingsOf<"finance">;

/** Entries the list shows; the chip above it says how many wait in all. */
const SHOWN = 3;
const ROW_HEIGHT = 32;
const ALL = "all";

const OVERDUE = { color: CHIP_COLORS.red, icon: CircleAlertIcon };
const WAITING = { color: CHIP_COLORS.yellow, icon: ClockIcon };
const SETTLED = { color: CHIP_COLORS.green, icon: CircleCheckIcon };

/** How the waiting entries stand, the most pressing news first. */
function waitingState(unpaid: UnpaidEntry[], today: string) {
  const overdue = unpaid.filter((entry) => entry.date < today).length;
  if (overdue > 0) {
    return { ...OVERDUE, text: `${overdue} overdue` };
  }
  if (unpaid.length > 0) {
    return { ...WAITING, text: `${unpaid.length} waiting` };
  }
  return { ...SETTLED, text: "All settled" };
}

function WaitingChip({
  unpaid,
  today,
}: {
  unpaid: UnpaidEntry[];
  today: string;
}) {
  const { color, icon: Icon, text } = waitingState(unpaid, today);
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1 rounded-full pr-2 pl-1.5 text-xs font-medium tabular-nums transition-colors duration-150 ease-out",
        color
      )}
    >
      <Icon aria-hidden className="size-3.5" />
      {text}
    </span>
  );
}

/** One entry still to pay or receive, opening its account on its month. */
function UnpaidRow({ entry, today }: { entry: UnpaidEntry; today: string }) {
  const overdue = entry.date < today;
  return (
    <li>
      <Link
        className="hover:bg-foreground/5 focus-visible:bg-foreground/5 focus-visible:ring-ring/50 flex items-center gap-3 rounded-xl px-4 text-sm transition-colors duration-150 ease-out outline-none focus-visible:ring-2 focus-visible:ring-inset"
        draggable={false}
        href={accountPath(
          { slug: entry.slug },
          { _id: entry.accountId, title: entry.accountTitle },
          monthOf(entry.date)
        )}
        style={{ height: ROW_HEIGHT }}
      >
        <span className="min-w-0 flex-1 truncate">{entry.name}</span>
        <span
          className={cn(
            "shrink-0 text-xs tabular-nums",
            overdue ? "text-destructive" : "text-muted-foreground"
          )}
        >
          <span className="sr-only">{overdue ? "Overdue" : "Due"}</span>
          <time dateTime={entry.date}>
            {format(parseISO(entry.date), "MMM d")}
          </time>
        </span>
        <span
          className={cn(
            "w-20 shrink-0 text-right text-xs font-medium tabular-nums",
            entry.kind === "credit" && CREDIT_TEXT
          )}
        >
          {formatMoney(signedCents(entry), entry.currency, {
            compact: true,
            signed: true,
          })}
        </span>
      </Link>
    </li>
  );
}

function RowSkeleton() {
  return (
    <div
      className="flex items-center gap-3 px-4"
      style={{ height: ROW_HEIGHT }}
    >
      <Skeleton className="h-3 flex-1 rounded-full" />
      <Skeleton className="h-3 w-12 rounded-full" />
    </div>
  );
}

/** The net in the person's own currency first, any others after it. */
function Nets({ overview }: { overview: FinanceOverview }) {
  const { currency: fiat } = useMe();
  const nets = overview.totals
    .map(({ currency, credits, debits }) => ({
      cents: credits - debits,
      currency,
    }))
    .toSorted(
      (a, b) => Number(b.currency === fiat) - Number(a.currency === fiat)
    );
  const [first, ...rest] = nets;
  return (
    <>
      <span className={cn(first && first.cents > 0 && CREDIT_TEXT)}>
        {formatMoney(first?.cents ?? 0, first?.currency ?? fiat, {
          signed: true,
        })}
      </span>
      {rest.map((net) => (
        <span
          className="text-muted-foreground ml-2 text-base font-medium"
          key={net.currency}
        >
          {formatMoney(net.cents, net.currency, { signed: true })}
        </span>
      ))}
    </>
  );
}

function FinanceBody({ settings }: { settings: Settings }) {
  const today = useToday();
  const month = monthOf(today);
  const overview = useQuery(api.finance.overview, {
    accountId: settings.accountId,
    month,
  });
  const accounts = useQuery(api.finance.accounts);
  const account = accounts?.find((item) => item._id === settings.accountId);

  let list: ReactNode = (
    <div aria-busy>
      {Array.from({ length: SHOWN }, (_, index) => (
        <RowSkeleton key={index} />
      ))}
    </div>
  );
  if (overview?.accounts === 0) {
    list = (
      <p className="text-muted-foreground flex h-full items-center justify-center px-4 text-center text-xs">
        {settings.accountId
          ? "This account is gone. Pick another in the settings."
          : "No accounts yet. Add one to a project."}
      </p>
    );
  } else if (overview?.unpaid.length === 0) {
    list = (
      <p className="text-muted-foreground flex h-full items-center justify-center text-xs">
        Nothing waiting
      </p>
    );
  } else if (overview) {
    list = (
      <ul>
        {overview.unpaid.slice(0, SHOWN).map((entry) => (
          <UnpaidRow entry={entry} key={entry._id} today={today} />
        ))}
      </ul>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-2">
        <div className="truncate text-3xl font-semibold tracking-tight tabular-nums">
          {overview ? (
            <Nets overview={overview} />
          ) : (
            <Skeleton className="h-9 w-36 rounded-lg" />
          )}
        </div>
        <div className="flex h-6 items-center gap-2">
          {overview ? (
            <WaitingChip today={today} unpaid={overview.unpaid} />
          ) : (
            <Skeleton className="h-6 w-20 rounded-full" />
          )}
          <span className="text-muted-foreground min-w-0 truncate text-xs">
            Net in {monthName(month)}
            {account && ` · ${account.title}`}
          </span>
        </div>
      </div>
      <WidgetBleed className="border-t p-1">
        <div style={{ height: SHOWN * ROW_HEIGHT }}>{list}</div>
      </WidgetBleed>
    </>
  );
}

function FinanceSettings({
  settings,
  onChange,
}: {
  settings: Settings;
  onChange: (settings: Settings) => void;
}) {
  const id = useId();
  const accounts = useQuery(api.finance.accounts) ?? [];
  const options = [
    { label: "Every account in the total", value: ALL },
    ...accounts.map((account) => ({
      label: account.title,
      value: account._id,
    })),
  ];
  return (
    <div className="flex flex-col gap-2">
      <span className="text-muted-foreground text-xs font-medium" id={id}>
        Account
      </span>
      <Select
        items={options}
        onValueChange={(next: string | null) => {
          if (next === ALL) {
            onChange({ type: "finance" });
          } else if (next) {
            onChange({
              accountId: next as Id<"financeAccounts">,
              type: "finance",
            });
          }
        }}
        value={settings.accountId ?? ALL}
      >
        <SelectTrigger aria-labelledby={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** This month's net across accounts, and what's still to pay or receive. */
export const FINANCE: WidgetKind<Settings> = {
  Body: FinanceBody,
  Settings: FinanceSettings,
  color: "green",
  defaults: FINANCE_DEFAULTS,
  description: "This month’s net and what’s waiting",
  icon: WalletIcon,
  name: "Finance",
};
