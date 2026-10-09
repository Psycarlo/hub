/** A project's Drive: what both the server and the app know about its files and folders. */

/**
 * The largest file the Drive takes. Change it here: the app checks it before
 * uploading, and the server checks it again once R2 has the file.
 */
export const MAX_DRIVE_FILE_BYTES = 500 * 1024 * 1024;

/** Thumbnails are small pictures the browser makes on upload; anything bigger isn't one. */
export const MAX_THUMB_BYTES = 2 * 1024 * 1024;

/** How long trashed files and folders wait before they're deleted for good. */
export const TRASH_DAYS = 30;
export const TRASH_MS = TRASH_DAYS * 24 * 60 * 60 * 1000;

export const MAX_DRIVE_NAME = 255;

/** Files and folders moved or trashed in one go. */
export const MAX_DRIVE_BATCH = 500;

/** Keys of Drive uploads start with this, and nothing else's do. */
const DRIVE_PREFIX = "drive/";
const FILE_PREFIX = `${DRIVE_PREFIX}f/`;
const THUMB_PREFIX = `${DRIVE_PREFIX}t/`;

/**
 * What an R2 key was uploaded for: the Drive, a card or comment (their keys
 * hold a slash), or anything else, like photos, logos and doc images.
 */
export type KeyKind = "drive" | "attachment" | "plain";

export function keyKind(key: string): KeyKind {
  if (key.startsWith(DRIVE_PREFIX)) {
    return "drive";
  }
  return key.includes("/") ? "attachment" : "plain";
}

/** A Drive file's key: a random id, then its name, so downloads keep it. */
export function driveFileKey(id: string, name: string): string {
  return `${FILE_PREFIX}${id}/${name}`;
}

export function driveThumbKey(id: string): string {
  return `${THUMB_PREFIX}${id}`;
}

export function isDriveFileKey(key: string): boolean {
  return key.startsWith(FILE_PREFIX);
}

export function isThumbKey(key: string): boolean {
  return key.startsWith(THUMB_PREFIX);
}

const UNSAFE = /[\p{Cc}/\\]+/gu;
const SPACES = /\s+/gu;

/** A name fit for the Drive: one line, no slashes, not too long. Empty when nothing's left. */
export function cleanName(name: string): string {
  return name
    .replaceAll(UNSAFE, " ")
    .replaceAll(SPACES, " ")
    .trim()
    .slice(0, MAX_DRIVE_NAME);
}

/**
 * The name split before its extension: "brief.v2.pdf" is "brief.v2" and
 * ".pdf". Names starting with their only dot, like ".env", have none.
 */
export function splitName(name: string): [string, string] {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
}

/** Names compare without case, as on most computers, so "Brief.pdf" and "brief.pdf" clash. */
export function nameKey(name: string): string {
  return name.trim().toLowerCase();
}

/** The name with a number before its extension, like "brief (2).pdf". */
export function numberedName(name: string, number: number): string {
  const [base, extension] = splitName(name);
  return `${base} (${number})${extension}`;
}

/** Items counted inside each folder shown; past it, a folder reads "100+". */
export const MAX_COUNTED = 100;

/** A size limit as people read it, like "500 MB" or "2 GB". */
export function sizeLimit(bytes: number): string {
  const megabytes = bytes / 1024 / 1024;
  return megabytes >= 1024 && megabytes % 1024 === 0
    ? `${megabytes / 1024} GB`
    : `${Math.round(megabytes)} MB`;
}

export const TOO_BIG = `Files can be up to ${sizeLimit(MAX_DRIVE_FILE_BYTES)}.`;
