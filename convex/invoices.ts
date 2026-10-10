"use node";

/**
 * Reads invoices and receipts with a model, to fill in a transaction. Runs in
 * Node, where an action has room for a 10 MB photo on its way to the model.
 */
import { v } from "convex/values";
import { z } from "zod";

import { internal } from "./_generated/api";
import { action } from "./_generated/server";
import { AiError, runTask } from "./lib/ai";
import { aiKey } from "./lib/env";
import type { InvoiceReading, InvoiceResult } from "./shared/finance";
import { MAX_CENTS, MAX_ENTRY_NAME, isDate } from "./shared/finance";
import { labelKey } from "./shared/model";

/** What models on OpenRouter take: PDFs, and pictures in these formats. HEIC photos aren't among them. */
const READABLE: Record<string, string> = {
  gif: "image/gif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  pdf: "application/pdf",
  png: "image/png",
  webp: "image/webp",
};
const MAX_NUMBER = 60;
const CURRENCY = /^[A-Z]{3}$/u;

const INSTRUCTIONS = `You read invoices, bills and receipts for a bookkeeping app, and return what the document says.

- Use null for anything the document doesn't show clearly. Never guess or make values up.
- isInvoice: false when the file isn't an invoice, bill or receipt, like a photo of something else, a contract or a bank statement.
- vendor: who issued it and gets paid, named the way someone would in a list of their expenses: "EDP Comercial", "Amazon", "Pingo Doce". Leave out legal forms like Lda., S.A., Inc. or GmbH unless people use them in the name.
- total: the final amount to pay, taxes and fees included. Not a subtotal, a tax line or an amount already paid off. A plain number with a dot for decimals, like 1234.56, however the document writes it.
- currency: the ISO 4217 code of the total, like EUR, USD or GBP, from its symbol, code or the country, when the document makes it clear.
- issueDate and dueDate: YYYY-MM-DD. Read day and month in the order the document's country writes them: 03/10/2026 is 3 October in Portugal and March 10 in the US. dueDate only when it says when to pay by.
- invoiceNumber: as printed, like FT 2026/142.
- paid: true for a receipt or a document marked paid, false when it asks to be paid, null when it doesn't say.
- category: the one that fits what was bought best, or null when none does.`;

function invoiceSchema(categories: string[]) {
  // With categories, the model can only pick one of them.
  const category: z.ZodType<string> =
    categories.length > 0
      ? z.enum(categories as [string, ...string[]])
      : z.string();
  return z.object({
    category: category.nullable(),
    currency: z.string().nullable(),
    dueDate: z.string().nullable(),
    invoiceNumber: z.string().nullable(),
    isInvoice: z.boolean(),
    issueDate: z.string().nullable(),
    paid: z.boolean().nullable(),
    total: z.number().nullable(),
    vendor: z.string().nullable(),
  });
}

type Found = z.infer<ReturnType<typeof invoiceSchema>>;

/** What the model found, checked and in the app's terms; anything off is left out. */
function cleanReading(
  found: Found,
  categories: { id: string; name: string }[]
): InvoiceReading {
  const reading: InvoiceReading = {};
  const name = found.vendor?.trim().slice(0, MAX_ENTRY_NAME);
  if (name) {
    reading.name = name;
  }
  if (found.total !== null && Number.isFinite(found.total)) {
    const cents = Math.round(Math.abs(found.total) * 100);
    if (cents > 0 && cents <= MAX_CENTS) {
      reading.cents = cents;
    }
  }
  const currency = found.currency?.trim().toUpperCase();
  if (currency && CURRENCY.test(currency)) {
    reading.currency = currency;
  }
  if (found.issueDate && isDate(found.issueDate)) {
    reading.issued = found.issueDate;
  }
  if (found.dueDate && isDate(found.dueDate)) {
    reading.due = found.dueDate;
  }
  const number = found.invoiceNumber?.trim().slice(0, MAX_NUMBER);
  if (number) {
    reading.number = number;
  }
  if (found.paid !== null) {
    reading.paid = found.paid;
  }
  const category = found.category && labelKey(found.category);
  reading.category = categories.find(
    (item) => labelKey(item.name) === category
  )?.id;
  return reading;
}

/** The file's type as a model takes it, from what R2 kept or its name; undefined if none would. */
function readableType(file: { name: string; type: string }) {
  const known = Object.values(READABLE).find((type) => type === file.type);
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return known ?? READABLE[extension];
}

/**
 * Reads an invoice or receipt uploaded for the account, or kept by one of
 * its entries. Never throws for what reading finds or how it fails: that's
 * the result, for the form to say.
 */
export const read = action({
  args: { accountId: v.id("financeAccounts"), key: v.string() },
  handler: async (ctx, args): Promise<InvoiceResult> => {
    const source = await ctx.runMutation(internal.finance.invoiceSource, args);
    if (!aiKey()) {
      return { ok: false, reason: "off" };
    }
    const mediaType = readableType(source);
    if (!mediaType) {
      return { ok: false, reason: "unsupported" };
    }
    const response = await fetch(source.url);
    if (!response.ok) {
      return { ok: false, reason: "failed" };
    }
    const data = new Uint8Array(await response.arrayBuffer());
    try {
      const found = await runTask(ctx, {
        content: [
          {
            text: `Today is ${new Date().toISOString().slice(0, 10)}.${
              source.categories.length > 0
                ? ` Categories: ${source.categories.map(({ name }) => name).join(", ")}.`
                : ""
            }`,
            type: "text",
          },
          { data, filename: source.name, mediaType, type: "file" },
        ],
        instructions: INSTRUCTIONS,
        schema: invoiceSchema(source.categories.map(({ name }) => name)),
        task: "invoice",
        userId: source.userId,
      });
      if (!found.isInvoice) {
        return { ok: false, reason: "not-invoice" };
      }
      return { ok: true, reading: cleanReading(found, source.categories) };
    } catch (error) {
      if (error instanceof AiError) {
        return { ok: false, reason: error.reason };
      }
      throw error;
    }
  },
});
