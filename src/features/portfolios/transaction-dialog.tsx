import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { cn } from "cn";
import { useQuery } from "convex/react";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import type { ChangeEvent, FocusEvent, FormEvent, KeyboardEvent } from "react";
import { useId, useRef, useState } from "react";

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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useNow } from "@/hooks/use-now";
import { useMe } from "@/hooks/use-users";
import { useBtcPriceAt, useBtcPrices } from "@/lib/bitcoin-price";
import type {
  Fiat,
  Portfolio,
  Transaction,
  TransactionKind,
  Unit,
} from "@/lib/portfolio";
import {
  KIND_NAMES,
  MAX_SATS,
  TRANSACTION_KINDS,
  amountText,
  fiatSymbol,
  formatBtc,
  formatFiat,
  formatSats,
  parseAmount,
  parsePrice,
  sellableAt,
  transactionTotal,
} from "@/lib/portfolio";
import type { TransactionDraft } from "@/lib/portfolio-actions";
import {
  addTransaction,
  deleteTransaction,
  updateTransaction,
} from "@/lib/portfolio-actions";
import { canEdit } from "@/lib/project";
import { readStorage, writeStorage } from "@/lib/utils";

export const UNIT_KEY = "portfolio:unit";
/** Bitcoin's first block; nothing was bought before that day. */
const GENESIS = new Date(2009, 0, 3);
const TIME = /^(?<hours>\d{2}):(?<minutes>\d{2})$/u;
/** A moment this close to now goes by the live price. */
const RECENT = 10 * 60 * 1000;
const HINT = "flex flex-wrap items-center gap-x-2 text-xs tabular-nums";
const HINT_ACTION = "text-primary font-medium hover:underline";
/** Where a send goes when it's not to another portfolio. */
const OUTSIDE = "outside";
const ZERO = /^0*(?:[.,]0*)?$/u;

/** The form as typed, before it's checked. */
interface Fields {
  kind: TransactionKind;
  unit: Unit;
  amount: string;
  /** Undefined until typed, so the price follows the moment picked meanwhile. */
  typedPrice: string | undefined;
  day: Date;
  time: string;
  note: string;
  /** A buy's or sell's fee, in the currency. */
  fee: string;
  /** A send's network fee, in `unit`. */
  feeSats: string;
  /** Where a send goes: a portfolio's id, or `OUTSIDE`. */
  to: string;
}

/** The form checked: what it means, and what's wrong with it. */
interface Checked {
  sats?: number;
  price?: number;
  /** The fee the kind takes, in the currency or in satoshis; zero when there's none. */
  fee?: number;
  /** The price as the field shows it. */
  shownPrice: string;
  /** The most that can be sold or sent at the chosen moment, fees included. */
  sellable: number;
  amountError?: string;
  priceError?: string;
  feeError?: string;
  /** Everything the change needs, once nothing's wrong. */
  draft?: Omit<TransactionDraft, "currency" | "note">;
}

/** Whether the kind trades bitcoin for money, so takes a fee in it. */
function isTrade(kind: TransactionKind): boolean {
  return kind === "buy" || kind === "sell";
}

function currentTime(): number {
  return Date.now();
}

export function storedUnit(): Unit {
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
      fee: "",
      feeSats: "",
      kind: "buy",
      note: "",
      time: format(now, "HH:mm"),
      to: OUTSIDE,
      typedPrice: undefined,
      unit,
    };
  }
  const at = new Date(transaction.at);
  return {
    amount: amountText(transaction.sats, unit),
    day: at,
    fee: transaction.fee ? priceText(transaction.fee) : "",
    feeSats: transaction.feeSats ? amountText(transaction.feeSats, unit) : "",
    kind: transaction.kind,
    note: transaction.note,
    time: format(at, "HH:mm"),
    to:
      transaction.kind === "send" && transaction.transfer
        ? transaction.transfer.portfolioId
        : OUTSIDE,
    typedPrice: priceText(transaction.price),
    unit,
  };
}

/** The fee the kind takes, typed: zero when blank, undefined if it isn't an amount. */
function parseFee(fields: Fields): number | undefined {
  if (fields.kind === "send") {
    return fields.feeSats.trim() === ""
      ? 0
      : parseAmount(fields.feeSats, fields.unit);
  }
  if (!isTrade(fields.kind) || ZERO.test(fields.fee.trim())) {
    return 0;
  }
  return parsePrice(fields.fee);
}

function feeError(fields: Fields, fee: number | undefined): string | undefined {
  if (fee === undefined) {
    if (fields.kind === "send") {
      return fields.unit === "btc"
        ? "Enter bitcoin with up to 8 decimals, like 0.00001."
        : "Enter whole satoshis, like 1500.";
    }
    return "Enter a fee, like 2.50.";
  }
  if (fields.kind === "send" && fee > MAX_SATS) {
    return "That’s more bitcoin than there will ever be.";
  }
  return undefined;
}

function amountError(
  fields: Fields,
  sats: number | undefined,
  sellable: number,
  feeSats: number
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
  if (fields.kind === "send" && sats + feeSats > sellable) {
    const most = Math.max(0, sellable - feeSats);
    return feeSats > 0
      ? `Only ${formatBtc(most)} can be sent then, after the fee.`
      : `Only ${formatBtc(most)} can be sent then.`;
  }
  return undefined;
}

/**
 * What the fields mean. `others` are the portfolio's other transactions, in
 * the order they happened, which limit what a sell or send can take.
 */
function check(
  fields: Fields,
  /** What one bitcoin cost at the moment picked, once known. */
  reference: number | undefined,
  others: Transaction[]
): Checked {
  let shownPrice = fields.typedPrice ?? "";
  if (fields.typedPrice === undefined && reference !== undefined) {
    shownPrice = priceText(reference);
  }
  const sats = parseAmount(fields.amount, fields.unit);
  const price = parsePrice(shownPrice);
  const at = combine(fields.day, fields.time);
  const sellable = sellableAt(others, at);
  const fee = parseFee(fields);
  const feeSats = fields.kind === "send" ? (fee ?? 0) : 0;
  const checked: Checked = {
    amountError: amountError(fields, sats, sellable, feeSats),
    fee,
    feeError: feeError(fields, fee),
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
    fee !== undefined &&
    !checked.amountError &&
    !checked.feeError
  ) {
    checked.draft = {
      at,
      fee: isTrade(fields.kind) ? fee : 0,
      feeSats,
      kind: fields.kind,
      price,
      sats,
      toPortfolioId:
        fields.kind === "send" && fields.to !== OUTSIDE
          ? (fields.to as Id<"portfolios">)
          : null,
    };
  }
  return checked;
}

/** Bitcoin or satoshis, at the end of an amount field. */
export function UnitToggle({
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
  checked: { sats, sellable, fee, amountError: error },
  onAmountChange,
  onUnitChange,
}: AmountFieldProps) {
  let hint: string | undefined;
  if (sats !== undefined) {
    hint = unit === "btc" ? formatSats(sats) : formatBtc(sats);
  }
  const selling = (kind === "sell" || kind === "send") && !error;
  // A send's fee leaves too, so all of it is what's left after the fee.
  const all = Math.max(0, sellable - (kind === "send" ? (fee ?? 0) : 0));
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
            {all > 0 && sats !== all && (
              <button
                className={HINT_ACTION}
                onClick={() => onAmountChange(amountText(all, unit))}
                type="button"
              >
                {kind === "send" ? "Send all" : "Sell all"}
              </button>
            )}
          </>
        )}
      </p>
    </div>
  );
}

interface FeeFieldProps {
  id: string;
  currency: Fiat;
  fields: Fields;
  checked: Checked;
  onChange: (patch: Pick<Fields, "fee"> | Pick<Fields, "feeSats">) => void;
}

/**
 * What the trade or send cost on top: an exchange's fee in money on a buy or
 * sell, a network fee in bitcoin on a send.
 */
function FeeField({
  id,
  currency,
  fields: { kind, unit, fee: typedFee, feeSats: typedFeeSats },
  checked: { fee, feeError: error },
  onChange,
}: FeeFieldProps) {
  const send = kind === "send";
  let hint = "Optional. Added to the cost.";
  if (kind === "sell") {
    hint = "Optional. Taken off what’s received.";
  } else if (send) {
    hint = "Optional. Leaves the portfolio on top of the amount.";
    if (fee) {
      hint = unit === "btc" ? formatSats(fee) : formatBtc(fee);
    }
  }
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{send ? "Network fee" : "Fee"}</Label>
      <div className="relative">
        {!send && (
          <span
            aria-hidden
            className="text-muted-foreground pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm"
          >
            {fiatSymbol(currency)}
          </span>
        )}
        <Input
          aria-describedby={`${id}-hint`}
          aria-invalid={error ? true : undefined}
          autoComplete="off"
          className={cn("tabular-nums", send ? "pr-14" : "pl-7")}
          id={id}
          inputMode={send && unit === "sats" ? "numeric" : "decimal"}
          onChange={(event) =>
            onChange(
              send
                ? { feeSats: event.target.value }
                : { fee: event.target.value }
            )
          }
          placeholder={send && unit === "sats" ? "0" : "0.00"}
          value={send ? typedFeeSats : typedFee}
        />
        {send && (
          <span
            aria-hidden
            className="text-muted-foreground pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-medium"
          >
            {unit === "btc" ? "BTC" : "sats"}
          </span>
        )}
      </div>
      <p
        className={cn(
          HINT,
          error ? "text-destructive" : "text-muted-foreground"
        )}
        id={`${id}-hint`}
      >
        {error ?? hint}
      </p>
    </div>
  );
}

/** A portfolio to send to, named with its project when that's another one. */
interface Destination {
  value: string;
  title: string;
  project?: string;
}

/**
 * The portfolios a send from `portfolio` can go to: any other one in a
 * project the person can edit. `current` stays listed even once it isn't.
 */
function useDestinations(portfolio: Portfolio, current: string): Destination[] {
  const portfolios = useQuery(api.portfolios.list);
  const projects = useQuery(api.projects.list);
  const editable = new Map(
    (projects ?? [])
      .filter((project) => canEdit(project))
      .map((project) => [project._id as string, project.title])
  );
  const destinations: Destination[] = [
    { title: "Outside, like a wallet or exchange", value: OUTSIDE },
  ];
  for (const item of portfolios ?? []) {
    const project = editable.get(item.projectId);
    if (item._id !== portfolio._id && project !== undefined) {
      destinations.push({
        project: item.projectId === portfolio.projectId ? undefined : project,
        title: item.title,
        value: item._id,
      });
    }
  }
  if (!destinations.some((item) => item.value === current)) {
    // One the person can see but no longer edit keeps its name.
    const title = portfolios?.find((item) => item._id === current)?.title;
    destinations.push({ title: title ?? "Another portfolio", value: current });
  }
  return destinations;
}

function DestinationLabel({ destination }: { destination: Destination }) {
  return (
    <>
      <span className="truncate">{destination.title}</span>
      {destination.project && (
        <span className="text-muted-foreground truncate">
          {destination.project}
        </span>
      )}
    </>
  );
}

/** Where a send goes: outside, or another portfolio, which then shows it as a receive. */
function DestinationField({
  id,
  portfolio,
  value,
  onChange,
}: {
  id: string;
  portfolio: Portfolio;
  value: string;
  onChange: (to: string) => void;
}) {
  const destinations = useDestinations(portfolio, value);
  const items = destinations.map((destination) => ({
    label: <DestinationLabel destination={destination} />,
    value: destination.value,
  }));
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>To</Label>
      <Select
        items={items}
        onValueChange={(next: string | null) => {
          if (next) {
            onChange(next);
          }
        }}
        value={value}
      >
        <SelectTrigger
          aria-describedby={`${id}-hint`}
          className="w-full"
          id={id}
        >
          <SelectValue className="items-center gap-2" />
        </SelectTrigger>
        <SelectContent>
          {destinations.map((destination) => (
            <SelectItem key={destination.value} value={destination.value}>
              <DestinationLabel destination={destination} />
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className={cn(HINT, "text-muted-foreground")} id={`${id}-hint`}>
        {value === OUTSIDE
          ? "Leaves the bitcoin tracked here."
          : "Shows up there as a receive."}
      </p>
    </div>
  );
}

/** Where a receive from another portfolio came from, which changes along with it. */
function TransferSource({ transaction }: { transaction: Transaction }) {
  const portfolios = useQuery(api.portfolios.list);
  const from = portfolios?.find(
    (item) => item._id === transaction.transfer?.portfolioId
  );
  return (
    <p className="bg-muted/60 text-muted-foreground rounded-xl px-4 py-3 text-sm">
      Sent from{" "}
      <span className="text-foreground font-medium">
        {from?.title ?? "another portfolio"}
      </span>
      . Changes here change the send too.
    </p>
  );
}

/** What one bitcoin cost at the moment picked, as far as it's known. */
interface Reference {
  /** Whether that's about now, so the live price stands for it. */
  live: boolean;
  /** Undefined while it loads; null when there's no price that far back. */
  price: number | null | undefined;
}

interface PriceFieldProps {
  id: string;
  currency: Fiat;
  reference: Reference;
  fields: Fields;
  checked: Checked;
  /** Undefined goes back to the price at the moment picked. */
  onChange: (typedPrice?: string) => void;
}

/** What one bitcoin cost, following the price at the moment picked until something's typed. */
function PriceField({
  id,
  currency,
  reference: { live, price },
  fields: { typedPrice },
  checked: { shownPrice, priceError: error },
  onChange,
}: PriceFieldProps) {
  let hint = live ? `In ${currency}.` : "Finding the price then…";
  if (typeof price === "number") {
    hint = `${live ? "Current price" : "Price then"}: ${formatFiat(price, currency)}`;
  } else if (price === null) {
    hint = "No price this far back. Enter what it cost.";
  }
  let placeholder: string | undefined;
  if (price === undefined) {
    placeholder = "Loading price…";
  } else if (price === null) {
    placeholder = "0.00";
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
          placeholder={placeholder}
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
        {typeof price === "number" && typedPrice !== undefined && (
          <button
            className={HINT_ACTION}
            onClick={() => onChange()}
            type="button"
          >
            {live ? "Use current price" : "Use price then"}
          </button>
        )}
      </p>
    </div>
  );
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

const SEGMENT =
  "focus-visible:bg-accent w-7 rounded-md bg-transparent py-0.5 text-center tabular-nums outline-none selection:bg-transparent";

/**
 * Hours and minutes in two short boxes. Typing starts a box afresh and moves
 * on once no other digit could follow; the arrow keys step through.
 */
function TimeInput({
  value,
  onChange,
  onDone,
}: {
  /** As `HH:mm`. */
  value: string;
  onChange: (time: string) => void;
  /** Enter was pressed: the time is as wanted. */
  onDone: () => void;
}) {
  const { hours = "00", minutes = "00" } = TIME.exec(value)?.groups ?? {};
  const minutesRef = useRef<HTMLInputElement>(null);
  // Digits typed into the box since it took focus: none, one, or both.
  const typed = useRef(0);

  const segment = (part: "hours" | "minutes") => {
    const max = part === "hours" ? 23 : 59;
    const current = Number(part === "hours" ? hours : minutes);
    const update = (next: number) =>
      onChange(
        part === "hours" ? `${pad(next)}:${minutes}` : `${hours}:${pad(next)}`
      );
    return {
      "aria-label": part === "hours" ? "Hours" : "Minutes",
      autoComplete: "off",
      className: SEGMENT,
      inputMode: "numeric" as const,
      onChange: (event: ChangeEvent<HTMLInputElement>) => {
        const digit = event.target.value.replaceAll(/\D/gu, "").at(-1);
        if (digit === undefined) {
          return;
        }
        // A second digit goes after the first while that's still a time.
        const joined = current * 10 + Number(digit);
        const second = typed.current === 1 && joined <= max;
        const next = second ? joined : Number(digit);
        typed.current = second ? 2 : 1;
        update(next);
        if (part === "hours" && (second || next > 2)) {
          minutesRef.current?.focus();
        }
      },
      onFocus: (event: FocusEvent<HTMLInputElement>) => {
        typed.current = 0;
        event.currentTarget.select();
      },
      onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === "ArrowUp" || event.key === "ArrowDown") {
          event.preventDefault();
          const step = event.key === "ArrowUp" ? 1 : max;
          typed.current = 0;
          update((current + step) % (max + 1));
        } else if (event.key === "Backspace" || event.key === "Delete") {
          event.preventDefault();
          typed.current = 0;
          update(0);
        } else if (event.key === "Enter") {
          event.preventDefault();
          onDone();
        }
      },
    };
  };

  return (
    <fieldset
      aria-label="Time"
      className={cn(
        FIELD,
        "focus-within:border-ring focus-within:ring-ring/30 flex h-8 w-auto items-center px-1 focus-within:ring-3"
      )}
    >
      <input {...segment("hours")} value={hours} />
      <span aria-hidden className="text-muted-foreground">
        :
      </span>
      <input {...segment("minutes")} ref={minutesRef} value={minutes} />
    </fieldset>
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

/** The day from a calendar and the time on it, in one field. */
function DateField({ id, day, time, onChange, future }: DateFieldProps) {
  const [open, setOpen] = useState(false);
  // Moved on whenever the calendar opens, so a form left open keeps up.
  const [today, setToday] = useState(() => new Date(currentTime()));
  const now = () => {
    const moment = new Date(currentTime());
    onChange({ day: moment, time: format(moment, "HH:mm") });
  };
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>Date</Label>
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
          <span className="tabular-nums">
            {format(day, "MMM d, yyyy")}
            <span aria-hidden className="text-muted-foreground px-1.5">
              ·
            </span>
            {time}
          </span>
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
              }
            }}
            required
            selected={day}
            startMonth={GENESIS}
          />
          <div className="mt-1 flex items-center justify-between gap-3 border-t px-1 pt-2">
            <TimeInput
              onChange={(next) => onChange({ day, time: next })}
              onDone={() => setOpen(false)}
              value={time}
            />
            <Button onClick={now} size="sm" type="button" variant="ghost">
              Now
            </Button>
          </div>
        </PopoverContent>
      </Popover>
      {future && (
        <p className="text-destructive text-xs">That time hasn’t come yet.</p>
      )}
    </div>
  );
}

const TOTAL_LABELS: Record<TransactionKind, string> = {
  buy: "Total cost",
  receive: "Value received",
  sell: "Total received",
  send: "Value sent",
};

function TotalRow({
  kind,
  checked: { sats, price, fee },
  currency,
}: {
  kind: TransactionKind;
  checked: Checked;
  currency: Fiat;
}) {
  let total = "—";
  if (sats !== undefined && price !== undefined) {
    const tradeFee = isTrade(kind) ? fee : undefined;
    total = formatFiat(
      transactionTotal({ fee: tradeFee, kind, price, sats }),
      currency
    );
  }
  return (
    <div className="bg-muted/60 flex items-center justify-between gap-4 rounded-xl px-4 py-3 text-sm">
      <span className="text-muted-foreground">{TOTAL_LABELS[kind]}</span>
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
            {transaction.transfer
              ? "It comes off both portfolios it moved between, for everyone."
              : "It comes off the portfolio for everyone."}
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

/**
 * What one bitcoin cost at `at`: the live price near now, or else what
 * Kraken's trades say it was then.
 */
function useReference(currency: Fiat, at: number): Reference {
  const prices = useBtcPrices();
  const now = Math.max(useNow(), prices.data?.at ?? 0);
  const live = at > now - RECENT;
  const then = useBtcPriceAt(currency, live ? undefined : at);
  return {
    live,
    price: live ? prices.data?.[currency] : then.data,
  };
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
  const [fields, setFields] = useState(() => initialFields(transaction));
  const reference = useReference(currency, combine(fields.day, fields.time));
  const [future, setFuture] = useState(false);
  const [saving, setSaving] = useState(false);
  const others = transactions.filter((item) => item._id !== transaction?._id);
  const checked = check(fields, reference.price ?? undefined, others);

  const change = (patch: Partial<Fields>) =>
    setFields((current) => ({ ...current, ...patch }));

  // A receive from another portfolio follows its send, so stays a receive.
  const fromTransfer = transaction?.kind === "receive" && transaction.transfer;

  const changeUnit = (unit: Unit) => {
    const convert = (text: string) => {
      const sats = parseAmount(text, fields.unit);
      return sats === undefined ? text : amountText(sats, unit);
    };
    change({
      amount: convert(fields.amount),
      feeSats: convert(fields.feeSats),
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
          {TRANSACTION_KINDS.map((kind) => (
            <TabsTrigger
              className="flex-1 justify-center px-2"
              disabled={Boolean(fromTransfer) && kind !== "receive"}
              key={kind}
              value={kind}
            >
              {KIND_NAMES[kind]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {fromTransfer && <TransferSource transaction={transaction} />}
      {fields.kind === "send" && (
        <DestinationField
          id={`${id}-to`}
          onChange={(to) => change({ to })}
          portfolio={portfolio}
          value={fields.to}
        />
      )}
      <AmountField
        autoFocus={!transaction}
        checked={checked}
        fields={fields}
        id={`${id}-amount`}
        onAmountChange={(amount) => change({ amount })}
        onUnitChange={changeUnit}
      />
      {fields.kind !== "receive" && (
        <FeeField
          checked={checked}
          currency={currency}
          fields={fields}
          id={`${id}-fee`}
          onChange={change}
        />
      )}
      <PriceField
        checked={checked}
        currency={currency}
        fields={fields}
        id={`${id}-price`}
        onChange={(typedPrice) => change({ typedPrice })}
        reference={reference}
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
