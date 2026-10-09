import type { Id } from "@convex/_generated/dataModel";
import { createContext, use } from "react";

import type { DriveFile, DriveFolder, DriveTree } from "@/lib/drive";
import type { Items } from "@/lib/drive-actions";
import type { Destination } from "@/lib/drive-upload";
import type { Project } from "@/lib/project";

/** When something went in the trash, and who put it there. */
export interface Trashed {
  at: number;
  by?: Id<"users">;
}

/** Something listed in the Drive: a folder or a file, trashed ones with when and by whom. */
export type Entry =
  | { kind: "folder"; folder: DriveFolder; trashed?: Trashed }
  | { kind: "file"; file: DriveFile; trashed?: Trashed };

export function entryId(entry: Entry): string {
  return entry.kind === "folder" ? entry.folder._id : entry.file._id;
}

export function entryName(entry: Entry): string {
  return entry.kind === "folder" ? entry.folder.name : entry.file.name;
}

/** The entries as ids, files and folders apart, for the server. */
export function itemsOf(entries: readonly Entry[]): Items {
  return {
    fileIds: entries.flatMap((entry) =>
      entry.kind === "file" ? [entry.file._id] : []
    ),
    folderIds: entries.flatMap((entry) =>
      entry.kind === "folder" ? [entry.folder._id] : []
    ),
  };
}

/** What the listing does to its entries, which the page carries out. */
export interface DriveActions {
  open: (entry: Entry) => void;
  rename: (entry: Entry) => void;
  move: (entries: Entry[]) => void;
  style: (folder: DriveFolder) => void;
  star: (entries: Entry[], starred: boolean) => void;
  trash: (entries: Entry[]) => void;
  download: (files: DriveFile[]) => void;
  copyLink: (entry: Entry) => void;
  restore: (entries: Entry[]) => void;
  purge: (entries: Entry[]) => void;
  newFolder: () => void;
  pickFiles: () => void;
}

export interface DriveContextValue {
  project: Project;
  tree: DriveTree;
  me: Id<"users">;
  /** Whether the person may add to the Drive and change what's in it. */
  canEdit: boolean;
  /** Whether the person owns the project, and may delete anyone's files. */
  isOwner: boolean;
  starred: (id: string) => boolean;
  /** Where uploads into the folder go. */
  destination: (folderId?: Id<"driveFolders">) => Destination;
  actions: DriveActions;
}

export const DriveContext = createContext<DriveContextValue | null>(null);

export function useDrive(): DriveContextValue {
  const value = use(DriveContext);
  if (!value) {
    throw new Error("useDrive needs a DriveContext provider.");
  }
  return value;
}

/** Owners can delete anything; editors only what they added. The server also checks what's inside folders. */
export function mayTrash(drive: DriveContextValue, entry: Entry): boolean {
  if (drive.isOwner) {
    return true;
  }
  const addedBy =
    entry.kind === "folder" ? entry.folder.createdBy : entry.file.uploadedBy;
  return drive.canEdit && addedBy === drive.me;
}

/** Owners can restore anything; others what they deleted themselves. */
export function mayRestore(drive: DriveContextValue, entry: Entry): boolean {
  return drive.isOwner || (drive.canEdit && entry.trashed?.by === drive.me);
}
