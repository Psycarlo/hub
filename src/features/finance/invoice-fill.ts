import type { InvoiceFailure, InvoiceReading } from "@convex/shared/finance";
import { format, parseISO } from "date-fns";

import type { Account } from "@/lib/finance";
import { moneyText } from "@/lib/finance";

/** The form's fields an invoice can fill in. */
export type FillableField =
  | "name"
  | "amount"
  | "date"
  | "paid"
  | "category"
  | "note";

/** What an invoice says the form's fields should be, as the form types them. */
export interface InvoiceSuggestion {
  name?: string;
  amount?: string;
  date?: string;
  paid?: boolean;
  category?: string;
  note?: string;
  /** Its total, when it's in another currency than the account's: said, not filled in. */
  foreign?: { cents: number; currency: string };
}

/**
 * The day the entry falls on: when it was paid, for a receipt, or when it's
 * due, for a bill still to pay; when it was issued if it doesn't say.
 */
function dayOf(reading: InvoiceReading): string | undefined {
  return reading.paid
    ? (reading.issued ?? reading.due)
    : (reading.due ?? reading.issued);
}

/** How the form would take what the invoice says, in the account it goes to. */
export function suggest(
  reading: InvoiceReading,
  account: Account,
  today: string
): InvoiceSuggestion {
  const date = dayOf(reading);
  const sameMoney =
    reading.currency === undefined || reading.currency === account.currency;
  const suggestion: InvoiceSuggestion = {
    category: reading.category,
    date,
    name: reading.name,
    note: reading.number ? `Invoice ${reading.number}` : undefined,
  };
  if (reading.cents !== undefined && sameMoney) {
    suggestion.amount = moneyText(reading.cents);
  } else if (reading.cents !== undefined && reading.currency) {
    suggestion.foreign = { cents: reading.cents, currency: reading.currency };
  }
  if (reading.paid !== undefined) {
    suggestion.paid = reading.paid;
  } else if (date) {
    // Settled once its day has come, like any entry typed in.
    suggestion.paid = date <= today;
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
