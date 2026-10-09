import { cn } from "cn";
import { format } from "date-fns";
import {
  ArrowDownLeftIcon,
  ArrowLeftToLineIcon,
  ArrowRightFromLineIcon,
  ArrowUpRightIcon,
  CircleAlertIcon,
  FileSpreadsheetIcon,
  UploadIcon,
} from "lucide-react";
import type { ChangeEvent, DragEvent, ReactNode } from "react";
import { useEffect, useId, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { useMe } from "@/hooks/use-users";
import { findPricesAt, foundPriceAt } from "@/lib/bitcoin-price";
import { parseCsv } from "@/lib/csv";
import { FORMATS, SOURCES } from "@/lib/exchange-csv";
import type {
  Fiat,
  Portfolio,
  Transaction,
  TransactionKind,
  Unit,
} from "@/lib/portfolio";
import {
  FIATS,
  KIND_NAMES,
  MAX_IMPORT,
  TRANSACTION_KINDS,
  formatBtc,
  formatFiat,
  isIncoming,
} from "@/lib/portfolio";
import type { ImportedTransaction } from "@/lib/portfolio-actions";
import { importTransactions } from "@/lib/portfolio-actions";
import type {
  ColumnMap,
  ColumnRole,
  CustomOptions,
  Detected,
  ImportRow,
  SkippedRow,
} from "@/lib/portfolio-csv";
import {
  COLUMN_ROLES,
  alreadyThere,
  detect,
  firstShortfall,
  guessColumns,
  guessUnit,
  isSkipped,
  readCustom,
} from "@/lib/portfolio-csv";
import { plural } from "@/lib/utils";

/** The format picked when no known layout fits: columns matched by hand. */
const CUSTOM = "custom";
const NONE = "none";
/** Rows the preview lists; the rest are counted. */
const PREVIEW_ROWS = 200;

const KIND_ICONS: Record<TransactionKind, typeof ArrowDownLeftIcon> = {
  buy: ArrowDownLeftIcon,
  receive: ArrowLeftToLineIcon,
  sell: ArrowUpRightIcon,
  send: ArrowRightFromLineIcon,
};

const ROLE_NAMES: Record<ColumnRole, string> = {
  amount: "Amount",
  currency: "Currency",
  date: "Date",
  fee: "Fee",
  feeBtc: "Network fee",
  note: "Note",
  price: "Price per bitcoin",
  type: "Type",
};

/** Roles a file can't do without. */
const REQUIRED = new Set<ColumnRole>(["date", "amount"]);

interface Loaded {
  name: string;
  detected: Detected;
}

/** Where the file's rows stand against the portfolio. */
interface Review {
  /** New, with a price or waiting for one. */
  fresh: ImportRow[];
  duplicates: ImportRow[];
  skipped: SkippedRow[];
}

function review(
  results: ReturnType<typeof readCustom>,
  transactions: Transaction[]
): Review {
  const skipped = results.filter(isSkipped);
  const rows = results.filter((result) => !isSkipped(result)) as ImportRow[];
  const duplicates = alreadyThere(rows, transactions);
  return {
    duplicates: rows.filter((row) => duplicates.has(row)),
    fresh: rows
      .filter((row) => !duplicates.has(row))
      .toSorted((a, b) => a.at - b.at || a.line - b.line),
    skipped,
  };
}

/** Whether a row needs the market's price: none given, or in a currency the hub doesn't keep. */
function needsPrice(row: ImportRow): boolean {
  return row.price === undefined || row.price <= 0 || !row.currency;
}

/**
 * Looks up the market price of every row that needs one, a minute at a
 * time; starts over when the rows change.
 */
function useMarketPrices(rows: ImportRow[], fiat: Fiat) {
  // As text, so the lookups start over only when the moments really change.
  const wanted = useMemo(
    () =>
      rows
        .filter(needsPrice)
        .map((row) => row.at)
        .join(","),
    [rows]
  );
  const key = `${fiat}|${wanted}`;
  const [state, setState] = useState<{
    key: string;
    done: number;
    total: number;
    found?: Map<number, number | null>;
  }>({ done: 0, key: "", total: 0 });
  useEffect(() => {
    if (!wanted) {
      return;
    }
    const controller = new AbortController();
    const look = async () => {
      const found = await findPricesAt(fiat, wanted.split(",").map(Number), {
        onProgress: (done, total) => {
          if (!controller.signal.aborted) {
            setState({ done, key, total });
          }
        },
        signal: controller.signal,
      });
      if (!controller.signal.aborted) {
        setState((current) => ({ ...current, found, key }));
      }
    };
    look();
    return () => controller.abort();
  }, [fiat, key, wanted]);
  const current = state.key === key;
  return {
    done: current ? state.done : 0,
    found: current ? state.found : undefined,
    needed: wanted ? wanted.split(",").length : 0,
    total: current ? state.total : 0,
  };
}

/** The rows ready to send, priced; ones the market had no price for are skipped. */
function priced(
  rows: ImportRow[],
  found: ReadonlyMap<number, number | null> | undefined,
  fiat: Fiat
): { ready: ImportedTransaction[]; unpriced: SkippedRow[] } {
  const ready: ImportedTransaction[] = [];
  const unpriced: SkippedRow[] = [];
  for (const row of rows) {
    let { price, currency, fee } = row;
    if (needsPrice(row)) {
      const market = found ? foundPriceAt(found, row.at) : undefined;
      // Still being looked up: neither ready nor left out yet.
      if (market === undefined) {
        continue;
      }
      if (market === null) {
        unpriced.push({ line: row.line, reason: "No market price then" });
        continue;
      }
      price = market;
      // A fee in a currency the hub doesn't keep can't be counted.
      fee = row.currency ? fee : undefined;
      currency = fiat;
    }
    ready.push({
      at: row.at,
      currency: currency ?? fiat,
      fee: Math.max(0, fee ?? 0),
      feeSats: Math.max(0, row.feeSats ?? 0),
      kind: row.kind,
      note: row.note,
      price: price ?? 0,
      sats: row.sats,
    });
  }
  return { ready, unpriced };
}

function DropZone({
  id,
  onFile,
  busy,
}: {
  id: string;
  onFile: (file: File) => void;
  busy: boolean;
}) {
  const [over, setOver] = useState(false);
  const drop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setOver(false);
    const [file] = event.dataTransfer.files;
    if (file) {
      onFile(file);
    }
  };
  return (
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- files dropped on the picker it labels
    <label
      className={cn(
        "border-input hover:bg-foreground/[0.02] focus-within:ring-ring/50 flex cursor-pointer flex-col items-center gap-3 rounded-2xl border border-dashed px-6 py-10 text-center transition-[background-color,border-color,box-shadow] duration-150 focus-within:ring-3",
        over && "border-primary bg-primary/5 hover:bg-primary/5"
      )}
      htmlFor={id}
      onDragLeave={() => setOver(false)}
      onDragOver={(event) => {
        event.preventDefault();
        setOver(true);
      }}
      onDrop={drop}
    >
      <span className="bg-muted flex size-11 items-center justify-center rounded-full">
        <UploadIcon
          aria-hidden
          className={cn(
            "size-5 transition-[color,translate] duration-200 ease-out",
            over ? "text-primary -translate-y-0.5" : "text-muted-foreground"
          )}
        />
      </span>
      <span className="flex flex-col gap-1">
        <span className="font-medium">
          {over ? "Drop to read it" : "Drop a CSV file here"}
        </span>
        <span className="text-muted-foreground text-sm">
          or <span className="text-primary font-medium">choose one</span>
        </span>
      </span>
      <span className="mt-1 flex flex-wrap justify-center gap-1.5">
        {SOURCES.map((source) => (
          <span
            className="bg-muted text-muted-foreground rounded-full px-2.5 py-0.5 text-xs"
            key={source}
          >
            {source}
          </span>
        ))}
      </span>
      <input
        accept=".csv,text/csv"
        className="sr-only"
        disabled={busy}
        id={id}
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          const file = event.target.files?.[0];
          if (file) {
            onFile(file);
          }
          event.target.value = "";
        }}
        type="file"
      />
    </label>
  );
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <Tabs onValueChange={(next: T) => onChange(next)} value={value}>
      <TabsList aria-label={label}>
        {options.map((option) => (
          <TabsTrigger key={option.value} value={option.value}>
            {option.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

function Setting({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground text-sm">{label}</span>
      {children}
    </div>
  );
}

/** Which column holds what, for a file no known layout fits. */
function ColumnsCard({
  headers,
  samples,
  options,
  onChange,
}: {
  headers: string[];
  /** A filled-in value from each column, to recognize it by. */
  samples: string[];
  options: CustomOptions;
  onChange: (options: CustomOptions) => void;
}) {
  const id = useId();
  const items = [
    { label: "None", value: NONE },
    ...headers.map((header, index) => ({
      label: header || `Column ${index + 1}`,
      value: String(index),
    })),
  ];
  const setColumn = (role: ColumnRole, next: string | null) => {
    const columns: ColumnMap = {
      ...options.columns,
      [role]: next === null || next === NONE ? undefined : Number(next),
    };
    onChange({ ...options, columns });
  };
  const kindItems = [
    { label: "By the amount’s sign", value: "sign" },
    ...TRANSACTION_KINDS.map((kind) => ({
      label: `All ${KIND_NAMES[kind].toLowerCase()}s`,
      value: kind,
    })),
  ];
  return (
    <div className="bg-muted/40 flex flex-col gap-4 rounded-2xl p-4">
      <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
        {COLUMN_ROLES.map((role) => {
          const column = options.columns[role];
          const missing = REQUIRED.has(role) && column === undefined;
          return (
            <div className="flex min-w-0 flex-col gap-1.5" key={role}>
              <Label
                className={cn("text-xs", missing && "text-destructive")}
                htmlFor={`${id}-${role}`}
              >
                {ROLE_NAMES[role]}
                {REQUIRED.has(role) && (
                  <span aria-hidden className="text-muted-foreground">
                    {" "}
                    *
                  </span>
                )}
              </Label>
              <Select
                items={items}
                onValueChange={(next: string | null) => setColumn(role, next)}
                value={column === undefined ? NONE : String(column)}
              >
                <SelectTrigger
                  aria-invalid={missing || undefined}
                  className="h-8 w-full"
                  id={`${id}-${role}`}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {items.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      <span className="truncate">{item.label}</span>
                      {item.value !== NONE && samples[Number(item.value)] && (
                        <span className="text-muted-foreground truncate text-xs">
                          {samples[Number(item.value)]}
                        </span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          );
        })}
      </div>
      <div className="flex flex-col gap-2.5 border-t pt-4">
        <Setting label="Amounts in">
          <Segmented<Unit>
            label="Amounts in"
            onChange={(unit) => onChange({ ...options, unit })}
            options={[
              { label: "BTC", value: "btc" },
              { label: "sats", value: "sats" },
            ]}
            value={options.unit}
          />
        </Setting>
        <Setting label="Times without a zone">
          <Segmented<"utc" | "local">
            label="Times without a zone"
            onChange={(zone) => onChange({ ...options, utc: zone === "utc" })}
            options={[
              { label: "UTC", value: "utc" },
              { label: "Local", value: "local" },
            ]}
            value={options.utc ? "utc" : "local"}
          />
        </Setting>
        {options.columns.type === undefined && (
          <Setting label="Without a type column">
            <Select
              items={kindItems}
              onValueChange={(next: string | null) => {
                const kind = kindItems.find((item) => item.value === next);
                if (kind) {
                  onChange({
                    ...options,
                    kind: kind.value as CustomOptions["kind"],
                  });
                }
              }}
              value={options.kind}
            >
              <SelectTrigger aria-label="Without a type column" className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                {kindItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Setting>
        )}
        {options.columns.currency === undefined &&
          options.columns.price !== undefined && (
            <Setting label="Prices in">
              <Segmented<Fiat>
                label="Prices in"
                onChange={(fiat) => onChange({ ...options, fiat })}
                options={FIATS.map((fiat) => ({ label: fiat, value: fiat }))}
                value={options.fiat}
              />
            </Setting>
          )}
      </div>
    </div>
  );
}

function Stat({
  value,
  label,
  tone = "muted",
}: {
  value: number;
  label: string;
  tone?: "primary" | "muted" | "warning";
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-1 flex-col gap-0.5 rounded-xl px-3 py-2.5",
        tone === "primary" ? "bg-primary/[0.08]" : "bg-muted/60"
      )}
    >
      <span
        className={cn(
          "text-lg font-semibold tabular-nums",
          tone === "primary" && "text-primary",
          tone === "warning" && value > 0 && "text-destructive"
        )}
      >
        {value}
      </span>
      <span className="text-muted-foreground truncate text-xs">{label}</span>
    </div>
  );
}

/** Why rows were left out, most common first, with the lines each covers. */
function SkippedList({ skipped }: { skipped: SkippedRow[] }) {
  const reasons = new Map<string, number[]>();
  for (const row of skipped) {
    reasons.set(row.reason, [...(reasons.get(row.reason) ?? []), row.line]);
  }
  const sorted = [...reasons].toSorted((a, b) => b[1].length - a[1].length);
  return (
    <Collapsible>
      <CollapsibleTrigger className="text-muted-foreground hover:text-foreground text-xs font-medium transition-colors">
        Why {plural(skipped.length, "row")}{" "}
        {skipped.length === 1 ? "is" : "are"} left out
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="text-muted-foreground mt-2 flex flex-col gap-1 text-xs">
          {sorted.map(([reason, lines]) => (
            <li className="flex gap-2" key={reason}>
              <span className="text-foreground font-medium tabular-nums">
                {lines.length}
              </span>
              <span className="min-w-0 truncate">
                {reason}
                <span className="tabular-nums">
                  {" "}
                  · line{lines.length === 1 ? "" : "s"}{" "}
                  {lines.slice(0, 6).join(", ")}
                  {lines.length > 6 ? "…" : ""}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}

function PreviewTable({
  rows,
  found,
  pricing,
}: {
  rows: ImportRow[];
  found?: ReadonlyMap<number, number | null>;
  pricing: boolean;
}) {
  const shown = rows.slice(0, PREVIEW_ROWS);
  return (
    <div className="max-h-64 overflow-y-auto rounded-xl border">
      <table className="w-full text-sm">
        <thead className="bg-card text-muted-foreground sticky top-0 text-xs">
          <tr className="border-b">
            <th className="px-3 py-2 text-left font-medium">Date</th>
            <th className="px-3 py-2 text-left font-medium">Type</th>
            <th className="px-3 py-2 text-right font-medium">Amount</th>
            <th className="px-3 py-2 text-right font-medium max-sm:hidden">
              Price
            </th>
          </tr>
        </thead>
        <tbody>
          {shown.map((row) => {
            const Icon = KIND_ICONS[row.kind];
            const incoming = isIncoming(row.kind);
            let price: ReactNode =
              row.currency &&
              row.price !== undefined &&
              formatFiat(row.price, row.currency);
            if (needsPrice(row)) {
              const market = found ? foundPriceAt(found, row.at) : undefined;
              if (typeof market === "number") {
                price = <span className="text-muted-foreground">Market</span>;
              } else if (market === null) {
                price = <span className="text-destructive">None then</span>;
              } else {
                price = pricing ? (
                  <Spinner className="ml-auto size-3.5" />
                ) : (
                  <span className="text-muted-foreground">Market</span>
                );
              }
            }
            return (
              <tr className="border-b last:border-b-0" key={row.line}>
                <td className="px-3 py-1.5 whitespace-nowrap tabular-nums">
                  {format(row.at, "MMM d, yyyy")}
                  <span className="text-muted-foreground max-sm:hidden">
                    {" "}
                    {format(row.at, "HH:mm")}
                  </span>
                </td>
                <td className="px-3 py-1.5">
                  <span className="flex items-center gap-1.5">
                    <Icon
                      className={cn(
                        "size-3.5 shrink-0",
                        incoming ? "text-primary" : "text-muted-foreground"
                      )}
                    />
                    {KIND_NAMES[row.kind]}
                  </span>
                </td>
                <td className="px-3 py-1.5 text-right font-medium whitespace-nowrap tabular-nums">
                  {`${incoming ? "+" : "−"}${formatBtc(row.sats)}`}
                </td>
                <td className="px-3 py-1.5 text-right whitespace-nowrap tabular-nums max-sm:hidden">
                  {price}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length > shown.length && (
        <p className="text-muted-foreground border-t px-3 py-2 text-center text-xs">
          And {plural(rows.length - shown.length, "more")}
        </p>
      )}
    </div>
  );
}

/** The file read, with a way to pick another. */
function FileCard({
  name,
  rows,
  disabled,
  onFile,
}: {
  name: string;
  rows: number;
  disabled: boolean;
  onFile: (file: File) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-center gap-3 rounded-2xl border p-3">
      <span className="bg-muted flex size-10 shrink-0 items-center justify-center rounded-xl">
        <FileSpreadsheetIcon
          aria-hidden
          className="text-muted-foreground size-5"
        />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium">{name}</span>
        <span className="text-muted-foreground text-xs tabular-nums">
          {plural(rows, "row")}
        </span>
      </span>
      <label
        className={cn(
          buttonVariants({ size: "sm", variant: "ghost" }),
          "cursor-pointer"
        )}
        htmlFor={id}
      >
        Change
      </label>
      <input
        accept=".csv,text/csv"
        className="sr-only"
        disabled={disabled}
        id={id}
        onChange={(event) => {
          const [file] = event.target.files ?? [];
          if (file) {
            onFile(file);
          }
          event.target.value = "";
        }}
        type="file"
      />
    </div>
  );
}

/** Which layout to read the file as; the one its header matched is marked. */
function FormatField({
  value,
  detected,
  onChange,
}: {
  value: string;
  /** The id of the layout the header matched, if any. */
  detected?: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  const items = [
    ...FORMATS.map((item) => ({ label: item.name, value: item.id })),
    { label: "Other: match the columns", value: CUSTOM },
  ];
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>Format</Label>
      <Select
        items={items}
        onValueChange={(next: string | null) => {
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
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
              {item.value === detected && (
                <span className="bg-primary/10 text-primary rounded-full px-2 py-0.5 text-[0.7rem] font-medium">
                  Detected
                </span>
              )}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {!detected && value === CUSTOM && (
        <p className="text-muted-foreground text-xs">
          Not a layout the importer knows. Match its columns below.
        </p>
      )}
    </div>
  );
}

function PricingProgress({ done, total }: { done: number; total: number }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-muted-foreground flex items-center justify-between text-xs tabular-nums">
        <span className="flex items-center gap-1.5">
          <Spinner className="size-3" />
          Finding market prices
        </span>
        <span>
          {done} of {total || "…"}
        </span>
      </div>
      <div className="bg-muted h-1 overflow-hidden rounded-full">
        <div
          className="bg-primary h-full rounded-full transition-[width] duration-500 ease-out"
          style={{ width: `${total ? (done / total) * 100 : 0}%` }}
        />
      </div>
    </div>
  );
}

function ShortfallAlert({ at, row }: { at: number; row?: ImportRow }) {
  return (
    <p
      className="bg-destructive/10 text-destructive flex gap-2 rounded-xl px-3 py-2.5 text-sm"
      role="alert"
    >
      <CircleAlertIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span>
        On {format(at, "MMM d, yyyy")} the portfolio would give out more bitcoin
        than it held{row ? ` (line ${row.line})` : ""}. Import its earlier
        history first.
      </span>
    </p>
  );
}

/** The file's rows, read as the layout picked, or by the columns matched. */
function readRows(
  table: Detected["table"] | undefined,
  layout: (typeof FORMATS)[number] | undefined,
  options: CustomOptions | undefined
) {
  if (!table) {
    return [];
  }
  if (layout) {
    return layout.read(table);
  }
  const mapped =
    options?.columns.date !== undefined && options.columns.amount !== undefined;
  return mapped ? readCustom(table, options) : [];
}

/** A filled-in value from each column, to recognize it by. */
function samplesOf(table: Detected["table"] | undefined): string[] {
  return (table?.headers ?? []).map(
    (_, column) =>
      table?.rows.find((row) => row.cells[column]?.trim())?.cells[column] ?? ""
  );
}

/**
 * The file's rows against the portfolio: what's new, already there or left
 * out, the market prices still being found, and whether the holdings would
 * ever run short.
 */
function useImportReview({
  table,
  layout,
  options,
  transactions,
  fiat,
}: {
  table: Detected["table"] | undefined;
  layout: (typeof FORMATS)[number] | undefined;
  options: CustomOptions | undefined;
  transactions: Transaction[];
  fiat: Fiat;
}) {
  const rows = useMemo(
    () => review(readRows(table, layout, options), transactions),
    [table, layout, options, transactions]
  );
  const market = useMarketPrices(rows.fresh, fiat);
  const pricing = market.needed > 0 && market.found === undefined;
  const { ready, unpriced } = useMemo(
    () => priced(rows.fresh, market.found, fiat),
    [rows.fresh, market.found, fiat]
  );
  // Rows the market had no price for stay out, so they can't cover a send.
  const shortfall = useMemo(() => {
    const out = new Set(unpriced.map((row) => row.line));
    return firstShortfall(
      rows.fresh.filter((row) => !out.has(row.line)),
      transactions
    );
  }, [rows.fresh, unpriced, transactions]);
  return {
    market,
    pricing,
    ready,
    rows,
    shortfall,
    skipped: [...rows.skipped, ...unpriced],
  };
}

/** What importing would do, before it's done. */
function Summary({
  rows,
  market,
  pricing,
  ready,
  shortfall,
  skipped,
}: ReturnType<typeof useImportReview>) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <Stat label="To import" tone="primary" value={ready.length} />
        <Stat label="Already here" value={rows.duplicates.length} />
        <Stat label="Left out" tone="warning" value={skipped.length} />
      </div>
      {pricing && <PricingProgress done={market.done} total={market.total} />}
      {shortfall && <ShortfallAlert {...shortfall} />}
      {rows.fresh.length > 0 && (
        <PreviewTable
          found={market.found}
          pricing={pricing}
          rows={rows.fresh}
        />
      )}
      {skipped.length > 0 && <SkippedList skipped={skipped} />}
    </div>
  );
}

function initialOptions(detected: Detected, fiat: Fiat): CustomOptions {
  const columns = guessColumns(detected.table.headers);
  return {
    columns,
    fiat,
    kind: "sign",
    unit: guessUnit(detected.table.headers, columns),
    utc: true,
  };
}

function ImportForm({
  portfolio,
  transactions,
  onDone,
}: {
  portfolio: Portfolio;
  /** The portfolio's transactions, in the order they happened. */
  transactions: Transaction[];
  onDone: () => void;
}) {
  const id = useId();
  const fiat = useMe().currency;
  const [loaded, setLoaded] = useState<Loaded>();
  const [formatId, setFormatId] = useState<string>(CUSTOM);
  const [options, setOptions] = useState<CustomOptions>();
  const [saving, setSaving] = useState(false);

  const load = async (file: File) => {
    const detected = detect(parseCsv(await file.text()), FORMATS);
    setLoaded({ detected, name: file.name });
    setFormatId(detected.format?.id ?? CUSTOM);
    setOptions(initialOptions(detected, fiat));
  };

  const table = loaded?.detected.table;
  const layout = FORMATS.find((item) => item.id === formatId);
  const mapped =
    layout !== undefined ||
    (options?.columns.date !== undefined &&
      options.columns.amount !== undefined);

  const result = useImportReview({
    fiat,
    layout,
    options,
    table,
    transactions,
  });
  const { ready, pricing, shortfall } = result;
  const samples = useMemo(() => samplesOf(table), [table]);

  const run = async () => {
    setSaving(true);
    let imported = 0;
    // In the order they happened, so each batch checks out on its own.
    for (let start = 0; start < ready.length; start += MAX_IMPORT) {
      // One batch after another, each checking the holdings so far.
      // oxlint-disable-next-line no-await-in-loop
      const saved = await importTransactions(
        portfolio,
        ready.slice(start, start + MAX_IMPORT)
      );
      if (saved === undefined) {
        break;
      }
      imported += saved;
    }
    setSaving(false);
    if (imported > 0) {
      toast.success(`Imported ${plural(imported, "transaction")}`);
      onDone();
    }
  };

  const canImport =
    ready.length > 0 && !pricing && !shortfall && !saving && mapped;

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <DialogHeader>
        <DialogTitle>Import transactions</DialogTitle>
        <DialogDescription>
          From a CSV file. Exports from the exchanges below are recognized by
          their columns; for any other, you match them.
        </DialogDescription>
      </DialogHeader>

      {loaded && table ? (
        <>
          <FileCard
            disabled={saving}
            name={loaded.name}
            onFile={load}
            rows={table.rows.length}
          />
          <FormatField
            detected={loaded.detected.format?.id}
            onChange={setFormatId}
            value={formatId}
          />

          {formatId === CUSTOM && options && (
            <ColumnsCard
              headers={table.headers}
              onChange={setOptions}
              options={options}
              samples={samples}
            />
          )}

          {mapped && <Summary {...result} />}
        </>
      ) : (
        <DropZone busy={saving} id={`${id}-drop`} onFile={load} />
      )}

      <DialogFooter>
        <DialogClose
          disabled={saving}
          render={<Button type="button" variant="ghost" />}
        >
          Cancel
        </DialogClose>
        <Button disabled={!canImport} onClick={run}>
          {(saving || pricing) && <Spinner />}
          {ready.length > 0
            ? `Import ${plural(ready.length, "transaction")}`
            : "Import"}
        </Button>
      </DialogFooter>
    </div>
  );
}

export function ImportDialog({
  open,
  onOpenChange,
  portfolio,
  transactions,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  portfolio: Portfolio;
  transactions: Transaction[];
}) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-xl" showCloseButton={false}>
        <ImportForm
          onDone={() => onOpenChange(false)}
          portfolio={portfolio}
          transactions={transactions}
        />
      </DialogContent>
    </Dialog>
  );
}
