import { cn } from "cn";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
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
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FIELD, Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useMe } from "@/hooks/use-users";
import { useBtcPrices } from "@/lib/bitcoin-price";
import type {
  Fiat,
  Portfolio,
  Transaction,
  TransactionKind,
  Unit,
} from "@/lib/portfolio";
import {
  MAX_SATS,
  amountText,
  fiatSymbol,
  fiatValue,
  formatBtc,
  formatFiat,
  formatSats,
  parseAmount,
  parsePrice,
  sellableAt,
} from "@/lib/portfolio";
import type { TransactionDraft } from "@/lib/portfolio-actions";
import {
  addTransaction,
  deleteTransaction,
  updateTransaction,
} from "@/lib/portfolio-actions";
import { readStorage, writeStorage } from "@/lib/utils";

const UNIT_KEY = "portfolio:unit";
/** Bitcoin's first block; nothing was bought before that day. */
const GENESIS = new Date(2009, 0, 3);
const TIME = /^(?<hours>\d{2}):(?<minutes>\d{2})$/u;
const HINT = "flex flex-wrap items-center gap-x-2 text-xs tabular-nums";
const HINT_ACTION = "text-primary font-medium hover:underline";

/** The form as typed, before it's checked. */
interface Fields {
  kind: TransactionKind;
  unit: Unit;
  amount: string;
  /** Undefined until typed, so the price follows the market meanwhile. */
  typedPrice: string | undefined;
  day: Date;
  time: string;
  note: string;
}

/** The form checked: what it means, and what's wrong with it. */
interface Checked {
  sats?: number;
  price?: number;
  /** The price as the field shows it. */
  shownPrice: string;
  /** The most that can be sold at the chosen moment. */
  sellable: number;
  amountError?: string;
  priceError?: string;
  /** Everything the change needs, once nothing's wrong. */
  draft?: Omit<TransactionDraft, "currency" | "note">;
}

function currentTime(): number {
  return Date.now();
}

function storedUnit(): Unit {
  return readStorage(UNIT_KEY) === "sats" ? "sats" : "btc";
}

/** A price as it's typed into the field: plain digits, cents after a point. */
function priceText(price: number): string {
  return price.toFixed(2);
}

/** The day picked plus the time typed, as a moment. */
function combine(day: Date, time: string): number {
  const { hours = "0", minutes = "0" } = TIME.exec(time)?.groups ?? {};
  const moment = new Date(day);
  moment.setHours(Number(hours), Number(minutes), 0, 0);
  return moment.getTime();
}

/** A new transaction starts now; an existing one as it was saved. */
function initialFields(transaction?: Transaction): Fields {
  const unit = storedUnit();
  if (!transaction) {
    const now = new Date(currentTime());
    return {
      amount: "",
      day: now,
      kind: "buy",
      note: "",
      time: format(now, "HH:mm"),
      typedPrice: undefined,
      unit,
    };
  }
  const at = new Date(transaction.at);
  return {
    amount: amountText(transaction.sats, unit),
    day: at,
    kind: transaction.kind,
    note: transaction.note,
    time: format(at, "HH:mm"),
    typedPrice: priceText(transaction.price),
    unit,
  };
}

function amountError(
  fields: Fields,
  sats: number | undefined,
  sellable: number
): string | undefined {
  if (sats === undefined) {
    if (fields.amount.trim() === "") {
      return undefined;
    }
    return fields.unit === "btc"
      ? "Enter bitcoin with up to 8 decimals, like 0.025."
      : "Enter whole satoshis, like 250000.";
  }
  if (sats > MAX_SATS) {
    return "That’s more bitcoin than there will ever be.";
  }
  if (fields.kind === "sell" && sats > sellable) {
    return `Only ${formatBtc(sellable)} can be sold then.`;
  }
  return undefined;
}

/**
 * What the fields mean. `others` are the portfolio's other transactions, in
 * the order they happened, which limit what a sell can take.
 */
function check(
  fields: Fields,
  market: number | undefined,
  others: Transaction[]
): Checked {
  let shownPrice = fields.typedPrice ?? "";
  if (fields.typedPrice === undefined && market !== undefined) {
    shownPrice = priceText(market);
  }
  const sats = parseAmount(fields.amount, fields.unit);
  const price = parsePrice(shownPrice);
  const at = combine(fields.day, fields.time);
  const sellable = sellableAt(others, at);
  const checked: Checked = {
    amountError: amountError(fields, sats, sellable),
    price,
    priceError:
      shownPrice.trim() !== "" && price === undefined
        ? "Enter a price, like 64000.50."
        : undefined,
    sats,
    sellable,
    shownPrice,
  };
  if (
    sats !== undefined &&
    sats > 0 &&
    price !== undefined &&
    !checked.amountError
  ) {
    checked.draft = { at, kind: fields.kind, price, sats };
  }
  return checked;
}

function UnitToggle({
  unit,
  onChange,
}: {
  unit: Unit;
  onChange: (unit: Unit) => void;
}) {
  return (
    <ToggleGroup
      aria-label="Unit"
      className="bg-foreground/5 absolute inset-y-1 right-1 gap-0 rounded-md p-0.5"
      onValueChange={(next) => {
        const [picked] = next;
        if (picked === "btc" || picked === "sats") {
          onChange(picked);
        }
      }}
      value={[unit]}
    >
      {(["btc", "sats"] as const).map((value) => (
        <ToggleGroupItem
          className="text-muted-foreground hover:text-foreground data-pressed:bg-card data-pressed:text-foreground data-pressed:shadow-surface h-full rounded-[0.3rem] px-2 text-xs font-medium transition-[background-color,color,box-shadow] duration-150"
          key={value}
          value={value}
        >
          {value === "btc" ? "BTC" : "sats"}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

interface AmountFieldProps {
  id: string;
  autoFocus: boolean;
  fields: Fields;
  checked: Checked;
  onAmountChange: (amount: string) => void;
  onUnitChange: (unit: Unit) => void;
}

/** How much bitcoin, in whole coins or satoshis, with the other shown below. */
function AmountField({
  id,
  autoFocus,
  fields: { amount, kind, unit },
  checked: { sats, sellable, amountError: error },
  onAmountChange,
  onUnitChange,
}: AmountFieldProps) {
  let hint: string | undefined;
  if (sats !== undefined) {
    hint = unit === "btc" ? formatSats(sats) : formatBtc(sats);
  }
  const selling = kind === "sell" && !error;
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>Amount</Label>
      <div className="relative">
        <Input
          aria-describedby={`${id}-hint`}
          aria-invalid={error ? true : undefined}
          autoComplete="off"
          autoFocus={autoFocus}
          className="pr-24 tabular-nums"
          id={id}
          inputMode={unit === "btc" ? "decimal" : "numeric"}
          onChange={(event) => onAmountChange(event.target.value)}
          placeholder={unit === "btc" ? "0.00" : "0"}
          value={amount}
        />
        <UnitToggle onChange={onUnitChange} unit={unit} />
      </div>
      <p
        className={cn(
          HINT,
          error ? "text-destructive" : "text-muted-foreground"
        )}
        id={`${id}-hint`}
      >
        {error ?? hint}
        {selling && (
          <>
            {hint && <span aria-hidden>·</span>}
            <span>{formatBtc(sellable)} available</span>
            {sellable > 0 && sats !== sellable && (
              <button
                className={HINT_ACTION}
                onClick={() => onAmountChange(amountText(sellable, unit))}
                type="button"
              >
                Sell all
              </button>
            )}
          </>
        )}
      </p>
    </div>
  );
}

interface PriceFieldProps {
  id: string;
  currency: Fiat;
  /** What one bitcoin costs now, once known. */
  market?: number;
  fields: Fields;
  checked: Checked;
  /** Undefined goes back to the market price. */
  onChange: (typedPrice?: string) => void;
}

/** What one bitcoin cost, following the market until something's typed. */
function PriceField({
  id,
  currency,
  market,
  fields: { typedPrice },
  checked: { shownPrice, priceError: error },
  onChange,
}: PriceFieldProps) {
  let hint = `In ${currency}.`;
  if (market !== undefined) {
    hint = `Current price: ${formatFiat(market, currency)}`;
  }
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>Price per bitcoin</Label>
      <div className="relative">
        <span
          aria-hidden
          className="text-muted-foreground pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm"
        >
          {fiatSymbol(currency)}
        </span>
        <Input
          aria-describedby={`${id}-hint`}
          aria-invalid={error ? true : undefined}
          autoComplete="off"
          className="pl-7 tabular-nums"
          id={id}
          inputMode="decimal"
          onChange={(event) => onChange(event.target.value)}
          placeholder={market === undefined ? "Loading price…" : undefined}
          value={shownPrice}
        />
      </div>
      <p
        className={cn(
          HINT,
          error ? "text-destructive" : "text-muted-foreground"
        )}
        id={`${id}-hint`}
      >
        {error ?? hint}
        {market !== undefined && typedPrice !== undefined && (
          <button
            className={HINT_ACTION}
            onClick={() => onChange()}
            type="button"
          >
            Use current price
          </button>
        )}
      </p>
    </div>
  );
}

interface DateFieldProps {
  id: string;
  day: Date;
  time: string;
  onChange: (moment: Pick<Fields, "day" | "time">) => void;
  /** Whether the moment picked hasn't come yet. */
  future: boolean;
}

/** A day from a calendar and a time beside it. */
function DateField({ id, day, time, onChange, future }: DateFieldProps) {
  const [open, setOpen] = useState(false);
  // Moved on whenever the calendar opens, so a form left open keeps up.
  const [today, setToday] = useState(() => new Date(currentTime()));
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>Date</Label>
      <div className="grid grid-cols-[1fr_7rem] gap-2">
        <Popover
          onOpenChange={(next) => {
            if (next) {
              setToday(new Date(currentTime()));
            }
            setOpen(next);
          }}
          open={open}
        >
          <PopoverTrigger
            aria-invalid={future || undefined}
            className={cn(
              FIELD,
              "flex h-9 items-center justify-between gap-2 text-left select-none"
            )}
            id={id}
          >
            <span>{format(day, "MMM d, yyyy")}</span>
            <CalendarIcon className="text-muted-foreground size-4 shrink-0" />
          </PopoverTrigger>
          <PopoverContent align="start" className="p-2">
            <Calendar
              captionLayout="dropdown"
              defaultMonth={day}
              disabled={[{ before: GENESIS }, { after: today }]}
              endMonth={today}
              mode="single"
              onSelect={(next) => {
                if (next) {
                  onChange({ day: next, time });
                  setOpen(false);
                }
              }}
              required
              selected={day}
              startMonth={GENESIS}
            />
          </PopoverContent>
        </Popover>
        <Input
          aria-invalid={future || undefined}
          aria-label="Time"
          className="tabular-nums"
          onChange={(event) => onChange({ day, time: event.target.value })}
          type="time"
          value={time}
        />
      </div>
      {future && (
        <p className="text-destructive text-xs">That time hasn’t come yet.</p>
      )}
    </div>
  );
}

function TotalRow({
  kind,
  checked: { sats, price },
  currency,
}: {
  kind: TransactionKind;
  checked: Checked;
  currency: Fiat;
}) {
  let total = "—";
  if (sats !== undefined && price !== undefined) {
    total = formatFiat(fiatValue(sats, price), currency);
  }
  return (
    <div className="bg-muted/60 flex items-center justify-between gap-4 rounded-xl px-4 py-3 text-sm">
      <span className="text-muted-foreground">
        {kind === "buy" ? "Total cost" : "Total received"}
      </span>
      <span className="font-semibold tabular-nums">{total}</span>
    </div>
  );
}

function DeleteTransaction({
  transaction,
  onDeleted,
}: {
  transaction: Transaction;
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
          <AlertDialogTitle>Delete this {transaction.kind}?</AlertDialogTitle>
          <AlertDialogDescription>
            It comes off the portfolio for everyone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              deleteTransaction(transaction);
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

interface TransactionFormProps {
  portfolio: Portfolio;
  /** The portfolio's transactions, in the order they happened. */
  transactions: Transaction[];
  /** The transaction to change; a new one starts otherwise. */
  transaction?: Transaction;
  onDone: () => void;
}

function TransactionForm({
  portfolio,
  transactions,
  transaction,
  onDone,
}: TransactionFormProps) {
  const id = useId();
  const me = useMe();
  // A transaction keeps the currency it was entered in; new ones use the person's.
  const currency = transaction?.currency ?? me.currency;
  const market = useBtcPrices().data?.[currency];
  const [fields, setFields] = useState(() => initialFields(transaction));
  const [future, setFuture] = useState(false);
  const [saving, setSaving] = useState(false);
  const others = transactions.filter((item) => item._id !== transaction?._id);
  const checked = check(fields, market, others);

  const change = (patch: Partial<Fields>) =>
    setFields((current) => ({ ...current, ...patch }));

  const changeUnit = (unit: Unit) => {
    const sats = parseAmount(fields.amount, fields.unit);
    change({
      amount: sats === undefined ? fields.amount : amountText(sats, unit),
      unit,
    });
    writeStorage(UNIT_KEY, unit);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const { draft } = checked;
    if (!draft) {
      return;
    }
    if (draft.at > currentTime()) {
      setFuture(true);
      return;
    }
    const full = { ...draft, currency, note: fields.note.trim() };
    setSaving(true);
    const saved = transaction
      ? await updateTransaction(transaction, full)
      : await addTransaction(portfolio, full);
    setSaving(false);
    if (saved !== undefined) {
      onDone();
    }
  };

  return (
    <form className="flex flex-col gap-5" onSubmit={submit}>
      <DialogHeader>
        <DialogTitle>
          {transaction ? "Edit transaction" : "Add transaction"}
        </DialogTitle>
      </DialogHeader>

      <Tabs
        onValueChange={(kind: TransactionKind) => change({ kind })}
        value={fields.kind}
      >
        <TabsList aria-label="Type" className="w-full">
          <TabsTrigger className="flex-1 justify-center" value="buy">
            Buy
          </TabsTrigger>
          <TabsTrigger className="flex-1 justify-center" value="sell">
            Sell
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <AmountField
        autoFocus={!transaction}
        checked={checked}
        fields={fields}
        id={`${id}-amount`}
        onAmountChange={(amount) => change({ amount })}
        onUnitChange={changeUnit}
      />
      <PriceField
        checked={checked}
        currency={currency}
        fields={fields}
        id={`${id}-price`}
        market={market}
        onChange={(typedPrice) => change({ typedPrice })}
      />
      <DateField
        day={fields.day}
        future={future}
        id={`${id}-date`}
        onChange={(moment) => {
          change(moment);
          setFuture(false);
        }}
        time={fields.time}
      />

      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-note`}>Note</Label>
        <Textarea
          id={`${id}-note`}
          onChange={(event) => change({ note: event.target.value })}
          placeholder="Optional"
          value={fields.note}
        />
      </div>

      <TotalRow checked={checked} currency={currency} kind={fields.kind} />

      <DialogFooter className="mt-1">
        {transaction && (
          <DeleteTransaction onDeleted={onDone} transaction={transaction} />
        )}
        <DialogClose render={<Button type="button" variant="ghost" />}>
          Cancel
        </DialogClose>
        <Button disabled={!checked.draft || saving} type="submit">
          {saving && <Spinner />}
          {transaction ? "Save" : `Add ${fields.kind}`}
        </Button>
      </DialogFooter>
    </form>
  );
}

type TransactionDialogProps = Omit<TransactionFormProps, "onDone"> & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function TransactionDialog({
  open,
  onOpenChange,
  ...props
}: TransactionDialogProps) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent showCloseButton={false}>
        <TransactionForm {...props} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
