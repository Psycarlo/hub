import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useSyncExternalStore } from "react";
import { toast } from "sonner";

import { run } from "@/lib/actions";
import { convex } from "@/lib/convex";
import { fileKind, MAX_DRIVE_FILE_BYTES, TOO_BIG, typeOf } from "@/lib/drive";
import { measure } from "@/lib/thumbnails";
import { errorMessage, plural } from "@/lib/utils";

/**
 * Uploads to Drives, kept outside any screen so they carry on while the person
 * moves around the app. A few go at once; the rest wait their turn.
 */

export type UploadStatus =
  | "queued"
  | "uploading"
  /** Sent; being filed in the Drive, with its thumbnail. */
  | "saving"
  | "done"
  | "failed"
  | "canceled";

/** Where uploads go: a project's Drive, at the top or in a folder. */
export interface Destination {
  projectId: Id<"projects">;
  /** The project's link, to show the file once it's in. */
  projectSlug: string;
  folderId?: Id<"driveFolders">;
}

export interface UploadItem extends Destination {
  id: string;
  /** The file's name; once filed, the one it got, which may be numbered. */
  name: string;
  size: number;
  type: string;
  status: UploadStatus;
  /** Bytes sent so far. */
  loaded: number;
  /** Bytes a second, smoothed. */
  speed: number;
  error?: string;
  fileId?: Id<"driveFiles">;
  /** A local picture of an image, to show before it's uploaded. */
  preview?: string;
}

/** A file picked or dropped, with the folders it sat in, from the top of what was picked down. */
export interface Picked {
  file: File;
  path: string[];
}

export interface PickedSet {
  files: Picked[];
  /** Every folder picked, empty ones too, each as its path. */
  folders: string[][];
}

class CanceledError extends Error {
  override name = "CanceledError";
}

interface Job {
  file: File;
  xhr?: XMLHttpRequest;
  /** Uploads made but not filed yet, deleted again if it doesn't get that far. */
  key?: string;
  thumbKey?: string;
  canceled: boolean;
  /** Still working through its steps, even if canceled meanwhile. */
  running: boolean;
  sampledAt: number;
  sampled: number;
}

const CONCURRENT = 3;
/** Progress shows at most this often per file, plenty for a bar. */
const SAMPLE_MS = 150;
/** Local previews of images bigger than this cost more memory than they're worth. */
const MAX_PREVIEW_BYTES = 25 * 1024 * 1024;
/** What computers leave in folders that nobody means to upload. */
const JUNK = new Set([".DS_Store", "Thumbs.db", "desktop.ini"]);

let items: UploadItem[] = [];
const jobs = new Map<string, Job>();
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

function patch(id: string, change: Partial<UploadItem>): void {
  items = items.map((item) => (item.id === id ? { ...item, ...change } : item));
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function snapshot(): UploadItem[] {
  return items;
}

/** Every upload since the tray was last cleared, oldest first. */
export function useUploads(): UploadItem[] {
  return useSyncExternalStore(subscribe, snapshot);
}

export function isActive(item: UploadItem): boolean {
  return (
    item.status === "queued" ||
    item.status === "uploading" ||
    item.status === "saving"
  );
}

/** Deletes an upload never filed. One that can't be is swept up within a day anyway. */
async function discard(key: string): Promise<void> {
  try {
    await convex.mutation(api.drive.discard, { key });
  } catch {
    // Left for the nightly sweep.
  }
}

/** Uploads made but not filed are deleted, so canceled ones don't linger in R2. */
function forget(job: Job): void {
  for (const key of [job.key, job.thumbKey]) {
    if (key) {
      discard(key);
    }
  }
  job.key = undefined;
  job.thumbKey = undefined;
}

function sample(id: string, loaded: number): void {
  const job = jobs.get(id);
  const now = performance.now();
  if (!job || now - job.sampledAt < SAMPLE_MS) {
    return;
  }
  const seconds = (now - job.sampledAt) / 1000;
  const instant = (loaded - job.sampled) / seconds;
  const previous = items.find((item) => item.id === id)?.speed ?? 0;
  job.sampledAt = now;
  job.sampled = loaded;
  patch(id, {
    loaded,
    speed: previous ? previous * 0.75 + instant * 0.25 : instant,
  });
}

/** Sends the file to its signed link, telling how far it got as it goes. */
function put(url: string, item: UploadItem, job: Job): Promise<void> {
  // oxlint-disable-next-line promise/avoid-new -- only XMLHttpRequest reports upload progress, and only through events
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    job.xhr = xhr;
    xhr.open("PUT", url);
    xhr.setRequestHeader(
      "Content-Type",
      item.type || "application/octet-stream"
    );
    xhr.upload.addEventListener("progress", (event) =>
      sample(item.id, event.loaded)
    );
    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error("The upload didn’t go through. Try again."));
      }
    });
    xhr.addEventListener("error", () =>
      reject(new Error("The connection dropped. Try again."))
    );
    xhr.addEventListener("abort", () => reject(new CanceledError()));
    xhr.send(job.file);
  });
}

/** Uploads a file's thumbnail, resolving with its key; without one, the file's icon stands in. */
async function uploadThumbnail(
  item: UploadItem,
  blob: Blob
): Promise<string | undefined> {
  try {
    const target = await convex.mutation(api.drive.generateUploadUrl, {
      name: "thumbnail",
      projectId: item.projectId,
      size: blob.size,
      thumbnail: true,
    });
    const response = await fetch(target.url, {
      body: blob,
      headers: { "Content-Type": blob.type || "image/webp" },
      method: "PUT",
    });
    if (!response.ok) {
      discard(target.key);
      return;
    }
    await convex.mutation(api.r2.syncMetadata, { key: target.key });
    return target.key;
  } catch {
    // Previews are a nicety: the file itself still goes in.
  }
}

/** Sends a file, its thumbnail, then files it in the Drive. Canceling stops it at the next step. */
async function send(item: UploadItem, job: Job): Promise<void> {
  // Thumbnails are drawn while the file uploads.
  const measuring = measure(job.file, fileKind(item));
  const target = await convex.mutation(api.drive.generateUploadUrl, {
    name: item.name,
    projectId: item.projectId,
    size: item.size,
  });
  job.key = target.key;
  if (job.canceled) {
    throw new CanceledError();
  }
  await put(target.url, item, job);
  await convex.mutation(api.r2.syncMetadata, { key: target.key });
  patch(item.id, { loaded: item.size, status: "saving" });
  const measured = await measuring;
  if (measured.thumbnail && !job.canceled) {
    job.thumbKey = await uploadThumbnail(item, measured.thumbnail);
  }
  if (job.canceled) {
    throw new CanceledError();
  }
  const filed = await convex.mutation(api.drive.addFile, {
    duration: measured.duration,
    file: {
      key: target.key,
      name: item.name,
      size: item.size,
      type: item.type,
    },
    folderId: item.folderId,
    height: measured.height,
    projectId: item.projectId,
    thumbKey: job.thumbKey,
    width: measured.width,
  });
  job.key = undefined;
  job.thumbKey = undefined;
  jobs.delete(item.id);
  patch(item.id, { fileId: filed.fileId, name: filed.name, status: "done" });
}

async function start(id: string): Promise<void> {
  const item = items.find((upload) => upload.id === id);
  const job = jobs.get(id);
  if (!(item && job) || item.status !== "queued") {
    return;
  }
  job.canceled = false;
  job.running = true;
  job.sampledAt = performance.now();
  job.sampled = 0;
  patch(id, { error: undefined, loaded: 0, speed: 0, status: "uploading" });
  try {
    await send(item, job);
  } catch (error) {
    forget(job);
    if (job.canceled || error instanceof CanceledError) {
      patch(id, { status: "canceled" });
    } else {
      patch(id, { error: errorMessage(error), status: "failed" });
    }
  } finally {
    job.xhr = undefined;
    job.running = false;
  }
}

let pumping = false;

/** Starts what's waiting, as far as there's room. Runs whenever any upload changes. */
function pump(): void {
  if (pumping) {
    return;
  }
  pumping = true;
  const running = items.filter(
    (item) => item.status === "uploading" || item.status === "saving"
  ).length;
  const next = items
    .filter((item) => item.status === "queued")
    .slice(0, Math.max(0, CONCURRENT - running));
  for (const item of next) {
    start(item.id);
  }
  pumping = false;
}

listeners.add(pump);

/** Queues files for a Drive, each into its own folder or the destination's. */
function enqueue(
  files: { file: File; folderId?: Id<"driveFolders"> }[],
  to: Destination
): void {
  const fitting = files.filter(
    ({ file }) => file.size <= MAX_DRIVE_FILE_BYTES && !JUNK.has(file.name)
  );
  const big = files.filter(({ file }) => file.size > MAX_DRIVE_FILE_BYTES);
  if (big.length > 0) {
    toast.error(
      big.length === 1
        ? `${big[0]?.file.name} is too big. ${TOO_BIG}`
        : `${plural(big.length, "file")} are too big. ${TOO_BIG}`
    );
  }
  const added = fitting.map(({ file, folderId }): UploadItem => {
    const id = crypto.randomUUID();
    const type = typeOf(file);
    jobs.set(id, {
      canceled: false,
      file,
      running: false,
      sampled: 0,
      sampledAt: 0,
    });
    return {
      ...to,
      folderId: folderId ?? to.folderId,
      id,
      loaded: 0,
      name: file.name,
      preview:
        type.startsWith("image/") && file.size <= MAX_PREVIEW_BYTES
          ? URL.createObjectURL(file)
          : undefined,
      size: file.size,
      speed: 0,
      status: "queued",
      type,
    };
  });
  if (added.length > 0) {
    items = [...items, ...added];
    emit();
  }
}

/** Uploads files to a Drive. */
export function uploadFiles(files: File[], to: Destination): void {
  enqueue(
    files.map((file) => ({ file })),
    to
  );
}

/**
 * Uploads what was picked or dropped, folders and all: the folders are made
 * first, in the shape they had, and each file goes into its own.
 */
export async function uploadPicked(
  picked: PickedSet,
  to: Destination
): Promise<void> {
  if (picked.folders.length === 0) {
    uploadFiles(
      picked.files.map(({ file }) => file),
      to
    );
    return;
  }
  const made = await run(
    convex.mutation(api.drive.createFolders, {
      parentId: to.folderId,
      paths: picked.folders,
      projectId: to.projectId,
    })
  );
  if (!made) {
    return;
  }
  const byPath = new Map(
    picked.folders.map((path, index) => [path.join("/"), made[index]])
  );
  enqueue(
    picked.files.map(({ file, path }) => ({
      file,
      folderId: byPath.get(path.join("/")) ?? to.folderId,
    })),
    to
  );
}

export function cancel(id: string): void {
  const item = items.find((upload) => upload.id === id);
  const job = jobs.get(id);
  if (!(item && job && isActive(item))) {
    return;
  }
  job.canceled = true;
  job.xhr?.abort();
  // Shown at once; whatever step it's on stops at the next chance, and deletes what it uploaded.
  patch(id, { status: "canceled" });
}

export function cancelAll(): void {
  for (const item of items.filter(isActive)) {
    cancel(item.id);
  }
}

export function retry(id: string): void {
  const item = items.find((upload) => upload.id === id);
  const job = jobs.get(id);
  if (
    !(item && job) ||
    job.running ||
    (item.status !== "failed" && item.status !== "canceled")
  ) {
    return;
  }
  patch(id, { error: undefined, loaded: 0, speed: 0, status: "queued" });
}

/** Takes what's finished, failed or canceled off the tray, keeping what's still going. */
export function clearFinished(): void {
  for (const item of items.filter((upload) => !isActive(upload))) {
    if (item.preview) {
      URL.revokeObjectURL(item.preview);
    }
    jobs.delete(item.id);
  }
  items = items.filter(isActive);
  emit();
}

// Closing the tab would cut uploads off halfway, so the browser asks first.
globalThis.addEventListener("beforeunload", (event) => {
  if (items.some(isActive)) {
    event.preventDefault();
  }
});

// ———————————————————————————————————————— Reading what was picked

function isFileEntry(entry: FileSystemEntry): entry is FileSystemFileEntry {
  return entry.isFile;
}

function isDirectoryEntry(
  entry: FileSystemEntry
): entry is FileSystemDirectoryEntry {
  return entry.isDirectory;
}

function fileOf(entry: FileSystemFileEntry): Promise<File> {
  // oxlint-disable-next-line promise/avoid-new -- the File System API only takes callbacks
  return new Promise((resolve, reject) => {
    entry.file(resolve, reject);
  });
}

function batchOf(
  reader: FileSystemDirectoryReader
): Promise<FileSystemEntry[]> {
  // oxlint-disable-next-line promise/avoid-new -- the File System API only takes callbacks
  return new Promise((resolve, reject) => {
    reader.readEntries(resolve, reject);
  });
}

/** Everything in a folder: it hands its entries over a hundred or so at a time, until none are left. */
async function entriesOf(
  reader: FileSystemDirectoryReader
): Promise<FileSystemEntry[]> {
  const batch = await batchOf(reader);
  return batch.length === 0 ? [] : [...batch, ...(await entriesOf(reader))];
}

async function walk(
  entry: FileSystemEntry,
  path: string[],
  into: PickedSet
): Promise<void> {
  if (isFileEntry(entry)) {
    into.files.push({ file: await fileOf(entry), path });
    return;
  }
  if (!isDirectoryEntry(entry)) {
    return;
  }
  const inside = [...path, entry.name];
  into.folders.push(inside);
  const children = await entriesOf(entry.createReader());
  await Promise.all(children.map((child) => walk(child, inside, into)));
}

async function walkAll(entries: FileSystemEntry[]): Promise<PickedSet> {
  const into: PickedSet = { files: [], folders: [] };
  await Promise.all(entries.map((entry) => walk(entry, [], into)));
  return into;
}

/**
 * What was dropped from the computer, folders and all. Its items must be
 * taken while the drop is handled, so call this right in the handler.
 */
export function readDrop(transfer: DataTransfer): Promise<PickedSet> {
  const plain = [...transfer.files].map((file) => ({ file, path: [] }));
  const entries = [...transfer.items].flatMap((item) => {
    const entry = item.kind === "file" ? item.webkitGetAsEntry() : null;
    return entry ? [entry] : [];
  });
  return entries.some(isDirectoryEntry)
    ? walkAll(entries)
    : Promise.resolve({ files: plain, folders: [] });
}

/** Files picked with a folder picker, which tells each one's path within it. */
export function readPickedFolder(files: File[]): PickedSet {
  const folders = new Map<string, string[]>();
  const picked = files.map((file) => {
    const path = file.webkitRelativePath.split("/").slice(0, -1);
    for (let depth = 1; depth <= path.length; depth += 1) {
      const prefix = path.slice(0, depth);
      folders.set(prefix.join("/"), prefix);
    }
    return { file, path };
  });
  return { files: picked, folders: [...folders.values()] };
}

/** Uploads what was dropped into a Drive, folders and all. Call it right in the drop handler. */
export async function uploadDropped(
  transfer: DataTransfer,
  to: Destination
): Promise<void> {
  await uploadPicked(await readDrop(transfer), to);
}
