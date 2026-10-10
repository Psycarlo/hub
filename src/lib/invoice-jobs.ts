import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type {
  InvoiceFailure,
  InvoiceReading,
  InvoiceResult,
} from "@convex/shared/finance";
import { useSyncExternalStore } from "react";

import { discardUpload } from "@/lib/actions";
import { convex } from "@/lib/convex";
import { typeOf } from "@/lib/drive";
import { playSound } from "@/lib/sounds";
import type { Upload } from "@/lib/upload";
import { uploadable, uploadAttachment } from "@/lib/upload";
import { errorMessage } from "@/lib/utils";

/**
 * Files on their way to an entry: each is uploaded as soon as it's picked,
 * and an invoice is read too, so the form can fill itself in. They're kept
 * outside any screen, so a batch dropped on an account carries on while it's
 * reviewed one by one, and a dialog closed meanwhile doesn't lose them.
 */

export type JobStatus =
  /** Going up to R2. */
  | "uploading"
  /** Up, and being read by a model. */
  | "reading"
  /** Up, and read if it was to be. */
  | "ready"
  /** Didn't upload. */
  | "failed";

export interface InvoiceJob {
  id: string;
  accountId: Id<"financeAccounts">;
  name: string;
  size: number;
  type: string;
  /** A local address of the file, to show it before and after it's uploaded. */
  url: string;
  status: JobStatus;
  /** Set once it's uploaded. */
  upload?: Upload;
  /** Whether it's read: the invoice, rather than a file kept alongside it. */
  read: boolean;
  /** What reading found, once it's done. */
  reading?: InvoiceReading;
  /** Why reading found nothing. */
  failure?: InvoiceFailure;
  /** Why it didn't upload. */
  error?: string;
  /** Dropped with others, to review one by one from the corner tray. */
  batch: boolean;
  /** What became of a batch job: added to the account, or skipped. */
  outcome?: "added" | "skipped";
}

interface Work {
  file: File;
  /** Forgotten meanwhile: whatever it's waiting on is let go once it arrives. */
  dropped: boolean;
}

/** Uploads and reads going at once; the rest wait their turn. */
const CONCURRENT = 3;

let jobs: InvoiceJob[] = [];
const work = new Map<string, Work>();
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

function patch(id: string, change: Partial<InvoiceJob>): void {
  jobs = jobs.map((job) => (job.id === id ? { ...job, ...change } : job));
  emit();
}

function find(id: string): InvoiceJob | undefined {
  return jobs.find((job) => job.id === id);
}

/** A job as it is now, outside a component. */
export function jobById(id: string): InvoiceJob | undefined {
  return find(id);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function snapshot(): InvoiceJob[] {
  return jobs;
}

/** Every job, oldest first. */
export function useInvoiceJobs(): InvoiceJob[] {
  return useSyncExternalStore(subscribe, snapshot);
}

/** Whether a job still has work to do before it can be saved. */
export function isBusy(job: InvoiceJob): boolean {
  return job.status === "uploading" || job.status === "reading";
}

async function read(id: string): Promise<void> {
  const job = find(id);
  if (!job?.upload) {
    return;
  }
  let result: InvoiceResult = { ok: false, reason: "failed" };
  try {
    result = await convex.action(api.invoices.read, {
      accountId: job.accountId,
      key: job.upload.key,
    });
  } catch {
    // Said as a failure to read; the file itself is fine.
  }
  if (work.get(id)?.dropped !== false) {
    return;
  }
  patch(
    id,
    result.ok
      ? { failure: undefined, reading: result.reading, status: "ready" }
      : { failure: result.reason, reading: undefined, status: "ready" }
  );
  const done = find(id);
  if (done?.batch && !jobs.some((other) => other.batch && isBusy(other))) {
    playSound("ready");
  }
}

async function upload(id: string): Promise<void> {
  const item = work.get(id);
  if (!item) {
    return;
  }
  try {
    const done = await uploadAttachment(item.file);
    if (item.dropped) {
      discardUpload(done.key);
      return;
    }
    const reads = find(id)?.read ?? false;
    patch(id, { status: reads ? "reading" : "ready", upload: done });
    if (reads) {
      await read(id);
    }
  } catch (error) {
    if (!item.dropped) {
      patch(id, { error: errorMessage(error), status: "failed" });
    }
  }
}

/** Jobs started and not finished yet, so no more than a few go at once. */
const running = new Set<string>();
const waiting: string[] = [];

/** Runs a job; once it's done, the change lets the next one waiting start. */
async function runJob(id: string): Promise<void> {
  running.add(id);
  try {
    await upload(id);
  } finally {
    running.delete(id);
    emit();
  }
}

let pumping = false;

/** Starts what's waiting, as far as there's room. Runs whenever any job changes. */
function pump(): void {
  if (pumping) {
    return;
  }
  pumping = true;
  while (running.size < CONCURRENT && waiting.length > 0) {
    const id = waiting.shift();
    if (id && work.get(id)?.dropped === false) {
      runJob(id);
    }
  }
  pumping = false;
}

listeners.add(pump);

/**
 * Starts uploading files for an entry in the account; `read` reads the first
 * of them, or every one in a `batch`, each its own entry. Returns the new
 * jobs' ids.
 */
export function addJobs(
  accountId: Id<"financeAccounts">,
  files: File[],
  { batch, read: reads }: { batch: boolean; read: boolean }
): string[] {
  const added = uploadable(files).map((file, index): InvoiceJob => {
    const id = crypto.randomUUID();
    work.set(id, { dropped: false, file });
    waiting.push(id);
    return {
      accountId,
      batch,
      id,
      name: file.name,
      read: reads && (batch || index === 0),
      size: file.size,
      status: "uploading",
      type: typeOf(file),
      url: URL.createObjectURL(file),
    };
  });
  if (added.length > 0) {
    jobs = [...jobs, ...added];
    emit();
  }
  return added.map((job) => job.id);
}

/** Reads a file already uploaded, as the invoice, in place of what it read before. */
export function readJob(id: string): void {
  const job = find(id);
  if (!job || isBusy(job) || job.status === "failed") {
    return;
  }
  patch(id, { read: true, status: "reading" });
  read(id);
}

/** Tries a file that didn't upload again. */
export function retryJob(id: string): void {
  if (find(id)?.status !== "failed") {
    return;
  }
  waiting.push(id);
  patch(id, { error: undefined, status: "uploading" });
}

/** Forgets a job, deleting its upload unless it was added to an entry. */
export function dropJob(id: string): void {
  const job = find(id);
  const item = work.get(id);
  if (!(job && item)) {
    return;
  }
  item.dropped = true;
  work.delete(id);
  if (job.upload && job.outcome !== "added") {
    discardUpload(job.upload.key);
  }
  URL.revokeObjectURL(job.url);
  jobs = jobs.filter((other) => other.id !== id);
  emit();
}

/**
 * The job's file went into an entry. One from a batch stays in the tray,
 * ticked off; any other is done with.
 */
export function finishJob(id: string): void {
  const job = find(id);
  if (!job) {
    return;
  }
  patch(id, { outcome: "added" });
  if (!job.batch) {
    dropJob(id);
  }
}

/** Sets a batch job aside without adding it, to come back to before the tray closes. */
export function skipJob(id: string): void {
  patch(id, { outcome: "skipped" });
}

/** Whether invoices are on their way or waiting to be reviewed, which a reload would lose. */
export function holdingInvoices(): boolean {
  return jobs.some((job) => job.outcome !== "added");
}

/** Forgets an account's batch, deleting the uploads of invoices not added. */
export function dropBatch(accountId: Id<"financeAccounts">): void {
  for (const job of jobs) {
    if (job.batch && job.accountId === accountId) {
      dropJob(job.id);
    }
  }
}
