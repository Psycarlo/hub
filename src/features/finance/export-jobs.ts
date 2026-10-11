/**
 * Exports on their way: each gathers the account's entries for the period,
 * draws the statement in a worker, fetches the files its entries keep, and
 * zips it all up in the browser, then saves it. They're kept outside any
 * screen, so the corner tray follows them while the person carries on.
 */
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { MAX_EXPORT_LINKS } from "@convex/shared/finance";
import { useSyncExternalStore } from "react";

import type { StatementReply } from "@/features/finance/statement-worker";
import { APP_NAME } from "@/lib/brand";
import { convex } from "@/lib/convex";
import { downloadFile } from "@/lib/csv";
import type {
  ExportFile,
  ExportParts,
  ExportPeriod,
  Statement,
} from "@/lib/finance-export";
import {
  buildStatement,
  exportFileName,
  filePaths,
  lastMonth,
  periodLabel,
  statementCsv,
} from "@/lib/finance-export";
import type { HexColor } from "@/lib/palette";
import { playSound } from "@/lib/sounds";
import { errorMessage } from "@/lib/utils";

export type ExportStep =
  /** Asking the server for the period's entries. */
  | "gathering"
  /** Drawing the statement. */
  | "drawing"
  /** Fetching the files its entries keep. */
  | "fetching"
  /** Putting the zip together. */
  | "packing"
  | "done"
  | "failed"
  | "canceled";

export interface ExportJob {
  id: string;
  /** Like "Checking · Q4 2026". */
  title: string;
  /** What it saves as; a guess until the period's files are known. */
  fileName: string;
  step: ExportStep;
  /** Files to fetch, and how many are in. */
  files: number;
  fetched: number;
  /** Their size, and how much of it is in. */
  bytes: number;
  loaded: number;
  /** Files that couldn't be fetched, and were left out. */
  missing: number;
  /** What it saved, to save again. */
  result?: Blob;
  error?: string;
}

export interface ExportRequest {
  account: { _id: Id<"financeAccounts">; title: string };
  period: ExportPeriod;
  parts: ExportParts;
  /** The account's card color, which the statement's card is drawn in. */
  card: HexColor;
}

/** Files fetched at once; the rest wait their turn. */
const CONCURRENT = 4;
/** How often progress is told while files come in. */
const PROGRESS_MS = 120;
const ZIP_TYPE = "application/zip";
const CSV_TYPE = "text/csv;charset=utf-8";

let jobs: ExportJob[] = [];
const requests = new Map<string, ExportRequest>();
const controllers = new Map<string, AbortController>();
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

function patch(id: string, change: Partial<ExportJob>): void {
  jobs = jobs.map((job) => (job.id === id ? { ...job, ...change } : job));
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function snapshot(): ExportJob[] {
  return jobs;
}

/** Every export, oldest first. */
export function useExports(): ExportJob[] {
  return useSyncExternalStore(subscribe, snapshot);
}

export function isRunning(job: ExportJob): boolean {
  return (
    job.step !== "done" && job.step !== "failed" && job.step !== "canceled"
  );
}

/** What it saves as, given whether the period's files come along. */
function fileNameOf(request: ExportRequest, withFiles: boolean): string {
  return exportFileName(
    request.account.title,
    request.period,
    request.parts,
    withFiles
  );
}

/**
 * Draws the statement in a worker, so the app stays smooth meanwhile; null
 * when the browser can't start one.
 */
function drawInWorker(
  statement: Statement,
  signal: AbortSignal
): Promise<Blob | null> {
  // React Refresh can't load in a worker, so in development it's drawn here.
  if (import.meta.env.DEV) {
    return Promise.resolve(null);
  }
  let worker: Worker;
  try {
    // oxlint-disable-next-line unicorn/relative-url-style -- Vite only bundles workers from ./ paths
    worker = new Worker(new URL("./statement-worker.ts", import.meta.url), {
      type: "module",
    });
  } catch {
    return Promise.resolve(null);
  }
  // oxlint-disable-next-line promise/avoid-new -- a worker only answers through events
  return new Promise<Blob | null>((resolve, reject) => {
    const abort = () => {
      worker.terminate();
      reject(signal.reason);
    };
    const settle = () => {
      worker.terminate();
      signal.removeEventListener("abort", abort);
    };
    signal.addEventListener("abort", abort, { once: true });
    worker.addEventListener(
      "message",
      (event: MessageEvent<StatementReply>) => {
        settle();
        if ("blob" in event.data) {
          resolve(event.data.blob);
        } else {
          reject(new Error(event.data.error));
        }
      }
    );
    // It didn't start, rather than failing to draw: that's told as a message.
    worker.addEventListener("error", () => {
      settle();
      resolve(null);
    });
    // oxlint-disable-next-line unicorn/require-post-message-target-origin -- a worker, not a window
    worker.postMessage(statement);
  });
}

/** Draws the statement in a worker, or here, should the browser not run it in one. */
async function drawStatement(
  statement: Statement,
  signal: AbortSignal
): Promise<Blob> {
  const drawn = await drawInWorker(statement, signal);
  if (drawn) {
    return drawn;
  }
  const { renderStatement } = await import("@/features/finance/statement-pdf");
  return await renderStatement(statement);
}

/** The file's bytes, telling each chunk's size as it arrives. */
async function read(
  url: string,
  signal: AbortSignal,
  onBytes: (count: number) => void
): Promise<Uint8Array<ArrayBuffer>> {
  const response = await fetch(url, { signal });
  if (!(response.ok && response.body)) {
    throw new Error(`Couldn’t fetch it (${response.status}).`);
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    // oxlint-disable-next-line no-await-in-loop -- a stream's chunks come one after another
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    chunks.push(value);
    size += value.length;
    onBytes(value.length);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

/** A file's bytes, tried twice; undefined once it can't be had. */
async function download(
  url: string | undefined,
  signal: AbortSignal,
  onBytes: (count: number) => void
): Promise<Uint8Array<ArrayBuffer> | undefined> {
  if (!url) {
    return undefined;
  }
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let received = 0;
    try {
      // oxlint-disable-next-line no-await-in-loop -- tried again only once the first try failed
      return await read(url, signal, (count) => {
        received += count;
        onBytes(count);
      });
    } catch (error) {
      if (signal.aborted) {
        throw error;
      }
      // Taken back, so the bar doesn't count it twice.
      onBytes(-received);
    }
  }
  return undefined;
}

/** Runs `work` over the items, a few at once. */
async function eachLimited<T>(
  items: T[],
  limit: number,
  work: (item: T) => Promise<void>
): Promise<void> {
  const queue = [...items];
  const lane = async () => {
    for (let item = queue.shift(); item !== undefined; item = queue.shift()) {
      // oxlint-disable-next-line no-await-in-loop -- each lane takes the next item once it's done with one
      await work(item);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, queue.length) }, lane)
  );
}

/** A zip built as files are added, so each file's bytes can go once it's in. */
async function openZip() {
  const { Zip, ZipDeflate, ZipPassThrough, strToU8 } = await import("fflate");
  const chunks: Uint8Array[] = [];
  const state: { failure?: Error } = {};
  const zip = new Zip((error, chunk) => {
    if (error) {
      state.failure = error;
    } else {
      chunks.push(chunk);
    }
  });
  return {
    add(path: string, data: Uint8Array | string) {
      // Text squeezes down; PDFs and photos are compressed already.
      const text = typeof data === "string";
      const file = text
        ? new ZipDeflate(path, { level: 6 })
        : new ZipPassThrough(path);
      zip.add(file);
      file.push(text ? strToU8(data) : data, true);
    },
    close(): Blob {
      zip.end();
      if (state.failure) {
        throw state.failure;
      }
      return new Blob(chunks as Uint8Array<ArrayBuffer>[], { type: ZIP_TYPE });
    },
  };
}

type Zipper = Awaited<ReturnType<typeof openZip>>;

/** Fetches the files into the zip a few at a time, saying how far it got; returns the paths of any it couldn't. */
async function fetchFiles(
  id: string,
  request: ExportRequest,
  files: ExportFile[],
  paths: ReadonlyMap<string, string>,
  zip: Zipper,
  signal: AbortSignal
): Promise<string[]> {
  const missing: string[] = [];
  const progress = { fetched: 0, loaded: 0, told: 0 };
  const tell = (force = false) => {
    const now = performance.now();
    if (force || now - progress.told > PROGRESS_MS) {
      progress.told = now;
      patch(id, { fetched: progress.fetched, loaded: progress.loaded });
    }
  };
  const fetchOne = async (file: ExportFile, url: string | undefined) => {
    const path = paths.get(file._id) ?? file.name;
    const bytes = await download(url, signal, (count) => {
      progress.loaded += count;
      tell();
    });
    if (bytes) {
      zip.add(path, bytes);
    } else {
      missing.push(path);
    }
    progress.fetched += 1;
    tell();
  };
  patch(id, {
    bytes: files.reduce((sum, file) => sum + file.size, 0),
    fetched: 0,
    files: files.length,
    loaded: 0,
    step: "fetching",
  });
  for (let start = 0; start < files.length; start += MAX_EXPORT_LINKS) {
    const batch = files.slice(start, start + MAX_EXPORT_LINKS);
    // Links last a few minutes, so each batch's are asked for once it's next.
    // oxlint-disable-next-line no-await-in-loop -- batch by batch, on purpose
    const links = await convex.mutation(api.finance.exportLinks, {
      accountId: request.account._id,
      fileIds: batch.map((file) => file._id),
    });
    const urls = new Map(links.map((link) => [link.fileId, link.url]));
    // oxlint-disable-next-line no-await-in-loop -- batch by batch, on purpose
    await eachLimited(batch, CONCURRENT, (file) =>
      fetchOne(file, urls.get(file._id))
    );
  }
  tell(true);
  return missing;
}

/** What's said about files that couldn't be fetched, beside the rest. */
function missingNote(missing: string[]): string {
  return [
    "These files couldn’t be fetched, so they’re not in this export.",
    "Open each transaction in the hub to get them.",
    "",
    ...missing,
    "",
  ].join("\r\n");
}

async function run(id: string, request: ExportRequest): Promise<void> {
  const controller = new AbortController();
  controllers.set(id, controller);
  const { signal } = controller;
  const { account, period, parts } = request;
  try {
    const data = await convex.query(api.finance.exportData, {
      accountId: account._id,
      first: period.first,
      last: lastMonth(period),
    });
    signal.throwIfAborted();
    if (!data) {
      throw new Error("This account isn’t shared with you anymore.");
    }
    const withFiles = parts.files && data.files.length > 0;
    if (!(parts.pdf || parts.csv || withFiles)) {
      throw new Error(`No files kept in ${periodLabel(period)}.`);
    }
    const fileName = fileNameOf(request, withFiles);
    patch(id, { fileName });
    const paths = withFiles ? filePaths(data, period) : undefined;
    const statement = buildStatement({
      app: APP_NAME,
      card: request.card,
      data,
      now: new Date(),
      paths,
      period,
    });
    let pdf: Blob | undefined;
    if (parts.pdf) {
      patch(id, { step: "drawing" });
      pdf = await drawStatement(statement, signal);
    }
    const csv = parts.csv ? statementCsv(statement) : undefined;
    let result: Blob;
    let missing: string[] = [];
    if (fileName.endsWith(".pdf") && pdf) {
      result = pdf;
    } else if (fileName.endsWith(".csv") && csv !== undefined) {
      result = new Blob([csv], { type: CSV_TYPE });
    } else {
      const zip = await openZip();
      const folder = fileName.slice(0, -".zip".length);
      if (pdf) {
        zip.add(
          `${folder}/${folder}.pdf`,
          new Uint8Array(await pdf.arrayBuffer())
        );
      }
      if (csv !== undefined) {
        zip.add(`${folder}/${folder}.csv`, csv);
      }
      if (paths) {
        const inFolder = new Map(
          [...paths].map(([fileId, path]) => [fileId, `${folder}/${path}`])
        );
        missing = await fetchFiles(
          id,
          request,
          data.files,
          inFolder,
          zip,
          signal
        );
        if (missing.length > 0) {
          zip.add(`${folder}/Missing files.txt`, missingNote(missing));
        }
      }
      signal.throwIfAborted();
      patch(id, { step: "packing" });
      result = zip.close();
    }
    signal.throwIfAborted();
    downloadFile(fileName, result, result.type);
    patch(id, { missing: missing.length, result, step: "done" });
    playSound("ready");
  } catch (error) {
    if (!jobs.some((job) => job.id === id)) {
      return;
    }
    patch(
      id,
      signal.aborted
        ? { step: "canceled" }
        : { error: errorMessage(error), step: "failed" }
    );
  } finally {
    controllers.delete(id);
  }
}

/** A job as it starts, or starts again. */
function fresh(request: ExportRequest): Omit<ExportJob, "id" | "title"> {
  return {
    bytes: 0,
    error: undefined,
    fetched: 0,
    fileName: fileNameOf(request, request.parts.files),
    files: 0,
    loaded: 0,
    missing: 0,
    result: undefined,
    step: "gathering",
  };
}

/** Starts exporting the account over the period, with what's picked. */
export function startExport(request: ExportRequest): string {
  const id = crypto.randomUUID();
  requests.set(id, request);
  jobs = [
    ...jobs,
    {
      id,
      title: `${request.account.title} · ${periodLabel(request.period)}`,
      ...fresh(request),
    },
  ];
  emit();
  run(id, request);
  return id;
}

export function cancelExport(id: string): void {
  controllers.get(id)?.abort();
}

export function retryExport(id: string): void {
  const request = requests.get(id);
  if (!request || controllers.has(id)) {
    return;
  }
  patch(id, fresh(request));
  run(id, request);
}

/** Saves a finished export again, should the first download have been missed. */
export function saveAgain(id: string): void {
  const job = jobs.find((item) => item.id === id);
  if (job?.result) {
    downloadFile(job.fileName, job.result, job.result.type);
  }
}

/** Lets an export go, stopping it first if it's still going. */
export function dismissExport(id: string): void {
  cancelExport(id);
  requests.delete(id);
  jobs = jobs.filter((job) => job.id !== id);
  emit();
}

/** Lets every export go that's finished, one way or another. */
export function clearFinishedExports(): void {
  for (const job of jobs) {
    if (!isRunning(job)) {
      requests.delete(job.id);
    }
  }
  jobs = jobs.filter(isRunning);
  emit();
}

/** Stops every export still going, and lets them all go. */
export function cancelAllExports(): void {
  for (const job of jobs) {
    dismissExport(job.id);
  }
}
