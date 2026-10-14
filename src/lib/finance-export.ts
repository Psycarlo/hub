/**
 * What an account's export is made of, worked out from what the server
 * sends: the period it covers, where each file goes in the zip, the
 * statement the PDF draws, and the rows of the CSV.
 */
import type { FinanceExport } from "@convex/finance";
import { format, parseISO } from "date-fns";

import { toCsv } from "@/lib/csv";
import type { EntryKind, MonthTotals } from "@/lib/finance";
import {
  entryDays,
  monthName,
  monthOf,
  monthStart,
  monthTotals,
  shiftMonth,
  signedCents,
  statusLabel,
} from "@/lib/finance";
import type { HexColor } from "@/lib/palette";
import { HEX_COLORS } from "@/lib/palette";
import type { Fiat } from "@/lib/portfolio";

export type { ExportFile, FinanceExport } from "@convex/finance";

export const PERIOD_UNITS = ["month", "quarter", "year"] as const;

export type PeriodUnit = (typeof PERIOD_UNITS)[number];

/** A month, a quarter or a year, from its first month on. */
export interface ExportPeriod {
  unit: PeriodUnit;
  /** `YYYY-MM`. */
  first: string;
}

/** What goes in an export; files only count when the period has some. */
export interface ExportParts {
  pdf: boolean;
  csv: boolean;
  files: boolean;
}

const MONTHS_IN: Record<PeriodUnit, number> = {
  month: 1,
  quarter: 3,
  year: 12,
};

/** The month, quarter or year `month` falls in. */
export function periodOf(unit: PeriodUnit, month: string): ExportPeriod {
  const [year = 0, index = 1] = month.split("-").map(Number);
  const size = MONTHS_IN[unit];
  const start = Math.floor((index - 1) / size) * size + 1;
  return { first: `${year}-${String(start).padStart(2, "0")}`, unit };
}

/** The period `by` periods away, like the next quarter. */
export function shiftPeriod(period: ExportPeriod, by: number): ExportPeriod {
  return {
    first: shiftMonth(period.first, by * MONTHS_IN[period.unit]),
    unit: period.unit,
  };
}

/** The period's months, `YYYY-MM`, in order. */
export function periodMonths(period: ExportPeriod): string[] {
  return Array.from({ length: MONTHS_IN[period.unit] }, (_, index) =>
    shiftMonth(period.first, index)
  );
}

export function lastMonth(period: ExportPeriod): string {
  return shiftMonth(period.first, MONTHS_IN[period.unit] - 1);
}

/** "October 2026", "Q4 2026" or "2026". */
export function periodLabel(period: ExportPeriod): string {
  const year = period.first.slice(0, 4);
  if (period.unit === "year") {
    return year;
  }
  if (period.unit === "quarter") {
    return `Q${Math.ceil(Number(period.first.slice(5, 7)) / 3)} ${year}`;
  }
  return monthName(period.first, { year: true });
}

/** The days it runs, like "1 Oct – 31 Dec 2026". */
export function periodRange(period: ExportPeriod): string {
  const start = monthStart(period.first);
  const end = new Date(
    start.getFullYear(),
    start.getMonth() + MONTHS_IN[period.unit],
    0
  );
  return `${format(start, "d MMM")} – ${format(end, "d MMM yyyy")}`;
}

// Characters file systems refuse in names, and control characters.
// oxlint-disable-next-line no-control-regex
const UNSAFE = /[\\/:*?"<>|\u0000-\u001F]+/gu;
const MAX_NAME = 80;

/** Text fit to name a file or folder, on any system. */
export function safeName(text: string, fallback: string): string {
  const clean = text
    .replace(UNSAFE, " ")
    .replaceAll(/\s+/gu, " ")
    .trim()
    .slice(0, MAX_NAME)
    .trim()
    .replace(/\.+$/u, "");
  return clean || fallback;
}

function extensionOf(name: string): string {
  return /\.[\da-z]{1,8}$/iu.exec(name)?.[0].toLowerCase() ?? "";
}

/** What the export's files are called, like "Checking - Q4 2026". */
export function exportBaseName(title: string, period: ExportPeriod): string {
  return safeName(`${title} - ${periodLabel(period)}`, "Export");
}

/** What an export saves as: one file on its own, or a zip once there's more. */
export function exportFileName(
  title: string,
  period: ExportPeriod,
  parts: ExportParts,
  withFiles: boolean
): string {
  const base = exportBaseName(title, period);
  if (withFiles || (parts.pdf && parts.csv)) {
    return `${base}.zip`;
  }
  return `${base}.${parts.pdf ? "pdf" : "csv"}`;
}

/**
 * Where each file goes in the zip, by file id: under Invoices, in a folder
 * per month over several, named by its day and entry, like
 * `Invoices/2026-10/2026-10-03 Rent.pdf`.
 */
export function filePaths(
  data: FinanceExport,
  period: ExportPeriod
): Map<string, string> {
  const byEntry = Map.groupBy(data.files, (file) => file.entryId);
  const taken = new Set<string>();
  const paths = new Map<string, string>();
  for (const entry of data.entries) {
    const files = byEntry.get(entry._id) ?? [];
    const folder =
      period.unit === "month" ? "Invoices" : `Invoices/${monthOf(entry.date)}`;
    for (const [index, file] of files.entries()) {
      const base = `${entry.date} ${safeName(entry.name, "Transaction")}${files.length > 1 ? ` (${index + 1})` : ""}`;
      const extension = extensionOf(file.name);
      let path = `${folder}/${base}${extension}`;
      for (let copy = 2; taken.has(path.toLowerCase()); copy += 1) {
        path = `${folder}/${base} ${copy}${extension}`;
      }
      taken.add(path.toLowerCase());
      paths.set(file._id, path);
    }
  }
  return paths;
}

/** One entry as the statement and the CSV list it. */
export interface StatementRow {
  /** The day the money moved, or is to. */
  date: string;
  /** The day its bill or invoice is dated. */
  issued: string;
  /** The day it must be paid or received by, if it says. */
  due?: string;
  name: string;
  note: string;
  kind: EntryKind;
  cents: number;
  paid: boolean;
  /** Still waiting past its day, as the export was made. */
  overdue: boolean;
  category?: { name: string; color: HexColor };
  /** The other side of a transfer, like "To Savings". */
  transfer?: string;
  /** Where its files are in the zip; their names when they're left out of it. */
  files: string[];
  /** What the account held after it, once it's settled. */
  balance?: number;
}

/** What one category came to. */
export interface CategoryShare {
  name: string;
  color: HexColor;
  cents: number;
}

/** One month of several, in the statement's overview. */
export interface StatementMonth {
  /** "October". */
  name: string;
  credits: number;
  debits: number;
  /** What the account held as it ended. */
  closing: number;
}

/** Everything the PDF draws; plain data, so it can go to a worker. */
export interface Statement {
  app: string;
  project: string;
  account: {
    title: string;
    description: string;
    currency: Fiat;
    /** The card's color, which the statement's card is drawn in. */
    card: HexColor;
  };
  period: { unit: PeriodUnit; label: string; range: string };
  /** When it was made, as people read it. */
  generated: string;
  opening: number;
  closing: number;
  totals: MonthTotals;
  /** Its months, when it covers several. */
  months: StatementMonth[];
  /** Paid debits, then received credits, by category: the biggest first. */
  spending: CategoryShare[];
  income: CategoryShare[];
  rows: StatementRow[];
  /** Whether its files come along in the zip, so their paths are worth listing. */
  withFiles: boolean;
}

/** Categories shown by name before the rest are summed together. */
const TOP_CATEGORIES = 6;
const TRANSFERS: HexColor = "#94a3b8";
const UNFILED: HexColor = "#cbd5e1";

/** What paid entries of a kind came to by category, the biggest first, the smallest summed. */
function shares(rows: StatementRow[], kind: EntryKind): CategoryShare[] {
  const sums = new Map<string, CategoryShare>();
  for (const row of rows) {
    if (row.kind !== kind || !row.paid) {
      continue;
    }
    let key = row.category?.name ?? "No category";
    let color = row.category?.color ?? UNFILED;
    if (row.transfer && !row.category) {
      key = "Transfers";
      color = TRANSFERS;
    }
    const sum = sums.get(key) ?? { cents: 0, color, name: key };
    sum.cents += row.cents;
    sums.set(key, sum);
  }
  const sorted = [...sums.values()].toSorted((a, b) => b.cents - a.cents);
  if (sorted.length <= TOP_CATEGORIES + 1) {
    return sorted;
  }
  const rest = sorted.slice(TOP_CATEGORIES);
  return [
    ...sorted.slice(0, TOP_CATEGORIES),
    {
      cents: rest.reduce((sum, share) => sum + share.cents, 0),
      color: UNFILED,
      name: `${rest.length} more`,
    },
  ];
}

/** The statement for the period, with each file listed where it is in the zip, if they come along. */
export function buildStatement({
  data,
  period,
  paths,
  card,
  app,
  now,
}: {
  data: FinanceExport;
  period: ExportPeriod;
  /** Where files are in the zip; left out when they don't come along. */
  paths?: ReadonlyMap<string, string>;
  card: HexColor;
  app: string;
  now: Date;
}): Statement {
  const today = format(now, "yyyy-MM-dd");
  const { account } = data;
  const categories = new Map(
    data.categories.map((category) => [category.id, category])
  );
  const others = new Map(
    data.transfers.map((other) => [other.accountId, other.title])
  );
  const filesOf = Map.groupBy(data.files, (file) => file.entryId);
  let balance = data.opening;
  const rows = data.entries.map((entry): StatementRow => {
    if (entry.paid) {
      balance += signedCents(entry);
    }
    const category = entry.category
      ? categories.get(entry.category)
      : undefined;
    const other = entry.transfer && others.get(entry.transfer.accountId);
    return {
      balance: entry.paid ? balance : undefined,
      category: category && {
        color: HEX_COLORS[category.color],
        name: category.name,
      },
      cents: entry.cents,
      date: entry.date,
      due: entry.due,
      files: (filesOf.get(entry._id) ?? []).map(
        (file) => paths?.get(file._id) ?? file.name
      ),
      issued: entryDays(entry).issued,
      kind: entry.kind,
      name: entry.name,
      note: entry.note,
      overdue: !entry.paid && entry.date < today,
      paid: entry.paid,
      transfer: other
        ? `${entry.kind === "debit" ? "To" : "From"} ${other}`
        : undefined,
    };
  });
  const months: StatementMonth[] = [];
  if (period.unit !== "month") {
    let closing = data.opening;
    for (const month of periodMonths(period)) {
      const totals = monthTotals(
        data.entries.filter((entry) => monthOf(entry.date) === month),
        today
      );
      closing += totals.net;
      months.push({
        closing,
        credits: totals.credits,
        debits: totals.debits,
        name: format(monthStart(month), "MMMM"),
      });
    }
  }
  return {
    account: {
      card,
      currency: account.currency,
      description: account.description,
      title: account.title,
    },
    app,
    closing: data.closing,
    generated: format(now, "d MMM yyyy, HH:mm"),
    income: shares(rows, "credit"),
    months,
    opening: data.opening,
    period: {
      label: periodLabel(period),
      range: periodRange(period),
      unit: period.unit,
    },
    project: data.projectTitle,
    rows,
    spending: shares(rows, "debit"),
    totals: monthTotals(data.entries, today),
    withFiles: paths !== undefined,
  };
}

const CSV_HEADERS = [
  "Date",
  "Dated",
  "Due",
  "Name",
  "Category",
  "Status",
  "Amount",
  "Currency",
  "Balance",
  "Note",
  "Transfer",
  "Files",
];

function decimal(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** The statement's entries, a row each, with amounts signed and the balance once settled. */
export function statementCsv(statement: Statement): string {
  const rows = statement.rows.map((row) => [
    row.date,
    row.issued,
    row.due ?? "",
    row.name,
    row.category?.name ?? "",
    statusLabel(row.kind, row.paid),
    decimal(signedCents(row)),
    statement.account.currency,
    row.balance === undefined ? "" : decimal(row.balance),
    row.note,
    row.transfer ?? "",
    row.files.join("; "),
  ]);
  return toCsv([CSV_HEADERS, ...rows]);
}

/** A day as the statement shows it, like "3 Oct". */
export function shortDay(date: string): string {
  return format(parseISO(date), "d MMM");
}
