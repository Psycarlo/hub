import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { cn } from "cn";
import { useQuery } from "convex/react";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { HINT, HINT_ACTION, MoneyField } from "@/features/finance/entry-fields";
import { useBtcPrices } from "@/lib/bitcoin-price";
import type { Account } from "@/lib/finance";
import { formatMoney, moneyText, parseMoney } from "@/lib/finance";
import type { Fiat } from "@/lib/portfolio";
import { formatFiat } from "@/lib/portfolio";
import { canEdit } from "@/lib/project";

/** An account a transfer can go to, named with its project when that's another one. */
export interface Destination {
  value: Id<"financeAccounts">;
  title: string;
  project?: string;
  /** Unknown for one out of sight. */
  currency?: Fiat;
}

/**
 * The accounts a transfer from `account` can go to: any other one in a
 * project the person can edit, once they load. `current` stays listed even
 * once it isn't.
 */
export function useDestinations(
  account: Account,
  current?: Id<"financeAccounts">
): Destination[] | undefined {
  const accounts = useQuery(api.finance.accounts);
  const projects = useQuery(api.projects.list);
  if (!(accounts && projects)) {
    return undefined;
  }
  const editable = new Map(
    projects
      .filter((project) => canEdit(project))
      .map((project) => [project._id as string, project.title])
  );
  const destinations: Destination[] = [];
  for (const item of accounts) {
    const project = editable.get(item.projectId);
    if (
      item._id !== account._id &&
      (project !== undefined || item._id === current)
    ) {
      destinations.push({
        currency: item.currency,
        project: item.projectId === account.projectId ? undefined : project,
        title: item.title,
        value: item._id,
      });
    }
  }
  if (current && !destinations.some((item) => item.value === current)) {
    destinations.push({ title: "Another account", value: current });
  }
  return destinations;
}

/** Whether money moving from `account` to `destination` changes currency on the way. */
export function changesCurrency(
  account: Account,
  destination: Destination | undefined
): destination is Destination & { currency: Fiat } {
  return (
    destination?.currency !== undefined &&
    destination.currency !== account.currency
  );
}

/**
 * Where a form's transfer goes, and what arrives there as typed, which only
 * counts when the currency changes on the way.
 */
export function useTransferTarget(
  account: Account,
  to: Id<"financeAccounts"> | undefined,
  receivedText: string
) {
  const destinations = useDestinations(account, to);
  const destination = destinations?.find((item) => item.value === to);
  const crossing = changesCurrency(account, destination);
  const received = crossing ? parseMoney(receivedText) : undefined;
  return {
    destination,
    destinations,
    received,
    valid: to !== undefined && (!crossing || received !== undefined),
  };
}

function DestinationLabel({
  destination,
  from,
}: {
  destination: Destination;
  /** The source's currency, so only a different one is named. */
  from: Fiat;
}) {
  const details = [
    destination.project,
    destination.currency === from ? undefined : destination.currency,
  ].filter(Boolean);
  return (
    <>
      <span className="truncate">{destination.title}</span>
      {details.length > 0 && (
        <span className="text-muted-foreground truncate">
          {details.join(" · ")}
        </span>
      )}
    </>
  );
}

/** Which account a transfer goes to, which then shows it as a credit. */
export function DestinationField({
  id,
  account,
  destinations,
  value,
  onChange,
}: {
  id: string;
  account: Account;
  /** Undefined while they load. */
  destinations?: Destination[];
  value?: Id<"financeAccounts">;
  onChange: (to: Id<"financeAccounts">) => void;
}) {
  if (destinations?.length === 0) {
    return (
      <p className="bg-muted/60 text-muted-foreground rounded-xl px-4 py-3 text-sm">
        No other account to transfer to. Make one first, here or in another
        project.
      </p>
    );
  }
  const items = (destinations ?? []).map((destination) => ({
    label: (
      <DestinationLabel destination={destination} from={account.currency} />
    ),
    value: destination.value,
  }));
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>To</Label>
      <Select
        items={items}
        onValueChange={(next: Id<"financeAccounts"> | null) => {
          if (next) {
            onChange(next);
          }
        }}
        value={value ?? null}
      >
        <SelectTrigger
          aria-describedby={`${id}-hint`}
          className="w-full"
          id={id}
        >
          <SelectValue
            className="items-center gap-2"
            placeholder="Pick an account"
          />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className={cn(HINT, "text-muted-foreground")} id={`${id}-hint`}>
        Shows up there as a credit.
      </p>
    </div>
  );
}

/**
 * What arrives in an account in another currency, with the rate it makes
 * and today's, from bitcoin's price in both, to fill in.
 */
export function ReceivedField({
  id,
  account,
  destination,
  cents,
  received,
  value,
  onChange,
}: {
  id: string;
  account: Account;
  destination: Destination & { currency: Fiat };
  /** What leaves, in the account's cents. */
  cents?: number;
  /** What arrives, as `value` reads, in the destination's cents. */
  received?: number;
  value: string;
  onChange: (value: string) => void;
}) {
  const prices = useBtcPrices().data;
  const from = prices?.[account.currency];
  const to = prices?.[destination.currency];
  const atToday =
    from && to && cents ? Math.round((cents * to) / from) : undefined;
  const error =
    value.trim() && received === undefined
      ? "Enter an amount, like 42.50."
      : undefined;
  let hint = `In ${destination.currency}, as it arrives in ${destination.title}.`;
  if (cents && received) {
    hint = `${formatFiat(1, account.currency)} = ${formatFiat(received / cents, destination.currency)}`;
  }
  return (
    <MoneyField
      currency={destination.currency}
      error={error}
      hint={
        <>
          {hint}
          {atToday !== undefined && atToday > 0 && atToday !== received && (
            <button
              className={HINT_ACTION}
              onClick={() => onChange(moneyText(atToday))}
              title={`About ${formatMoney(atToday, destination.currency)} at today’s rate`}
              type="button"
            >
              Use today’s rate
            </button>
          )}
        </>
      }
      id={id}
      label="Amount received"
      onChange={onChange}
      value={value}
    />
  );
}
