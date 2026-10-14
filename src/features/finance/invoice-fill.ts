import type { InvoiceFailure, InvoiceReading } from "@convex/shared/finance";
import { format, parseISO } from "date-fns";

import type { Account } from "@/lib/finance";
import { moneyText } from "@/lib/finance";

/** The form's fields an invoice can fill in. */
export type FillableField =
  | "name"
  | "amount"
  | "date"
  | "due"
  | "paid"
  | "category"
  | "note";

/** What an invoice says the form's fields should be, as the form types them. */
export interface InvoiceSuggestion {
  name?: string;
  amount?: string;
  /** The day it's dated; its due day when it says only that. */
  date?: string;
  due?: string;
  paid?: boolean;
  category?: string;
  note?: string;
  /** Its total, when it's in another currency than the account's: said, not filled in. */
  foreign?: { cents: number; currency: string };
}

/** How the form would take what the invoice says, in the account it goes to. */
export function suggest(
  reading: InvoiceReading,
  account: Account,
  today: string
): InvoiceSuggestion {
  const date = reading.issued ?? reading.due;
  // A due day before the invoice's own is misread; it's left out.
  const due =
    reading.due && date && reading.due >= date ? reading.due : undefined;
  const sameMoney =
    reading.currency === undefined || reading.currency === account.currency;
  const suggestion: InvoiceSuggestion = {
    category: reading.category,
    date,
    due,
    name: reading.name,
    note: reading.number ? `Invoice ${reading.number}` : undefined,
  };
  if (reading.cents !== undefined && sameMoney) {
    suggestion.amount = moneyText(reading.cents);
  } else if (reading.cents !== undefined && reading.currency) {
    suggestion.foreign = { cents: reading.cents, currency: reading.currency };
  }
  const settles = due ?? date;
  if (reading.paid !== undefined) {
    suggestion.paid = reading.paid;
  } else if (settles) {
    // Settled once its day has come, like any entry typed in.
    suggestion.paid = settles <= today;
  }
  return suggestion;
}

/** Money in any currency the invoice was in, like "$1,250.00"; its code where the browser doesn't know it. */
export function anyMoney(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      currency,
      style: "currency",
    }).format(cents / 100);
  } catch {
    return `${moneyText(cents)} ${currency}`;
  }
}

export function dayText(date: string): string {
  return format(parseISO(date), "MMM d, yyyy");
}

/** What the form says when an invoice couldn't be read. Reading being off says nothing. */
export const FAILURES: Record<Exclude<InvoiceFailure, "off">, string> = {
  failed: "Couldn’t read this one. Fill it in yourself.",
  limit: "That’s a lot of invoices read lately. Try again in a while.",
  "not-invoice": "This doesn’t look like an invoice or receipt.",
  unsupported: "Can’t read this kind of file. PDFs, JPEG, PNG and WebP can be.",
};
