import type { DriveFileView, DriveFolderView } from "@convex/drive";

export {
  MAX_COUNTED,
  MAX_DRIVE_BATCH,
  MAX_DRIVE_FILE_BYTES,
  splitName,
  TOO_BIG,
  TRASH_DAYS,
  TRASH_MS,
} from "@convex/shared/drive";

export type DriveFile = DriveFileView;
export type DriveFolder = DriveFolderView;

/** A folder's id, or "" for the top of the Drive. */
export type Place = string;
export const TOP: Place = "";

export interface DriveTree {
  folders: DriveFolder[];
  byId: Map<string, DriveFolder>;
  /** The folders in each place, by name. */
  children: Map<Place, DriveFolder[]>;
}

export const EMPTY_TREE: DriveTree = {
  byId: new Map(),
  children: new Map(),
  folders: [],
};

const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

export function compareNames(a: string, b: string): number {
  return collator.compare(a, b);
}

/** One project's folders as a tree. The server only sends ones out of the trash. */
export function resolveTree(folders: DriveFolder[]): DriveTree {
  const byId = new Map(folders.map((folder) => [folder._id, folder]));
  const children = new Map<Place, DriveFolder[]>();
  for (const folder of folders.toSorted((a, b) =>
    compareNames(a.name, b.name)
  )) {
    const place = folder.parentId ?? TOP;
    children.set(place, [...(children.get(place) ?? []), folder]);
  }
  return { byId, children, folders };
}

/** Every project's folders as trees, by project id. */
export function driveByProject(folders: DriveFolder[]): Map<string, DriveTree> {
  const grouped = new Map<string, DriveFolder[]>();
  for (const folder of folders) {
    grouped.set(folder.projectId, [
      ...(grouped.get(folder.projectId) ?? []),
      folder,
    ]);
  }
  return new Map(
    [...grouped].map(([projectId, list]) => [projectId, resolveTree(list)])
  );
}

/** The folders from the top of the Drive down to this one, itself last. */
export function pathTo(tree: DriveTree, folderId: string | undefined) {
  const chain: DriveFolder[] = [];
  const seen = new Set<string>();
  for (
    let folder = folderId ? tree.byId.get(folderId) : undefined;
    folder && !seen.has(folder._id);
    folder = folder.parentId ? tree.byId.get(folder.parentId) : undefined
  ) {
    seen.add(folder._id);
    chain.unshift(folder);
  }
  return chain;
}

/** Every folder inside this one, at any depth. */
export function foldersWithin(
  tree: DriveTree,
  folderId: string
): DriveFolder[] {
  return (tree.children.get(folderId) ?? []).flatMap((child) => [
    child,
    ...foldersWithin(tree, child._id),
  ]);
}

/** Whether these folders may go into `target`: never into themselves or what's inside them. */
export function canMoveInto(
  tree: DriveTree,
  folderIds: readonly string[],
  target: Place
): boolean {
  return folderIds.every(
    (id) =>
      id !== target &&
      !foldersWithin(tree, id).some((folder) => folder._id === target)
  );
}

// ———————————————————————————————————————— Kinds of files

export type FileKind =
  | "image"
  | "video"
  | "audio"
  | "pdf"
  | "doc"
  | "sheet"
  | "slides"
  | "archive"
  | "code"
  | "text"
  | "design"
  | "file";

const BY_EXTENSION: Record<string, FileKind> = {};
for (const [kind, list] of [
  ["image", "png jpg jpeg gif webp avif svg heic heif bmp ico tif tiff"],
  ["video", "mp4 mov webm mkv avi m4v mpg mpeg ogv 3gp"],
  ["audio", "mp3 wav ogg oga m4a flac aac opus aiff"],
  ["pdf", "pdf"],
  ["doc", "doc docx odt rtf pages"],
  ["sheet", "xls xlsx xlsm ods csv tsv numbers"],
  ["slides", "ppt pptx odp key"],
  ["archive", "zip rar 7z tar gz tgz bz2 xz"],
  [
    "code",
    "js jsx mjs cjs ts tsx json html htm css scss less py rb go rs java kt swift c h cpp hpp cs php sh bash zsh ps1 yml yaml toml xml sql vue svelte graphql",
  ],
  ["text", "txt md markdown log ini cfg conf env"],
  ["design", "fig sketch psd ai xd indd"],
] as const) {
  for (const extension of list.split(" ")) {
    BY_EXTENSION[extension] = kind;
  }
}

/** The extension in lowercase, without its dot; empty when there's none. */
export function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

/** What kind of file it is, for its icon and preview: by extension, then by MIME type. */
export function fileKind(file: { name: string; type: string }): FileKind {
  const byName = BY_EXTENSION[extensionOf(file.name)];
  if (byName) {
    return byName;
  }
  const { type } = file;
  for (const kind of ["image", "video", "audio"] as const) {
    if (type.startsWith(`${kind}/`)) {
      return kind;
    }
  }
  if (type === "application/pdf") {
    return "pdf";
  }
  if (/zip|compressed|tar|rar/u.test(type)) {
    return "archive";
  }
  if (/json|javascript|xml/u.test(type)) {
    return "code";
  }
  return type.startsWith("text/") ? "text" : "file";
}

/** What people call the kind, for lists and details. */
export const KIND_LABELS: Record<FileKind, string> = {
  archive: "Archive",
  audio: "Audio",
  code: "Code",
  design: "Design",
  doc: "Document",
  file: "File",
  image: "Image",
  pdf: "PDF",
  sheet: "Spreadsheet",
  slides: "Presentation",
  text: "Text",
  video: "Video",
};

const TYPES: Record<string, string> = {
  aac: "audio/aac",
  avif: "image/avif",
  csv: "text/csv",
  flac: "audio/flac",
  heic: "image/heic",
  heif: "image/heif",
  json: "application/json",
  m4a: "audio/mp4",
  m4v: "video/mp4",
  md: "text/markdown",
  mkv: "video/x-matroska",
  mov: "video/quicktime",
  mp3: "audio/mpeg",
  mp4: "video/mp4",
  ogg: "audio/ogg",
  opus: "audio/opus",
  pdf: "application/pdf",
  svg: "image/svg+xml",
  tsv: "text/tab-separated-values",
  txt: "text/plain",
  wav: "audio/wav",
  webm: "video/webm",
  webp: "image/webp",
  yaml: "text/yaml",
  yml: "text/yaml",
};

/**
 * The file's MIME type, guessed from its extension when the browser didn't
 * know it, so R2 serves videos and PDFs in a way they open in place.
 */
export function typeOf(file: File): string {
  return file.type || TYPES[extensionOf(file.name)] || "";
}

/** How the app shows a file, if it can. */
export type Preview = "image" | "video" | "audio" | "pdf" | "text" | "table";

/** Texts read in place up to this size; bigger ones are only downloaded. */
export const MAX_TEXT_PREVIEW = 2 * 1024 * 1024;

export function previewOf(file: DriveFile): Preview | undefined {
  const kind = fileKind(file);
  const extension = extensionOf(file.name);
  if (kind === "image" || kind === "video" || kind === "audio") {
    return kind;
  }
  if (kind === "pdf") {
    return "pdf";
  }
  if (file.size > MAX_TEXT_PREVIEW) {
    return undefined;
  }
  if (extension === "csv" || extension === "tsv") {
    return "table";
  }
  return kind === "code" || kind === "text" ? "text" : undefined;
}

/** "0:42", "12:05" or "1:02:03". */
export function formatDuration(seconds: number): string {
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = String(total % 60).padStart(2, "0");
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}`
    : `${minutes}:${rest}`;
}

// ———————————————————————————————————————— Order

export const SORTS = [
  { label: "Name", value: "name" },
  { label: "Last changed", value: "updated" },
  { label: "Size", value: "size" },
  { label: "Kind", value: "kind" },
] as const;

export type SortKey = (typeof SORTS)[number]["value"];

export interface Sort {
  key: SortKey;
  /** Smallest, oldest or A first. */
  ascending: boolean;
}

export const DEFAULT_SORT: Sort = { ascending: true, key: "name" };

/** Files in the order picked; ties fall back to their names. */
export function sortFiles<T extends DriveFile>(files: T[], sort: Sort): T[] {
  const direction = sort.ascending ? 1 : -1;
  const by = (a: DriveFile, b: DriveFile): number => {
    if (sort.key === "updated") {
      return a.updatedAt - b.updatedAt;
    }
    if (sort.key === "size") {
      return a.size - b.size;
    }
    if (sort.key === "kind") {
      return compareNames(KIND_LABELS[fileKind(a)], KIND_LABELS[fileKind(b)]);
    }
    return 0;
  };
  return files.toSorted(
    (a, b) => direction * (by(a, b) || compareNames(a.name, b.name))
  );
}

/** Folders by name, or by when they changed; by size or kind they're all alike, so A first. */
export function sortFolders<T extends DriveFolder>(
  folders: T[],
  sort: Sort
): T[] {
  const ordered = sort.key === "name" || sort.key === "updated";
  const direction = ordered && !sort.ascending ? -1 : 1;
  return folders.toSorted(
    (a, b) =>
      direction *
      ((sort.key === "updated" ? a.updatedAt - b.updatedAt : 0) ||
        compareNames(a.name, b.name))
  );
}
