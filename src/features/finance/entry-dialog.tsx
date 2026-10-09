import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { cn } from "cn";
import { useQuery } from "convex/react";
import { format, parseISO } from "date-fns";
import type { FormEvent } from "react";
import { useId, useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { CategoryPicker } from "@/features/finance/category-picker";
import {
  DayField,
  HINT,
  HINT_ACTION,
  KindTabs,
  MoneyField,
  SwitchRow,
} from "@/features/finance/entry-fields";
import {
  UNIT_KEY,
  UnitToggle,
  storedUnit,
} from "@/features/portfolios/transaction-dialog";
import { useToday } from "@/hooks/use-today";
import { useBtcPrices } from "@/lib/bitcoin-price";
import type { Account, Category, Entry, EntryKind } from "@/lib/finance";
import {
  MAX_ENTRY_NAME,
  formatMoney,
  moneyText,
  parseMoney,
  statusLabel,
} from "@/lib/finance";
import type { BuyChange, EntryDraft } from "@/lib/finance-actions";
import { addEntry, deleteEntry, updateEntry } from "@/lib/finance-actions";
import type { Portfolio, Transaction, Unit } from "@/lib/portfolio";
import {
  SATS_PER_BTC,
  amountText,
  fiatValue,
  formatBtc,
  formatFiat,
  parseAmount,
} from "@/lib/portfolio";
import { writeStorage } from "@/lib/utils";

type BitcoinMode = "none" | "new" | "existing";

/** The bitcoin a debit paid for, as typed. */
interface BitcoinFields {
  mode: BitcoinMode;
  /** Where a new buy goes. */
  portfolioId?: Id<"portfolios">;
  /** Bitcoin a new buy got, in `unit`. */
  amount: string;
  unit: Unit;
  /** A buy already in a portfolio. */
  buyId?: Id<"portfolioTransactions">;
}

/** The form as typed, before it's checked. */
interface Fields {
  kind: EntryKind;
  name: string;
  amount: string;
  date: string;
  category?: string;
  note: string;
  paid: boolean;
  bitcoin: BitcoinFields;
}

/** A new entry starts settled, unless its day is still to come. */
function initialFields(
  entry: Entry | undefined,
  defaultDate: string,
  today: string,
  portfolios: Portfolio[]
): Fields {
  const bitcoin: BitcoinFields = {
    amount: "",
    buyId: entry?.buyId,
    mode: entry?.buyId ? "existing" : "none",
    portfolioId: portfolios[0]?._id,
    unit: storedUnit(),
  };
  if (!entry) {
    return {
      amount: "",
      bitcoin,
      date: defaultDate,
      kind: "debit",
      name: "",
      note: "",
      paid: defaultDate <= today,
    };
  }
  return {
    amount: moneyText(entry.cents),
    bitcoin,
    category: entry.category,
    date: entry.date,
    kind: entry.kind,
    name: entry.name,
    note: entry.note,
    paid: entry.paid,
  };
}

/** When a buy on `date` happened: now if it's today, midday otherwise. */
function buyMoment(date: string, today: string): number {
  if (date === today) {
    return Date.now();
  }
  const moment = parseISO(date);
  moment.setHours(12, 0, 0, 0);
  return moment.getTime();
}

/**
 * How the entry's bitcoin changes on saving, or "invalid" while the bitcoin
 * part isn't filled in. A credit lets go of any buy.
 */
function buyChange(
  fields: Fields,
  entry: Entry | undefined,
  today: string
): BuyChange | undefined | "invalid" {
  const { bitcoin } = fields;
  const mode = fields.kind === "debit" ? bitcoin.mode : "none";
  if (mode === "none") {
    return entry?.buyId ? { buyId: null } : undefined;
  }
  if (mode === "existing") {
    if (!bitcoin.buyId) {
      return "invalid";
    }
    return bitcoin.buyId === entry?.buyId
      ? undefined
      : { buyId: bitcoin.buyId };
  }
  const sats = parseAmount(bitcoin.amount, bitcoin.unit);
  if (!(bitcoin.portfolioId && sats && sats > 0) || fields.date > today) {
    return "invalid";
  }
  return {
    buy: {
      at: buyMoment(fields.date, today),
      portfolioId: bitcoin.portfolioId,
      sats,
    },
  };
}

function DeleteEntry({
  entry,
  onDeleted,
}: {
  entry: Entry;
  onDeleted: () => void;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button className="sm:mr-auto" type="button" variant="destructive" />
        }
      >
        Delete
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this {entry.kind}?</AlertDialogTitle>
          <AlertDialogDescription>
            {entry.buyId
              ? "It comes off the account for everyone. The bitcoin buy it paid for stays in its portfolio."
              : "It comes off the account for everyone."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              deleteEntry(entry);
              onDeleted();
            }}
            variant="destructive"
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

interface BitcoinPartProps {
  id: string;
  account: Account;
  portfolios: Portfolio[];
  entry?: Entry;
  fields: Fields;
  cents?: number;
  future: boolean;
  onChange: (bitcoin: Partial<BitcoinFields>) => void;
  onAmountChange: (amount: string) => void;
}

/** What the bitcoin field says under it: what's wrong, or the price the debit paid. */
function boughtHint({
  bitcoin,
  sats,
  cents,
  future,
  currency,
}: {
  bitcoin: BitcoinFields;
  sats?: number;
  cents?: number;
  future: boolean;
  currency: Account["currency"];
}): { hint: string; error?: string } {
  const hint = "What the debit bought, in bitcoin or satoshis.";
  if (future) {
    return { error: "Bitcoin can’t be bought on a day still to come.", hint };
  }
  if (bitcoin.amount.trim() && sats === undefined) {
    return {
      error:
        bitcoin.unit === "btc"
          ? "Enter bitcoin with up to 8 decimals, like 0.025."
          : "Enter whole satoshis, like 250000.",
      hint,
    };
  }
  if (sats && cents) {
    const price = (cents / 100 / sats) * SATS_PER_BTC;
    return { hint: `≈ ${formatFiat(price, currency)} per bitcoin` };
  }
  return { hint };
}

/** Which of the project's portfolios a new buy goes into. */
function PortfolioPicker({
  id,
  portfolios,
  value,
  onChange,
}: {
  id: string;
  portfolios: Portfolio[];
  value?: Id<"portfolios">;
  onChange: (portfolioId: Id<"portfolios">) => void;
}) {
  const options = portfolios.map((portfolio) => ({
    label: portfolio.title,
    value: portfolio._id,
  }));
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>Portfolio</Label>
      <Select
        items={options}
        onValueChange={(next: Id<"portfolios"> | null) => {
          if (next) {
            onChange(next);
          }
        }}
        value={value}
      >
        <SelectTrigger className="w-full" id={id}>
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

/** A buy the debit records in one of the project's portfolios, at what it paid. */
function NewBuy({
  id,
  account,
  portfolios,
  fields: { bitcoin },
  cents,
  future,
  onChange,
}: BitcoinPartProps) {
  const market = useBtcPrices().data?.[account.currency];
  const sats = parseAmount(bitcoin.amount, bitcoin.unit);
  const { hint, error } = boughtHint({
    bitcoin,
    cents,
    currency: account.currency,
    future,
    sats,
  });
  // What the debit would have bought at today's price, to fill in.
  const atMarket =
    market !== undefined && cents
      ? Math.round((cents / 100 / market) * SATS_PER_BTC)
      : 0;
  const offerMarket = !error && atMarket > 0 && atMarket !== sats;

  return (
    <>
      {portfolios.length > 1 && (
        <PortfolioPicker
          id={`${id}-portfolio`}
          onChange={(portfolioId) => onChange({ portfolioId })}
          portfolios={portfolios}
          value={bitcoin.portfolioId}
        />
      )}
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-sats`}>
          Bitcoin bought
          {portfolios.length === 1 && (
            <span className="text-muted-foreground font-normal">
              {" "}
              into {portfolios[0]?.title}
            </span>
          )}
        </Label>
        <div className="relative">
          <Input
            aria-describedby={`${id}-sats-hint`}
            aria-invalid={error ? true : undefined}
            autoComplete="off"
            className="pr-24 tabular-nums"
            id={`${id}-sats`}
            inputMode={bitcoin.unit === "btc" ? "decimal" : "numeric"}
            onChange={(event) => onChange({ amount: event.target.value })}
            placeholder={bitcoin.unit === "btc" ? "0.00" : "0"}
            value={bitcoin.amount}
          />
          <UnitToggle
            onChange={(unit) => {
              onChange({
                amount:
                  sats === undefined ? bitcoin.amount : amountText(sats, unit),
                unit,
              });
              writeStorage(UNIT_KEY, unit);
            }}
            unit={bitcoin.unit}
          />
        </div>
        <p
          className={cn(
            HINT,
            error ? "text-destructive" : "text-muted-foreground"
          )}
          id={`${id}-sats-hint`}
        >
          {error ?? hint}
          {offerMarket && (
            <button
              className={HINT_ACTION}
              onClick={() =>
                onChange({ amount: amountText(atMarket, bitcoin.unit) })
              }
              type="button"
            >
              Use today’s price
            </button>
          )}
        </p>
      </div>
    </>
  );
}

/** What a buy reads as among others: when, how much, for what, and where. */
function buyLabel(buy: Transaction, portfolios: Portfolio[]): string {
  const portfolio = portfolios.find((item) => item._id === buy.portfolioId);
  return [
    format(buy.at, "MMM d, yyyy"),
    formatBtc(buy.sats),
    formatFiat(fiatValue(buy.sats, buy.price), buy.currency),
    portfolio?.title,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** A buy already in one of the project's portfolios that no other debit paid for. */
function ExistingBuy({
  id,
  account,
  portfolios,
  entry,
  fields: { bitcoin },
  cents,
  onChange,
  onAmountChange,
}: BitcoinPartProps) {
  const transactions = useQuery(api.portfolios.transactions, {
    projectId: account.projectId,
  });
  const links = useQuery(api.finance.buyLinks, {
    projectId: account.projectId,
  });
  const taken = new Set(
    links?.flatMap((link) => (link.entryId === entry?._id ? [] : [link.buyId]))
  );
  const buys = (transactions ?? [])
    .filter((item) => item.kind === "buy" && !taken.has(item._id))
    .toReversed();
  const options = buys.map((buy) => ({
    label: buyLabel(buy, portfolios),
    value: buy._id,
  }));
  const picked = buys.find((buy) => buy._id === bitcoin.buyId);
  const total =
    picked?.currency === account.currency
      ? Math.round(fiatValue(picked.sats, picked.price) * 100)
      : undefined;

  if (transactions && links && buys.length === 0) {
    return (
      <p className="text-muted-foreground text-xs">
        No buys to link: the project’s portfolios have none another debit hasn’t
        paid for.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={`${id}-buy`}>Buy</Label>
      <Select
        items={options}
        onValueChange={(next: Id<"portfolioTransactions"> | null) => {
          const buy = buys.find((item) => item._id === next);
          if (!buy) {
            return;
          }
          onChange({ buyId: buy._id });
          // Saves typing what the buy cost, when it's in the same money.
          if (cents === undefined && buy.currency === account.currency) {
            onAmountChange(
              moneyText(Math.round(fiatValue(buy.sats, buy.price) * 100))
            );
          }
        }}
        value={bitcoin.buyId ?? null}
      >
        <SelectTrigger className="w-full" id={`${id}-buy`}>
          <SelectValue placeholder="Pick a buy" />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {total !== undefined && total !== cents && (
        <p className={cn(HINT, "text-muted-foreground")}>
          The buy cost {formatMoney(total, account.currency)}
          <button
            className={HINT_ACTION}
            onClick={() => onAmountChange(moneyText(total))}
            type="button"
          >
            Use as amount
          </button>
        </p>
      )}
    </div>
  );
}

/** Ties a debit to the bitcoin it bought: a new buy, or one already recorded. */
function BitcoinPart(props: BitcoinPartProps) {
  const { id, fields, onChange } = props;
  const { mode } = fields.bitcoin;
  return (
    <div className="flex flex-col gap-4">
      <SwitchRow
        checked={mode !== "none"}
        hint="Link it to a buy in one of the project’s portfolios."
        id={`${id}-bitcoin`}
        label="Bought bitcoin"
        onChange={(on) => {
          // Turned back on, a debit already linked picks up its buy again.
          const linked = fields.bitcoin.buyId ? "existing" : "new";
          onChange({ mode: on ? linked : "none" });
        }}
      />
      {mode !== "none" && (
        <div className="bg-muted/60 flex flex-col gap-4 rounded-xl p-4">
          <Tabs
            onValueChange={(next: BitcoinMode) => onChange({ mode: next })}
            value={mode}
          >
            <TabsList aria-label="Buy" className="w-full">
              <TabsTrigger className="flex-1 justify-center" value="new">
                New buy
              </TabsTrigger>
              <TabsTrigger className="flex-1 justify-center" value="existing">
                Existing buy
              </TabsTrigger>
            </TabsList>
          </Tabs>
          {mode === "new" ? <NewBuy {...props} /> : <ExistingBuy {...props} />}
        </div>
      )}
    </div>
  );
}

interface EntryFormProps {
  account: Account;
  categories: Category[];
  /** The project's portfolios, which a debit can buy bitcoin into. */
  portfolios: Portfolio[];
  /** The entry to change; a new one starts otherwise. */
  entry?: Entry;
  /** The day a new entry starts on. */
  defaultDate: string;
  onDone: () => void;
}

function EntryForm({
  account,
  categories,
  portfolios,
  entry,
  defaultDate,
  onDone,
}: EntryFormProps) {
  const id = useId();
  const today = useToday();
  const [fields, setFields] = useState(() =>
    initialFields(entry, defaultDate, today, portfolios)
  );
  const [saving, setSaving] = useState(false);
  const cents = parseMoney(fields.amount);
  const amountError =
    fields.amount.trim() && cents === undefined
      ? "Enter an amount, like 42.50."
      : undefined;
  const buy = buyChange(fields, entry, today);
  const valid =
    fields.name.trim() !== "" && cents !== undefined && buy !== "invalid";
  // Only a debit buys bitcoin; one already linked keeps the part so it can let go.
  const showBitcoin =
    fields.kind === "debit" && (portfolios.length > 0 || entry?.buyId);

  const change = (patch: Partial<Fields>) =>
    setFields((current) => ({ ...current, ...patch }));
  const changeBitcoin = (patch: Partial<BitcoinFields>) =>
    setFields((current) => ({
      ...current,
      bitcoin: { ...current.bitcoin, ...patch },
    }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!valid) {
      return;
    }
    const draft: EntryDraft = {
      category: fields.category,
      cents,
      date: fields.date,
      kind: fields.kind,
      name: fields.name.trim(),
      note: fields.note.trim(),
      paid: fields.paid,
    };
    setSaving(true);
    const saved = entry
      ? await updateEntry(entry, draft, buy)
      : await addEntry(account, draft, buy);
    setSaving(false);
    if (saved !== undefined) {
      onDone();
    }
  };

  const paidLabel = statusLabel(fields.kind, true);

  return (
    <form className="flex flex-col gap-5" onSubmit={submit}>
      <DialogHeader>
        <DialogTitle>
          {entry ? "Edit transaction" : "Add transaction"}
        </DialogTitle>
      </DialogHeader>

      <KindTabs onChange={(kind) => change({ kind })} value={fields.kind} />

      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-name`}>Name</Label>
        <Input
          autoComplete="off"
          autoFocus={!entry}
          id={`${id}-name`}
          maxLength={MAX_ENTRY_NAME}
          onChange={(event) => change({ name: event.target.value })}
          placeholder={fields.kind === "debit" ? "Groceries" : "Salary"}
          value={fields.name}
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-2 sm:gap-3">
        <MoneyField
          currency={account.currency}
          error={amountError}
          id={`${id}-amount`}
          onChange={(amount) => change({ amount })}
          value={fields.amount}
        />
        <DayField
          id={`${id}-date`}
          onChange={(date) => change({ date })}
          value={fields.date}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-category`}>Category</Label>
        <CategoryPicker
          categories={categories}
          id={`${id}-category`}
          onChange={(category) => change({ category })}
          projectId={account.projectId}
          value={fields.category}
        />
      </div>

      <SwitchRow
        checked={fields.paid}
        hint={`Only what’s ${paidLabel.toLowerCase()} counts toward the month.`}
        id={`${id}-paid`}
        label={paidLabel}
        onChange={(paid) => change({ paid })}
      />

      {showBitcoin && (
        <BitcoinPart
          account={account}
          cents={cents}
          entry={entry}
          fields={fields}
          future={fields.date > today}
          id={id}
          onAmountChange={(amount) => change({ amount })}
          onChange={changeBitcoin}
          portfolios={portfolios}
        />
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-note`}>Note</Label>
        <Textarea
          id={`${id}-note`}
          onChange={(event) => change({ note: event.target.value })}
          placeholder="Optional"
          value={fields.note}
        />
      </div>

      <DialogFooter className="mt-1">
        {entry && <DeleteEntry entry={entry} onDeleted={onDone} />}
        <DialogClose render={<Button type="button" variant="ghost" />}>
          Cancel
        </DialogClose>
        <Button disabled={!valid || saving} type="submit">
          {saving && <Spinner />}
          {entry ? "Save" : `Add ${fields.kind}`}
        </Button>
      </DialogFooter>
    </form>
  );
}

type EntryDialogProps = Omit<EntryFormProps, "onDone"> & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function EntryDialog({
  open,
  onOpenChange,
  ...props
}: EntryDialogProps) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent showCloseButton={false}>
        <EntryForm {...props} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
