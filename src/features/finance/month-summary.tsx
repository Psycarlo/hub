import { cn } from "cn";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect } from "react";

import { IconButton } from "@/components/icon-button";
import { Button } from "@/components/ui/button";
import { FluidTooltip } from "@/components/ui/fluid-tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import type { FinanceView } from "@/features/finance/finance-parts";
import { CREDIT_TEXT, ViewSwitch } from "@/features/finance/finance-parts";
import type { MonthTotals } from "@/lib/finance";
import { formatMoney, monthStart, shiftMonth } from "@/lib/finance";
import type { Fiat } from "@/lib/portfolio";

/** Where arrow keys mean something of their own, so they don't change the month. */
const KEEPS_ARROWS =
  "input, textarea, select, [contenteditable], [role=dialog], [role=menu], [role=listbox], [role=tablist], [role=group], [role=grid]";

/** ← and → step through months, unless something focused uses them. */
function useArrowMonths(onStep: (by: number) => void): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        (event.key !== "ArrowLeft" && event.key !== "ArrowRight")
      ) {
        return;
      }
      if (
        event.target instanceof Element &&
        event.target.closest(KEEPS_ARROWS)
      ) {
        return;
      }
      // A popup open anywhere has the keyboard.
      if (document.querySelector("[data-open][role=dialog]")) {
        return;
      }
      event.preventDefault();
      onStep(event.key === "ArrowLeft" ? -1 : 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onStep]);
}

function Stat({
  label,
  children,
  large = false,
}: {
  label: string;
  children: ReactNode;
  large?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-1",
        large && "col-span-2 sm:col-span-1"
      )}
    >
      <dt className="text-muted-foreground text-sm">{label}</dt>
      <dd
        className={cn(
          "truncate font-semibold tracking-tight tabular-nums",
          large ? "text-2xl sm:text-3xl" : "text-lg sm:text-xl"
        )}
      >
        {children}
      </dd>
    </div>
  );
}

/** What's still to pay or come in, and how much of it is late. */
function Waiting({
  totals,
  currency,
}: {
  totals: MonthTotals;
  currency: Fiat;
}) {
  const parts: ReactNode[] = [];
  if (totals.toPay > 0) {
    parts.push(
      <span key="pay">
        <span className="text-foreground font-medium">
          {formatMoney(totals.toPay, currency)}
        </span>{" "}
        to pay
      </span>
    );
  }
  if (totals.toReceive > 0) {
    parts.push(
      <span key="receive">
        <span className="text-foreground font-medium">
          {formatMoney(totals.toReceive, currency)}
        </span>{" "}
        to receive
      </span>
    );
  }
  if (totals.overdue > 0) {
    parts.push(
      <span className="text-destructive font-medium" key="overdue">
        {totals.overdue} overdue
      </span>
    );
  }
  if (parts.length === 0) {
    return <>Everything’s settled.</>;
  }
  return (
    <>
      {parts.flatMap((part, index) =>
        index === 0
          ? [part]
          : [
              <span aria-hidden key={`dot-${index}`}>
                ·
              </span>,
              part,
            ]
      )}
    </>
  );
}

interface MonthSummaryProps {
  month: string;
  /** The month today is in. */
  current: string;
  onMonthChange: (month: string) => void;
  view: FinanceView;
  onViewChange: (view: FinanceView) => void;
  currency: Fiat;
  /** The month's figures; undefined while loading. */
  totals?: MonthTotals;
  started: boolean;
}

/** The month at the top of an account: moving between months, and what it adds up to. */
export function MonthSummary({
  month,
  current,
  onMonthChange,
  view,
  onViewChange,
  currency,
  totals,
  started,
}: MonthSummaryProps) {
  const step = (by: number) => onMonthChange(shiftMonth(month, by));
  useArrowMonths(step);
  const start = monthStart(month);

  return (
    <section
      aria-label="Month"
      className="bg-card shadow-surface flex flex-col gap-5 rounded-2xl p-5 sm:p-6"
    >
      <div className="flex items-center gap-2">
        <h2 className="min-w-0 flex-1 truncate text-lg font-semibold tracking-tight">
          {start.toLocaleString("en", { month: "long" })}{" "}
          <span className="text-muted-foreground font-normal">
            {start.getFullYear()}
          </span>
        </h2>
        {month !== current && (
          <Button
            onClick={() => onMonthChange(current)}
            size="sm"
            variant="ghost"
          >
            This month
          </Button>
        )}
        <FluidTooltip.Group>
          <div className="flex items-center">
            <IconButton label="Previous month" onClick={() => step(-1)}>
              <ChevronLeftIcon />
            </IconButton>
            <IconButton label="Next month" onClick={() => step(1)}>
              <ChevronRightIcon />
            </IconButton>
          </div>
          <span aria-hidden className="bg-border mx-1 h-5 w-px" />
          <ViewSwitch onChange={onViewChange} value={view} />
        </FluidTooltip.Group>
      </div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
        {totals ? (
          <>
            <Stat label="Net" large>
              <span className={cn(totals.net > 0 && CREDIT_TEXT)}>
                {formatMoney(totals.net, currency, { signed: true })}
              </span>
            </Stat>
            <Stat label="Credits">{formatMoney(totals.credits, currency)}</Stat>
            <Stat label="Debits">{formatMoney(totals.debits, currency)}</Stat>
          </>
        ) : (
          <>
            <Skeleton className="col-span-2 h-16 rounded-lg sm:col-span-1" />
            <Skeleton className="h-14 rounded-lg" />
            <Skeleton className="h-14 rounded-lg" />
          </>
        )}
      </dl>
      {totals && started && (
        <p className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 border-t pt-4 text-sm tabular-nums">
          <Waiting currency={currency} totals={totals} />
        </p>
      )}
    </section>
  );
}
