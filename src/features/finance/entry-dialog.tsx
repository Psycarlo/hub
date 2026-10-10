import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { InvoiceReading } from "@convex/shared/finance";
import { cn } from "cn";
import { useQuery } from "convex/react";
import { format, parseISO } from "date-fns";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleAlertIcon,
  SparklesIcon,
} from "lucide-react";
import type { Dispatch, FormEvent, ReactNode, SetStateAction } from "react";
import { useId, useRef, useState } from "react";

import { IconButton } from "@/components/icon-button";
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
import { FluidTooltip } from "@/components/ui/fluid-tooltip";
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
import { DROP_TARGET, useFileDrop } from "@/features/card/use-file-drop";
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
  FileDropZone,
  FileStrip,
  FileViewer,
  InvoiceHint,
  ReadMark,
  formFileId,
  isReadable,
} from "@/features/finance/entry-files";
import type {
  FillableField,
  InvoiceSuggestion,
} from "@/features/finance/invoice-fill";
import {
  FAILURES,
  anyMoney,
  dayText,
  suggest,
} from "@/features/finance/invoice-fill";
import {
  DestinationField,
  ReceivedField,
  changesCurrency,
  useTransferTarget,
} from "@/features/finance/transfer-fields";
import type { ReadState } from "@/features/finance/use-entry-files";
import { useEntryFiles } from "@/features/finance/use-entry-files";
import {
  UNIT_KEY,
  UnitToggle,
  storedUnit,
} from "@/features/portfolios/transaction-dialog";
import { useAiReady } from "@/hooks/use-ai-ready";
import { useToday } from "@/hooks/use-today";
import { useBtcPrices } from "@/lib/bitcoin-price";
import type { Account, Category, Entry, EntryType } from "@/lib/finance";
import {
  MAX_ENTRY_NAME,
  entryKind,
  formatMoney,
  moneyText,
  parseMoney,
  statusLabel,
} from "@/lib/finance";
import type {
  BuyChange,
  EntryDraft,
  TransferDraft,
} from "@/lib/finance-actions";
import { addEntry, deleteEntry, updateEntry } from "@/lib/finance-actions";
import { dropJob, jobById } from "@/lib/invoice-jobs";
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

const PLACEHOLDERS: Record<EntryType, string> = {
  credit: "Salary",
  debit: "Groceries",
  transfer: "Savings",
};

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
  kind: EntryType;
  name: string;
  amount: string;
  date: string;
  category?: string;
  note: string;
  paid: boolean;
  bitcoin: BitcoinFields;
  /** The account a transfer goes to. */
  to?: Id<"financeAccounts">;
  /** What arrives there in another currency, once typed; what arrived before shows till then. */
  typedReceived?: string;
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
  const transfers = entry.kind === "debit" && entry.transfer !== undefined;
  return {
    amount: moneyText(entry.cents),
    bitcoin,
    category: entry.category,
    date: entry.date,
    kind: transfers ? "transfer" : entry.kind,
    name: entry.name,
    note: entry.note,
    paid: entry.paid,
    to: transfers ? entry.transfer?.accountId : undefined,
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

function deleteDescription(entry: Entry): string {
  if (entry.transfer) {
    return "It comes off both accounts it moved between, for everyone.";
  }
  return entry.buyId
    ? "It comes off the account for everyone. The bitcoin buy it paid for stays in its portfolio."
    : "It comes off the account for everyone.";
}

/** Where a credit from another account came from, which changes along with it. */
function TransferSource({
  account,
  entry,
}: {
  account: Account;
  entry: Entry;
}) {
  const accounts = useQuery(api.finance.accounts);
  const from = accounts?.find((item) => item._id === entry.transfer?.accountId);
  const follows =
    from && from.currency !== account.currency
      ? "The day and paid"
      : "The day, amount and paid";
  return (
    <p className="bg-muted/60 text-muted-foreground rounded-xl px-4 py-3 text-sm">
      Transferred from{" "}
      <span className="text-foreground font-medium">
        {from?.title ?? "another account"}
      </span>
      . {follows} change there too.
    </p>
  );
}

/**
 * Where the form's transfer goes, and what arrives there: typed, or what
 * arrived before while it still goes to the same account.
 */
function useTransfer(
  account: Account,
  entry: Entry | undefined,
  fields: Fields
) {
  const counterpart = useQuery(
    api.finance.counterpart,
    entry?.transfer ? { entryId: entry._id } : "skip"
  );
  const receivedText =
    fields.typedReceived ??
    (counterpart && counterpart.accountId === fields.to
      ? moneyText(counterpart.cents)
      : "");
  const target = useTransferTarget(account, fields.to, receivedText);
  return {
    ...target,
    receivedText,
    // A credit from another account follows its debit, so stays a credit.
    source: entry?.kind === "credit" && entry.transfer ? entry : undefined,
    valid: fields.kind !== "transfer" || target.valid,
  };
}

/** How the entry's transfer changes on saving: to an account, let go, or not at all. */
function transferChange(
  fields: Fields,
  entry: Entry | undefined,
  received: number | undefined
): TransferDraft | undefined {
  if (fields.kind === "transfer" && fields.to) {
    return { receivedCents: received, toAccountId: fields.to };
  }
  return entry?.kind === "debit" && entry.transfer
    ? { toAccountId: null }
    : undefined;
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
          <AlertDialogTitle>
            Delete this {entry.transfer ? "transfer" : entry.kind}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {deleteDescription(entry)}
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

/** Reviewing invoices dropped together: which of how many, and how to move along. */
export interface Review {
  position: number;
  total: number;
  /** Invoices still to review besides this one. */
  remaining: number;
  onSkip: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
  /** Saved: on to the next one, or done. */
  onAdded: () => void;
}

/** Fills in what the invoice says, where `open` lets it; says which fields it filled. */
function fillFields(
  fields: Fields,
  suggestion: InvoiceSuggestion,
  open: (field: FillableField) => boolean
): { fields: Fields; filled: FillableField[] } {
  const next = { ...fields };
  const filled: FillableField[] = [];
  const take = <K extends FillableField>(field: K, value?: Fields[K]) => {
    if (value !== undefined && open(field)) {
      next[field] = value;
      filled.push(field);
    }
  };
  take("name", suggestion.name);
  take("amount", suggestion.amount);
  take("date", suggestion.date);
  take("paid", suggestion.paid);
  take("category", suggestion.category);
  if (!fields.note.trim()) {
    take("note", suggestion.note);
  }
  return { fields: next, filled };
}

const FILLABLE: ReadonlySet<string> = new Set<FillableField>([
  "name",
  "amount",
  "date",
  "paid",
  "category",
  "note",
]);

/** The form and the invoice read for it: what it filled in, and what it says. */
interface Fill {
  fields: Fields;
  setFields: Dispatch<SetStateAction<Fields>>;
  /** Fields the invoice filled in, marked by their labels. */
  filled: ReadonlySet<string>;
  /** Fields typed in, which reading leaves alone. */
  touched: ReadonlySet<string>;
  /** What the invoice says, once it's read. */
  suggestion?: InvoiceSuggestion;
  /** A new entry's invoice, read: what it didn't say is pointed out. */
  settled: boolean;
  /** Whether a field waits on the invoice, which may fill it in. */
  pending: (field: FillableField) => boolean;
  /** Whether what the invoice says for a field can be offered: it didn't fill it in. */
  offers: (field: FillableField) => boolean;
  /** Takes what the invoice says for a field. */
  use: (patch: Partial<Fields>) => void;
  /** Changes fields as typed, which reading leaves alone from then on. */
  change: (patch: Partial<Fields>) => void;
}

/**
 * Fills the form in from the invoice once it's read: on a new entry, every
 * field not typed in yet; a kept entry only hears what it says, to use.
 */
function useInvoiceFill({
  account,
  entry,
  today,
  read,
  initial,
}: {
  account: Account;
  entry?: Entry;
  today: string;
  read?: ReadState;
  /** The fields as the form starts. */
  initial: () => Fields;
}): Fill {
  const [fields, setFields] = useState(initial);
  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set());
  const [filled, setFilled] = useState<ReadonlySet<string>>(new Set());
  const [applied, setApplied] = useState<InvoiceReading>();
  if (read?.reading && read.reading !== applied) {
    setApplied(read.reading);
    const result = fillFields(
      fields,
      suggest(read.reading, account, today),
      (field) => !entry && !touched.has(field)
    );
    setFields(result.fields);
    setFilled(new Set([...filled, ...result.filled]));
  }
  return {
    change: (patch) => {
      setFields((current) => ({ ...current, ...patch }));
      const keys = new Set(
        Object.keys(patch).filter((key) => FILLABLE.has(key))
      );
      if (keys.size > 0) {
        setTouched((current) => new Set([...current, ...keys]));
        setFilled(
          (current) => new Set([...current].filter((key) => !keys.has(key)))
        );
      }
    },
    fields,
    filled,
    offers: (field) => applied !== undefined && !filled.has(field),
    pending: (field) => read?.busy === true && !entry && !touched.has(field),
    setFields,
    settled:
      !entry && read !== undefined && !read.busy && read.failure === undefined,
    suggestion: applied && suggest(applied, account, today),
    touched,
    use: (patch) => {
      setFields((current) => ({ ...current, ...patch }));
      setFilled((current) => new Set([...current, ...Object.keys(patch)]));
    },
  };
}

/** What reading the invoice came to, above the fields: going, done, or why not. */
function ReadingBanner({
  read,
  editing,
  onRetry,
}: {
  read?: ReadState;
  editing: boolean;
  onRetry: () => void;
}) {
  if (!read || read.failure === "off") {
    return null;
  }
  let tone = "bg-primary/6";
  let icon = <SparklesIcon className="text-primary size-4" />;
  let text: ReactNode = editing
    ? "Read the invoice. What it says shows under each field."
    : "Filled in from the invoice. Check it before saving.";
  if (read.busy) {
    tone = "bg-muted/80";
    icon = <SparklesIcon className="text-primary size-4 animate-pulse" />;
    text = (
      <>
        Reading <span className="font-medium">{read.name}</span>…
      </>
    );
  } else if (read.failure) {
    tone = "bg-amber-500/10 text-amber-800 dark:text-amber-300";
    icon = <CircleAlertIcon className="size-4" />;
    text = FAILURES[read.failure];
  }
  return (
    <p
      aria-live="polite"
      className={cn(
        "flex min-h-10 items-center gap-2.5 rounded-xl px-3 py-2 text-sm",
        tone
      )}
    >
      <span aria-hidden className="shrink-0">
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate">{text}</span>
      {read.failure === "failed" && (
        <button
          className="shrink-0 font-medium hover:underline"
          onClick={onRetry}
          type="button"
        >
          Try again
        </button>
      )}
    </p>
  );
}

/** Which invoice of the batch this is, with a way to the ones around it. */
function ReviewNav({ review }: { review: Review }) {
  const { onNext, onPrevious, position, total } = review;
  return (
    <FluidTooltip.Group>
      <div className="ml-auto flex shrink-0 items-center gap-1">
        <span className="text-muted-foreground mr-1 text-sm tabular-nums">
          {position} of {total}
        </span>
        <IconButton
          disabled={!onPrevious}
          label="Previous invoice"
          onClick={onPrevious}
          type="button"
        >
          <ChevronLeftIcon />
        </IconButton>
        <IconButton
          disabled={!onNext}
          label="Next invoice"
          onClick={onNext}
          type="button"
        >
          <ChevronRightIcon />
        </IconButton>
      </div>
    </FluidTooltip.Group>
  );
}

/** A field's label, marked when the invoice filled it in. */
function FieldLabel({
  children,
  filled,
}: {
  children: ReactNode;
  filled: boolean;
}) {
  return (
    <>
      {children}
      {filled && <ReadMark />}
    </>
  );
}

interface FieldProps {
  id: string;
  fields: Fields;
  fill: Fill;
}

function NameField({
  id,
  fields,
  fill,
  autoFocus,
}: FieldProps & { autoFocus: boolean }) {
  const said = fill.suggestion?.name;
  const offered =
    said && fill.offers("name") && said !== fields.name.trim()
      ? said
      : undefined;
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={`${id}-name`}>
        <FieldLabel filled={fill.filled.has("name")}>Name</FieldLabel>
      </Label>
      <div className={cn(fill.pending("name") && "invoice-pending")}>
        <Input
          autoComplete="off"
          autoFocus={autoFocus}
          id={`${id}-name`}
          maxLength={MAX_ENTRY_NAME}
          onChange={(event) => fill.change({ name: event.target.value })}
          placeholder={PLACEHOLDERS[fields.kind]}
          value={fields.name}
        />
      </div>
      {offered && (
        <InvoiceHint action="Use" onAction={() => fill.use({ name: offered })}>
          The invoice says “{offered}”
        </InvoiceHint>
      )}
      {fill.settled && !said && !fields.name.trim() && (
        <InvoiceHint tone="warning">Couldn’t read who it’s from.</InvoiceHint>
      )}
    </div>
  );
}

function AmountField({
  id,
  fields,
  fill,
  account,
  cents,
}: FieldProps & { account: Account; cents?: number }) {
  const said = fill.suggestion?.amount;
  const offered =
    said && fill.offers("amount") && parseMoney(said) !== cents
      ? parseMoney(said)
      : undefined;
  const foreign = fill.suggestion?.foreign;
  const error =
    fields.amount.trim() && cents === undefined
      ? "Enter an amount, like 42.50."
      : undefined;
  return (
    <div className="flex flex-col gap-2">
      <MoneyField
        currency={account.currency}
        error={error}
        id={`${id}-amount`}
        label={
          <FieldLabel filled={fill.filled.has("amount")}>Amount</FieldLabel>
        }
        onChange={(amount) => fill.change({ amount })}
        pending={fill.pending("amount")}
        value={fields.amount}
      />
      {offered !== undefined && (
        <InvoiceHint action="Use" onAction={() => fill.use({ amount: said })}>
          The invoice says {formatMoney(offered, account.currency)}
        </InvoiceHint>
      )}
      {foreign && (
        <InvoiceHint tone="warning">
          It’s {anyMoney(foreign.cents, foreign.currency)}. Enter what{" "}
          {fields.kind === "credit" ? "came in" : "went out"} in{" "}
          {account.currency}.
        </InvoiceHint>
      )}
      {fill.settled && !said && !foreign && cents === undefined && (
        <InvoiceHint tone="warning">Couldn’t read the total.</InvoiceHint>
      )}
    </div>
  );
}

function DateField({ id, fields, fill }: FieldProps) {
  const said = fill.suggestion?.date;
  const offered =
    said && fill.offers("date") && said !== fields.date ? said : undefined;
  return (
    <div className="flex flex-col gap-2">
      <DayField
        id={`${id}-date`}
        label={<FieldLabel filled={fill.filled.has("date")}>Date</FieldLabel>}
        onChange={(date) => fill.change({ date })}
        pending={fill.pending("date")}
        value={fields.date}
      />
      {offered && (
        <InvoiceHint action="Use" onAction={() => fill.use({ date: offered })}>
          The invoice says {dayText(offered)}
        </InvoiceHint>
      )}
      {fill.settled && !said && !fill.touched.has("date") && (
        <InvoiceHint tone="warning">Couldn’t read its date.</InvoiceHint>
      )}
    </div>
  );
}

const ASIDE =
  "bg-muted/70 animate-in fade-in relative h-80 shrink-0 duration-300 md:h-auto";

/** The entry's files beside the form: the one picked shown large, and the rest in a strip. */
function FilesPane({
  files,
  reads,
  over,
}: {
  files: ReturnType<typeof useEntryFiles>;
  reads: boolean;
  /** Files are dragged over the dialog. */
  over: boolean;
}) {
  const { add, items, read, readItem, remove, retry, select, shown } = files;
  if (!shown) {
    // The entry's own files, still loading: the pane holds their place.
    return (
      <aside className={ASIDE} data-slot="entry-viewer">
        <div className="grid h-full place-items-center">
          <Spinner className="text-muted-foreground" />
        </div>
      </aside>
    );
  }
  const shownId = formFileId(shown);
  const job = shown.kind === "new" ? shown.job : undefined;
  const settled = read !== undefined && !read.busy && !read.failure;
  const up = job?.status !== "uploading" && job?.status !== "failed";
  return (
    <aside className={ASIDE} data-slot="entry-viewer">
      <div className="absolute inset-0 flex flex-col">
        <FileViewer
          item={shown}
          onRead={() => readItem(shown)}
          // A batch's invoice stays: it's skipped from the review instead.
          onRemove={job?.batch ? undefined : () => remove(shownId)}
          readable={reads && isReadable(shown) && read?.id !== shownId && up}
          reading={read?.busy === true && read.id === shownId}
        />
        <FileStrip
          items={items}
          onAdd={add}
          onRemove={remove}
          onRetry={retry}
          onSelect={select}
          readId={settled ? read.id : undefined}
          selected={shownId}
        />
      </div>
      {over && (
        <div
          aria-hidden
          className={cn(DROP_TARGET, "absolute inset-2 rounded-xl")}
        />
      )}
    </aside>
  );
}

/** Deleting, skipping, or leaving it, and saving it: under the form. */
function EntryFooter({
  entry,
  review,
  sticky,
  action,
  disabled,
  busy,
  onDeleted,
}: {
  entry?: Entry;
  review?: Review;
  /** Pinned under fields that scroll beside the files. */
  sticky: boolean;
  action: string;
  disabled: boolean;
  busy: boolean;
  onDeleted: () => void;
}) {
  const onSkip = review?.onSkip;
  return (
    <DialogFooter
      className={cn(
        sticky
          ? "bg-popover sticky bottom-0 mt-auto border-t px-5 py-4"
          : "mt-6"
      )}
    >
      {entry && <DeleteEntry entry={entry} onDeleted={onDeleted} />}
      {onSkip && (
        <Button
          className="sm:mr-auto"
          onClick={onSkip}
          type="button"
          variant="ghost"
        >
          Skip
        </Button>
      )}
      <DialogClose render={<Button type="button" variant="ghost" />}>
        {review ? "Close" : "Cancel"}
      </DialogClose>
      <Button disabled={disabled} type="submit">
        {busy && <Spinner />}
        {action}
      </Button>
    </DialogFooter>
  );
}

/** What the form's title and button say: adding, changing, or reviewing invoices. */
function wording(
  entry: Entry | undefined,
  review: Review | undefined,
  kind: EntryType
): { title: string; action: string } {
  if (review) {
    return {
      action: review.remaining > 0 ? "Add & next" : `Add ${kind}`,
      title: "Review invoices",
    };
  }
  return entry
    ? { action: "Save", title: "Edit transaction" }
    : { action: `Add ${kind}`, title: "Add transaction" };
}

/** The save button: what it says, and whether it waits on saving or on files still going up. */
function saveButton(
  files: { uploading: boolean; failed: boolean },
  { action, saving, valid }: { action: string; saving: boolean; valid: boolean }
): { action: string; busy: boolean; disabled: boolean } {
  return {
    action: files.uploading ? "Uploading…" : action,
    busy: saving || files.uploading,
    disabled: !valid || saving || files.uploading || files.failed,
  };
}

/** How the dialog lays out: the form alone, or the files beside it. */
const LAYOUTS = {
  alone: { body: "", form: "", root: "" },
  beside: {
    body: "p-5",
    form: "min-h-0 md:overflow-y-auto",
    root: "min-h-0 flex-1 md:grid md:grid-cols-[minmax(0,1fr)_24rem] md:grid-rows-[minmax(0,1fr)]",
  },
};

/** The title, and in a review which invoice of how many it is. */
function FormHeader({ title, review }: { title: string; review?: Review }) {
  return (
    <DialogHeader className={cn(review && "flex-row items-center gap-3 pr-0")}>
      <DialogTitle>{title}</DialogTitle>
      {review && <ReviewNav review={review} />}
    </DialogHeader>
  );
}

/** Says a file didn't upload, which keeps the entry from saving till it's tried again or taken out. */
function UploadProblem({ failed }: { failed: boolean }) {
  if (!failed) {
    return null;
  }
  return (
    <p className="text-destructive text-xs">
      A file didn’t upload. Try it again, or take it out.
    </p>
  );
}

/** What the paid switch says under it: what counts, or what the invoice said. */
function paidHint(fields: Fields, fill: Fill): string {
  const kind = entryKind(fields.kind);
  if (fill.filled.has("paid") && fields.paid) {
    return `The invoice says it’s ${statusLabel(kind, true).toLowerCase()}.`;
  }
  if (fill.filled.has("paid")) {
    return kind === "debit"
      ? "The invoice says it’s still to be paid."
      : "The invoice says it’s still to come in.";
  }
  return `Only what’s ${statusLabel(kind, true).toLowerCase()} counts toward the month.`;
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
  /** Whether invoices are read to fill the form in. */
  reads: boolean;
  /** Files already on their way to it, as jobs; the first is read as its invoice. */
  jobs: string[];
  /** Hears which jobs are the form's, to let go of them if it's left unsaved. */
  onJobsChange: (ids: string[]) => void;
  review?: Review;
  onDone: () => void;
}

function EntryForm({
  account,
  categories,
  portfolios,
  entry,
  defaultDate,
  reads,
  jobs,
  onJobsChange,
  review,
  onDone,
}: EntryFormProps) {
  const id = useId();
  const today = useToday();
  const [saving, setSaving] = useState(false);
  const files = useEntryFiles({
    account,
    entry,
    initialJobs: jobs,
    onJobsChange,
    reads,
  });
  const fill = useInvoiceFill({
    account,
    entry,
    initial: () => initialFields(entry, defaultDate, today, portfolios),
    read: files.read,
    today,
  });
  const { change, fields, setFields } = fill;
  const { add: addFiles } = files;
  const drop = useFileDrop(addFiles);
  const cents = parseMoney(fields.amount);
  const buy = buyChange(fields, entry, today);
  const transferring = fields.kind === "transfer";
  const transfer = useTransfer(account, entry, fields);
  const valid =
    fields.name.trim() !== "" &&
    cents !== undefined &&
    buy !== "invalid" &&
    transfer.valid;
  // Only a debit buys bitcoin; one already linked keeps the part so it can let go.
  const showBitcoin =
    fields.kind === "debit" && (portfolios.length > 0 || entry?.buyId);
  const twoPane = files.items.length > 0 || files.loading;
  const layout = twoPane ? LAYOUTS.beside : LAYOUTS.alone;
  const { title, action } = wording(entry, review, fields.kind);
  const save = saveButton(files, { action, saving, valid });

  const changeBitcoin = (patch: Partial<BitcoinFields>) =>
    setFields((current) => ({
      ...current,
      bitcoin: { ...current.bitcoin, ...patch },
    }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!valid || files.uploading || files.failed) {
      return;
    }
    const draft: EntryDraft = {
      category: fields.category,
      cents,
      date: fields.date,
      kind: entryKind(fields.kind),
      name: fields.name.trim(),
      note: fields.note.trim(),
      paid: fields.paid,
    };
    const moved = transferChange(fields, entry, transfer.received);
    setSaving(true);
    const saved = entry
      ? await updateEntry(entry, draft, buy, moved, files.changes)
      : await addEntry(account, draft, buy, moved, files.changes.add);
    setSaving(false);
    if (saved === undefined) {
      return;
    }
    files.finish();
    (review?.onAdded ?? onDone)();
  };

  return (
    <div className={cn("flex flex-col", layout.root)} {...drop.handlers}>
      {twoPane && <FilesPane files={files} over={drop.over} reads={reads} />}

      <form className={cn("flex flex-col", layout.form)} onSubmit={submit}>
        <div
          className={cn(
            "animate-in fade-in flex flex-col gap-5 duration-200",
            layout.body
          )}
        >
          <FormHeader review={review} title={title} />

          <ReadingBanner
            editing={entry !== undefined}
            onRetry={() => files.rereadInvoice()}
            read={files.read}
          />

          <KindTabs
            locked={transfer.source !== undefined}
            onChange={(kind) => change({ kind })}
            value={fields.kind}
          />

          {transfer.source && (
            <TransferSource account={account} entry={transfer.source} />
          )}
          {transferring && (
            <DestinationField
              account={account}
              destinations={transfer.destinations}
              id={`${id}-to`}
              onChange={(to) => change({ to })}
              value={fields.to}
            />
          )}

          <NameField
            autoFocus={!(entry || twoPane)}
            fields={fields}
            fill={fill}
            id={id}
          />

          <div className="grid gap-5 sm:grid-cols-2 sm:gap-3">
            <AmountField
              account={account}
              cents={cents}
              fields={fields}
              fill={fill}
              id={id}
            />
            <DateField fields={fields} fill={fill} id={id} />
          </div>

          {transferring && changesCurrency(account, transfer.destination) && (
            <ReceivedField
              account={account}
              cents={cents}
              destination={transfer.destination}
              id={`${id}-received`}
              onChange={(typedReceived) => change({ typedReceived })}
              received={transfer.received}
              value={transfer.receivedText}
            />
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor={`${id}-category`}>
              <FieldLabel filled={fill.filled.has("category")}>
                Category
              </FieldLabel>
            </Label>
            <div className={cn(fill.pending("category") && "invoice-pending")}>
              <CategoryPicker
                categories={categories}
                id={`${id}-category`}
                onChange={(category) => change({ category })}
                projectId={account.projectId}
                value={fields.category}
              />
            </div>
          </div>

          <SwitchRow
            checked={fields.paid}
            hint={paidHint(fields, fill)}
            id={`${id}-paid`}
            label={statusLabel(entryKind(fields.kind), true)}
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
            <Label htmlFor={`${id}-note`}>
              <FieldLabel filled={fill.filled.has("note")}>Note</FieldLabel>
            </Label>
            <Textarea
              id={`${id}-note`}
              onChange={(event) => change({ note: event.target.value })}
              placeholder="Optional"
              value={fields.note}
            />
          </div>

          {!twoPane && (
            <FileDropZone
              onFiles={addFiles}
              over={drop.over}
              reads={reads && !entry}
            />
          )}

          <UploadProblem failed={files.failed} />
        </div>

        <EntryFooter
          action={save.action}
          busy={save.busy}
          disabled={save.disabled}
          entry={entry}
          onDeleted={onDone}
          review={review}
          sticky={twoPane}
        />
      </form>
    </div>
  );
}

type EntryDialogProps = Omit<
  EntryFormProps,
  "onDone" | "onJobsChange" | "jobs" | "reads"
> & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Files on their way to a new entry, as jobs; the first is read as its invoice. */
  jobs?: string[];
  /** Starts the form over, when the dialog moves on to another entry or invoice. */
  formKey?: string;
};

const NO_JOBS: string[] = [];

/**
 * Adds or changes an entry, with the files it keeps. With files, it widens
 * to show them beside the form, and an invoice dropped in fills the form in.
 */
export function EntryDialog({
  open,
  onOpenChange,
  jobs = NO_JOBS,
  formKey,
  ...props
}: EntryDialogProps) {
  const reads = useAiReady();
  // The form's own uploads, let go of if it's left unsaved; a batch's stay in its tray.
  const pending = useRef<string[]>([]);
  const leave = () => {
    for (const jobId of pending.current) {
      if (!jobById(jobId)?.batch) {
        dropJob(jobId);
      }
    }
    pending.current = [];
  };
  return (
    <Dialog
      onOpenChange={(next) => {
        if (!next) {
          leave();
        }
        onOpenChange(next);
      }}
      open={open}
    >
      <DialogContent
        className="transition-[opacity,scale,max-width] has-data-[slot=entry-viewer]:max-w-4xl has-data-[slot=entry-viewer]:gap-0 has-data-[slot=entry-viewer]:p-0 md:has-data-[slot=entry-viewer]:overflow-hidden"
        showCloseButton={false}
      >
        <EntryForm
          {...props}
          jobs={jobs}
          key={formKey}
          onDone={() => onOpenChange(false)}
          onJobsChange={(ids) => {
            pending.current = ids;
          }}
          reads={reads}
        />
      </DialogContent>
    </Dialog>
  );
}
