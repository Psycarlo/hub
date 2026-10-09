import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";
import { cn } from "cn";
import {
  BitcoinIcon,
  CalendarDaysIcon,
  CheckIcon,
  TableIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

import { FluidTooltip } from "@/components/ui/fluid-tooltip";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Entry } from "@/lib/finance";
import { formatMoney, signedCents, statusLabel } from "@/lib/finance";
import { updateEntry } from "@/lib/finance-actions";
import type { Fiat } from "@/lib/portfolio";
import { readStorage, writeStorage } from "@/lib/utils";

/** What comes in reads green; what goes out stays plain. */
export const CREDIT_TEXT = "text-green-700 dark:text-green-400";

/** An entry's amount, signed; what's still waiting is muted, as the sums leave it out. */
export function Amount({
  entry,
  currency,
  compact = false,
  className,
}: {
  entry: Pick<Entry, "cents" | "kind" | "paid">;
  currency: Fiat;
  /** Shortened, like `−€1.2K`, where room is tight. */
  compact?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "tabular-nums",
        entry.kind === "credit" && entry.paid && CREDIT_TEXT,
        !entry.paid && "text-muted-foreground",
        className
      )}
    >
      {formatMoney(signedCents(entry), currency, { compact, signed: true })}
    </span>
  );
}

/** Ticks an entry paid or received, or back; read-only without `editable`. */
export function PaidToggle({
  entry,
  editable,
}: {
  entry: Entry;
  editable: boolean;
}) {
  const label = entry.paid
    ? statusLabel(entry.kind, true)
    : `Mark ${statusLabel(entry.kind, true).toLowerCase()}`;
  const toggle = (
    <CheckboxPrimitive.Root
      aria-label={`${entry.name}: ${statusLabel(entry.kind, entry.paid)}`}
      checked={entry.paid}
      className="border-input bg-card focus-visible:ring-ring/50 data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground dark:bg-input/30 dark:data-checked:bg-primary relative flex size-[1.125rem] shrink-0 items-center justify-center rounded-full border transition-[background-color,border-color,box-shadow,scale] duration-150 ease-out outline-none after:absolute after:-inset-2.5 focus-visible:ring-3 active:scale-[0.9] disabled:cursor-default"
      disabled={!editable}
      onCheckedChange={(paid) => updateEntry(entry, { paid })}
    >
      <CheckboxPrimitive.Indicator className="grid place-content-center transition-[opacity,scale] duration-150 ease-out data-ending-style:scale-50 data-ending-style:opacity-0 data-starting-style:scale-50 data-starting-style:opacity-0">
        <CheckIcon className="size-3" strokeWidth={3} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
  if (!editable) {
    return toggle;
  }
  return (
    <Tooltip>
      <TooltipTrigger render={toggle} />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/** Marks a debit that paid for bitcoin, saying what it bought on hover. */
export function BuyBadge({ children }: { children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-orange-500/12 text-orange-700 dark:bg-orange-400/16 dark:text-orange-300" />
        }
      >
        <BitcoinIcon aria-hidden className="size-3" />
        <span className="sr-only">Paid for bitcoin</span>
      </TooltipTrigger>
      <TooltipContent>{children}</TooltipContent>
    </Tooltip>
  );
}

/** How an account lays out its month: rows, or days on a calendar. */
const VIEWS = [
  { icon: TableIcon, label: "Table", value: "table" },
  { icon: CalendarDaysIcon, label: "Calendar", value: "calendar" },
] as const;

export type FinanceView = (typeof VIEWS)[number]["value"];

const VIEW_KEY = "finance:view";

/** The view, remembered on this device across accounts. */
export function useFinanceView(): [FinanceView, (view: FinanceView) => void] {
  const [view, setView] = useState<FinanceView>(() =>
    readStorage(VIEW_KEY) === "calendar" ? "calendar" : "table"
  );
  const change = (next: FinanceView) => {
    setView(next);
    writeStorage(VIEW_KEY, next === "table" ? null : next);
  };
  return [view, change];
}

/**
 * Table or calendar, side by side, so the current one shows at a glance.
 * Its tooltips join an enclosing FluidTooltip.Group.
 */
export function ViewSwitch({
  value,
  onChange,
}: {
  value: FinanceView;
  onChange: (value: FinanceView) => void;
}) {
  return (
    <ToggleGroup
      aria-label="View"
      className="bg-foreground/5 relative isolate gap-0 rounded-full p-0.5"
      onValueChange={(next) => {
        // Pressing the current view again would unpress it; it stays.
        if (next[0]) {
          onChange(next[0] as FinanceView);
        }
      }}
      value={[value]}
    >
      {VIEWS.map(({ icon: Icon, label, value: item }) => (
        <FluidTooltip.Root key={item}>
          <FluidTooltip.Trigger>
            <ToggleGroupItem
              aria-label={label}
              className="text-muted-foreground hover:text-foreground data-pressed:text-foreground flex size-7 items-center justify-center rounded-full transition-colors duration-150"
              value={item}
            >
              <Icon aria-hidden className="size-4" />
            </ToggleGroupItem>
          </FluidTooltip.Trigger>
          <FluidTooltip.Content>{label}</FluidTooltip.Content>
        </FluidTooltip.Root>
      ))}
      {/* Slides between the two, like the tabs' indicator. */}
      <span
        aria-hidden
        className={cn(
          "bg-card shadow-surface absolute top-0.5 left-0.5 -z-10 size-7 rounded-full transition-[translate] duration-200 ease-out",
          value === "calendar" && "translate-x-7"
        )}
      />
    </ToggleGroup>
  );
}
