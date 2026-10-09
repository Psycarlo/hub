/**
 * Portfolio transactions to and from CSV: the hub's own layout both ways,
 * and the exports of exchanges and brokers on the way in, told apart by
 * their header rows. A file none of them fits has its columns matched by hand.
 */
import { format } from "date-fns";

import { toCsv } from "@/lib/csv";
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
  SATS_PER_BTC,
  signedSats,
  transactionTotal,
} from "@/lib/portfolio";
import { slugify } from "@/lib/project";

const MINUTE = 60_000;
/** How far into a file to look for its header row, past any lines before it. */
const HEADER_SEARCH = 15;

/** One transaction read from a file, before it's checked against the portfolio. */
export interface ImportRow {
  /** Where it is in the file, counting from 1, to say which row is which. */
  line: number;
  at: number;
  kind: TransactionKind;
  sats: number;
  /** What one bitcoin cost, when the file says so in a currency the hub keeps. */
  price?: number;
  currency?: Fiat;
  /** An exchange's fee on a buy or sell, in `currency`. */
  fee?: number;
  /** A send's network fee. */
  feeSats?: number;
  note: string;
}

/** A row left out, and why. */
export interface SkippedRow {
  line: number;
  reason: string;
}

export type ReadResult = ImportRow | SkippedRow;

export function isSkipped(result: ReadResult): result is SkippedRow {
  return "reason" in result;
}

/** A file's rows by header, with the line each came from. */
export interface Table {
  headers: string[];
  rows: { line: number; cells: string[] }[];
}

/** A layout the importer knows by its header row. */
export interface CsvFormat {
  id: string;
  /** Which export of whose, like `Kraken ledger`. */
  name: string;
  /** Who makes it, shown among the layouts the importer knows. */
  source: string;
  /** Whether the header row, as `key`s, is this layout's. */
  matches: (keys: Set<string>) => boolean;
  /**
   * Whether its money is in the account's currency, which the file doesn't
   * name; `ReadContext.fiat` says which it is.
   */
  fiatUnnamed?: boolean;
  read: (table: Table, context: ReadContext) => ReadResult[];
}

/** What the person told the importer about a file, beyond its rows. */
export interface ReadContext {
  /** The currency money is in, for layouts that don't say. */
  fiat: Fiat;
}

/** A header as a lookup key: lower case, letters and digits only. */
export function key(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, "");
}

/** A row's cells by header key. */
export function byKey(headers: string[], cells: string[]): Map<string, string> {
  const row = new Map<string, string>();
  for (const [index, header] of headers.entries()) {
    const name = key(header);
    if (!row.has(name)) {
      row.set(name, (cells[index] ?? "").trim());
    }
  }
  return row;
}

/** Whether every key is among the header's. */
export function hasAll(keys: Set<string>, wanted: string[]): boolean {
  return wanted.every((item) => keys.has(item));
}

/**
 * A number as files write it: with a currency sign or code, thousands
 * separators, a decimal comma, or brackets for a minus. Undefined if none.
 */
export function parseNumber(text: string | undefined): number | undefined {
  if (!text) {
    return undefined;
  }
  let value = text.trim();
  const bracketed = /^\(.*\)$/u.test(value);
  value = value.replaceAll(/[^\d.,-]/gu, "");
  const negative = bracketed || value.startsWith("-");
  value = value.replaceAll("-", "");
  const lastDot = value.lastIndexOf(".");
  const lastComma = value.lastIndexOf(",");
  if (lastDot !== -1 && lastComma !== -1) {
    // Both: whichever comes last is the decimal one.
    const decimal = lastDot > lastComma ? "." : ",";
    const thousands = decimal === "." ? "," : ".";
    value = value.replaceAll(thousands, "").replace(decimal, ".");
  } else if (lastComma !== -1) {
    // A lone comma before anything but three digits is a decimal comma.
    const single = value.indexOf(",") === lastComma;
    const decimal = single && value.length - lastComma - 1 !== 3;
    value = decimal ? value.replace(",", ".") : value.replaceAll(",", "");
  }
  if (!/^\d*\.?\d*$/u.test(value) || !/\d/u.test(value)) {
    return undefined;
  }
  const number = Number(value);
  return negative ? -number : number;
}

/** Bitcoin as satoshis, rounded to whole ones. */
export function btcToSats(btc: number): number {
  return Math.round(Math.abs(btc) * SATS_PER_BTC);
}

const ISO_LOCAL =
  /^(?<year>\d{4})-(?<month>\d{1,2})-(?<day>\d{1,2})(?:[ T](?<hours>\d{1,2}):(?<minutes>\d{2})(?::(?<seconds>\d{2})(?:\.(?<fraction>\d+))?)?)?(?:\s*(?:UTC|GMT|Z))?$/iu;
const SLASHED =
  /^(?<first>\d{1,2})[/.](?<second>\d{1,2})[/.](?<year>\d{4})(?:,?\s+(?<hours>\d{1,2}):(?<minutes>\d{2})(?::(?<seconds>\d{2}))?\s*(?<meridiem>[AP]M)?)?(?:\s*(?:UTC|GMT|Z))?$/iu;
const ZONED = /(?:Z|[+-]\d{2}(?::?\d{2})?)$/u;

function moment(
  utc: boolean,
  parts: {
    year: string;
    month: string;
    day: string;
    hours?: string;
    minutes?: string;
    seconds?: string;
    fraction?: string;
  }
): number | undefined {
  const values = [
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hours ?? 0),
    Number(parts.minutes ?? 0),
    Number(parts.seconds ?? 0),
    Math.round(Number(`0.${parts.fraction ?? 0}`) * 1000),
  ] as const;
  const at = utc ? Date.UTC(...values) : new Date(...values).getTime();
  return Number.isFinite(at) ? at : undefined;
}

function fromIso(value: string, utc: boolean): number | undefined {
  const iso = ISO_LOCAL.exec(value)?.groups;
  if (!iso) {
    return undefined;
  }
  return moment(utc, {
    day: iso.day ?? "",
    fraction: iso.fraction,
    hours: iso.hours,
    minutes: iso.minutes,
    month: iso.month ?? "",
    seconds: iso.seconds,
    year: iso.year ?? "",
  });
}

function fromSlashed(value: string, utc: boolean): number | undefined {
  const slashed = SLASHED.exec(value)?.groups;
  if (!slashed) {
    return undefined;
  }
  // Month first, the American way, unless the first can't be a month.
  const dayFirst = Number(slashed.first) > 12;
  let hours = Number(slashed.hours ?? 0);
  const meridiem = slashed.meridiem?.toUpperCase();
  if (meridiem === "PM" && hours < 12) {
    hours += 12;
  } else if (meridiem === "AM" && hours === 12) {
    hours = 0;
  }
  return moment(utc, {
    day: (dayFirst ? slashed.first : slashed.second) ?? "",
    hours: String(hours),
    minutes: slashed.minutes,
    month: (dayFirst ? slashed.second : slashed.first) ?? "",
    seconds: slashed.seconds,
    year: slashed.year ?? "",
  });
}

/** Unix seconds or milliseconds, or an ISO moment with its zone. */
function fromExact(value: string): number | undefined {
  if (/^\d{10}(?:\.\d+)?$/u.test(value)) {
    return Math.round(Number(value) * 1000);
  }
  if (/^\d{13}$/u.test(value)) {
    return Number(value);
  }
  if (ZONED.test(value) && /^\d{4}-/u.test(value)) {
    // A bare hour offset, like Swan's `+00`, gets its minutes.
    const iso = value
      .replace(" ", "T")
      .replace(/(?<offset>[+-]\d{2})$/u, "$<offset>:00");
    const at = Date.parse(iso);
    return Number.isNaN(at) ? undefined : at;
  }
  return undefined;
}

/**
 * A moment as files write it: ISO, `YYYY-MM-DD HH:mm:ss`, slashed days,
 * Unix seconds or milliseconds, or words like `Jan 5, 2024 10:00`. Ones
 * without a zone are taken as UTC when `utc`, else as local time.
 */
export function parseMoment(
  text: string | undefined,
  utc = true
): number | undefined {
  const value = text?.trim().replaceAll(/\s+/gu, " ");
  if (!value) {
    return undefined;
  }
  const named = /\b(?:UTC|GMT)\b/iu.test(value);
  const zoned = named || value.endsWith("Z") || utc;
  const at =
    fromExact(value) ?? fromIso(value, zoned) ?? fromSlashed(value, zoned);
  if (at !== undefined) {
    return at;
  }
  const words = zoned && !named ? `${value} UTC` : value;
  const parsed = Date.parse(words);
  return Number.isNaN(parsed) ? undefined : parsed;
}

/** A currency the hub keeps prices in, from a code like `usd` or `ZUSD`. */
export function parseFiat(text: string | undefined): Fiat | undefined {
  const code = text
    ?.trim()
    .toUpperCase()
    .replace(/^Z(?=USD|EUR)/u, "");
  return FIATS.find((fiat) => fiat === code);
}

const KIND_WORDS: [RegExp, TransactionKind][] = [
  [/\b(?:buy|bought|purchase|purchased|recurring|dca)\b/iu, "buy"],
  [/\b(?:sell|sold|sale)\b/iu, "sell"],
  [/\b(?:send|sent|withdraw(?:al|n)?|payout|outgoing|spend)\b/iu, "send"],
  [
    /\b(?:receive|received|deposit(?:ed)?|incoming|reward|income|interest|bonus|gift|airdrop)\b/iu,
    "receive",
  ],
];

/** What a type column's word means, if it's one the importer knows. */
export function kindFromText(
  text: string | undefined
): TransactionKind | undefined {
  const value = text?.trim() ?? "";
  return KIND_WORDS.find(([pattern]) => pattern.test(value))?.[1];
}

/** Joins what's worth keeping from a row into its note. */
export function noteOf(...parts: (string | undefined)[]): string {
  return parts
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" · ");
}

/** Reads a whole file the same way row by row. */
export function eachRow(
  table: Table,
  read: (row: Map<string, string>, line: number) => ReadResult | undefined
): ReadResult[] {
  return table.rows.flatMap(({ line, cells }) => {
    const result = read(byKey(table.headers, cells), line);
    return result ? [result] : [];
  });
}

/** What every row needs: a moment and an amount of bitcoin. */
export function baseRow(
  line: number,
  at: number | undefined,
  sats: number | undefined
): SkippedRow | undefined {
  if (at === undefined) {
    return { line, reason: "No date the importer can read" };
  }
  if (sats === undefined || sats <= 0) {
    return { line, reason: "No amount of bitcoin" };
  }
  return undefined;
}

// The hub's own layout.

const HUB_HEADERS = [
  "Date",
  "Type",
  "Amount (BTC)",
  "Price",
  "Currency",
  "Fee",
  "Network fee (BTC)",
  "Total",
  "Counterparty",
  "Note",
];

function btcText(sats: number): string {
  return (sats / SATS_PER_BTC).toFixed(8);
}

/** The portfolio's transactions as a CSV file, oldest first. */
export function exportCsv(
  transactions: Transaction[],
  portfolioTitles: ReadonlyMap<string, string>
): string {
  const rows = transactions.map((transaction) => [
    new Date(transaction.at).toISOString(),
    KIND_NAMES[transaction.kind],
    btcText(transaction.sats),
    transaction.price.toFixed(2),
    transaction.currency,
    transaction.fee ? transaction.fee.toFixed(2) : "",
    transaction.feeSats ? btcText(transaction.feeSats) : "",
    transactionTotal(transaction).toFixed(2),
    transaction.transfer
      ? (portfolioTitles.get(transaction.transfer.portfolioId) ?? "")
      : "",
    transaction.note,
  ]);
  return toCsv([HUB_HEADERS, ...rows]);
}

/** What to call the portfolio's export, like `savings-2026-10-09.csv`. */
export function exportName(portfolio: Pick<Portfolio, "title">): string {
  const slug = slugify(portfolio.title) || "portfolio";
  return `${slug}-${format(new Date(), "yyyy-MM-dd")}.csv`;
}

export const hub: CsvFormat = {
  id: "hub",
  matches: (keys) =>
    hasAll(keys, ["date", "type", "amountbtc", "networkfeebtc"]),
  name: "Hub export",
  read: (table) =>
    eachRow(table, (row, line) => {
      const at = parseMoment(row.get("date"));
      const sats = btcToSats(parseNumber(row.get("amountbtc")) ?? 0);
      const kind = kindFromText(row.get("type"));
      const missing = baseRow(line, at, sats);
      if (missing || at === undefined) {
        return missing;
      }
      if (!kind) {
        return { line, reason: `Unknown type “${row.get("type")}”` };
      }
      const counterparty = row.get("counterparty");
      return {
        at,
        currency: parseFiat(row.get("currency")),
        fee: parseNumber(row.get("fee")),
        feeSats: btcToSats(parseNumber(row.get("networkfeebtc")) ?? 0),
        kind,
        line,
        note: noteOf(
          row.get("note"),
          counterparty && `${kind === "send" ? "To" : "From"} ${counterparty}`
        ),
        price: parseNumber(row.get("price")),
        sats,
      };
    }),
  source: "Hub",
};

// Columns matched by hand.

export const COLUMN_ROLES = [
  "date",
  "type",
  "amount",
  "price",
  "currency",
  "fee",
  "feeBtc",
  "note",
] as const;

export type ColumnRole = (typeof COLUMN_ROLES)[number];

/** Which column holds what; undefined for none. */
export type ColumnMap = Record<ColumnRole, number | undefined>;

export interface CustomOptions {
  columns: ColumnMap;
  /** The unit amounts and network fees are in. */
  unit: Unit;
  /**
   * What a row is without a type column: one kind for all, or by the
   * amount's sign, in when positive and out when negative.
   */
  kind: TransactionKind | "sign";
  /** Whether times without a zone are UTC, as exchanges write them, or local. */
  utc: boolean;
  /** The currency prices are in, when no column says. */
  fiat: Fiat;
}

const ROLE_ALIASES: Record<ColumnRole, RegExp> = {
  amount:
    /^(?:amount|quantity|qty|size|volume|vol|btc|amountbtc|quantitybtc|value)/u,
  currency: /^(?:currency|fiat|pricecurrency|quote)/u,
  date: /^(?:date|time|timestamp|datetime|createdat|when|dateutc|timeutc)/u,
  fee: /^(?:fee|fees|commission|feeusd|feeeur)/u,
  feeBtc: /^(?:networkfee|minerfee|feebtc|networkfeebtc|txfee)/u,
  note: /^(?:note|notes|description|memo|label|comment|tag)/u,
  price: /^(?:price|rate|btcprice|spotprice|priceperbtc|unitprice)/u,
  type: /^(?:type|kind|side|transactiontype|action|direction|event)/u,
};

/** Columns matched to roles by their names, each column used once. */
export function guessColumns(headers: string[]): ColumnMap {
  const used = new Set<number>();
  const columns = {} as ColumnMap;
  // Narrow roles first, so a network fee column isn't taken for the fee.
  const order: ColumnRole[] = [
    "feeBtc",
    "date",
    "type",
    "price",
    "currency",
    "fee",
    "note",
    "amount",
  ];
  for (const role of order) {
    const index = headers.findIndex(
      (header, position) =>
        !used.has(position) && ROLE_ALIASES[role].test(key(header))
    );
    columns[role] = index === -1 ? undefined : index;
    if (index !== -1) {
      used.add(index);
    }
  }
  return columns;
}

/** Whether the headers' names say anything about sats, so amounts are likely in them. */
export function guessUnit(headers: string[], columns: ColumnMap): Unit {
  const amount =
    columns.amount === undefined ? "" : (headers[columns.amount] ?? "");
  return /sat/iu.test(amount) ? "sats" : "btc";
}

function amountSats(text: string | undefined, unit: Unit): number | undefined {
  const value = parseNumber(text);
  if (value === undefined) {
    return undefined;
  }
  return unit === "sats" ? Math.round(Math.abs(value)) : btcToSats(value);
}

/** What a hand-matched row is: by its type column, its sign, or as every row is. */
function customKind(
  options: CustomOptions,
  type: string | undefined,
  signed: number,
  price: number | undefined
): TransactionKind | undefined {
  if (options.columns.type !== undefined) {
    return kindFromText(type);
  }
  if (options.kind !== "sign") {
    return options.kind;
  }
  // Priced rows are trades; the rest moved bitcoin in or out.
  const priced = price !== undefined && price > 0;
  if (signed >= 0) {
    return priced ? "buy" : "receive";
  }
  return priced ? "sell" : "send";
}

/** The rows of a file whose columns were matched by hand. */
export function readCustom(table: Table, options: CustomOptions): ReadResult[] {
  const { columns, unit, utc, fiat } = options;
  const cell = (cells: string[], role: ColumnRole) => {
    const { [role]: index } = columns;
    return index === undefined ? undefined : cells[index]?.trim();
  };
  return table.rows.map(({ line, cells }): ReadResult => {
    const at = parseMoment(cell(cells, "date"), utc);
    const signed = parseNumber(cell(cells, "amount"));
    const sats = amountSats(cell(cells, "amount"), unit);
    const missing = baseRow(line, at, sats);
    if (
      missing ||
      at === undefined ||
      sats === undefined ||
      signed === undefined
    ) {
      return missing ?? { line, reason: "No amount of bitcoin" };
    }
    const price = parseNumber(cell(cells, "price"));
    const kind = customKind(options, cell(cells, "type"), signed, price);
    if (!kind) {
      return { line, reason: `Unknown type “${cell(cells, "type") ?? ""}”` };
    }
    const currency =
      columns.currency === undefined
        ? fiat
        : parseFiat(cell(cells, "currency"));
    return {
      at,
      currency,
      fee: parseNumber(cell(cells, "fee")),
      feeSats: amountSats(cell(cells, "feeBtc"), unit),
      kind,
      line,
      note: cell(cells, "note") ?? "",
      price: currency ? price : undefined,
      sats,
    };
  });
}

// Telling layouts apart.

function tableFrom(cells: string[][], headerIndex: number): Table {
  return {
    headers: cells[headerIndex] ?? [],
    rows: cells
      .slice(headerIndex + 1)
      .map((row, index) => ({ cells: row, line: headerIndex + index + 2 })),
  };
}

export interface Detected {
  table: Table;
  /** The layout its header row matches; undefined when the columns need matching by hand. */
  format?: CsvFormat;
}

/**
 * Finds the header row, past any lines some exports put before it, and the
 * layout it belongs to. A file no layout knows takes its first row.
 */
export function detect(cells: string[][], formats: CsvFormat[]): Detected {
  for (const [index, row] of cells.slice(0, HEADER_SEARCH).entries()) {
    const keys = new Set(row.map(key));
    const match = formats.find((item) => item.matches(keys));
    if (match) {
      return { format: match, table: tableFrom(cells, index) };
    }
  }
  return { table: tableFrom(cells, 0) };
}

// Checking against the portfolio.

/** Same kind, amount and minute: most likely the same transaction. */
function sameness(item: {
  kind: TransactionKind;
  sats: number;
  at: number;
}): string {
  return `${item.kind}:${item.sats}:${Math.floor(item.at / MINUTE)}`;
}

/** The rows the portfolio already has. */
export function alreadyThere(
  rows: ImportRow[],
  transactions: Pick<Transaction, "at" | "kind" | "sats">[]
): Set<ImportRow> {
  const existing = new Set(transactions.map(sameness));
  return new Set(rows.filter((row) => existing.has(sameness(row))));
}

/**
 * The first moment the rows would take more bitcoin out than the portfolio
 * held, with its transactions; undefined when they never do.
 */
export function firstShortfall(
  rows: ImportRow[],
  transactions: Pick<Transaction, "at" | "kind" | "sats" | "feeSats">[]
): { at: number; row?: ImportRow } | undefined {
  const merged = [
    ...transactions.map((transaction, order) => ({
      item: transaction,
      order,
      row: undefined,
    })),
    ...rows.map((row, order) => ({
      item: row,
      order: transactions.length + order,
      row,
    })),
  ].toSorted((a, b) => a.item.at - b.item.at || a.order - b.order);
  let held = 0;
  for (const { item, row } of merged) {
    held += signedSats(item);
    if (held < 0) {
      return { at: item.at, row };
    }
  }
  return undefined;
}
