import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";

import type { DriveView } from "@/features/drive/drive-context";
import type { Entry } from "@/features/drive/drive-state";
import type { DriveFile, DriveFolder, DriveTree, Sort } from "@/lib/drive";
import { sortFiles, sortFolders, TOP } from "@/lib/drive";

const NO_FOLDERS: DriveFolder[] = [];
const NO_FILES: DriveFile[] = [];

function fileEntry(file: DriveFile): Entry {
  return { file, kind: "file" };
}

function folderEntry(folder: DriveFolder): Entry {
  return { folder, kind: "folder" };
}

/** Folders, then files, each in the order picked. */
function listed(
  folders: DriveFolder[],
  files: DriveFile[],
  sort: Sort
): Entry[] {
  return [
    ...sortFolders(folders, sort).map(folderEntry),
    ...sortFiles(files, sort).map(fileEntry),
  ];
}

function useTrash(projectId: Id<"projects">, wanted: boolean) {
  return useQuery(api.drive.trashed, wanted ? { projectId } : "skip");
}

type Trash = NonNullable<ReturnType<typeof useTrash>>;

function trashed(trash: Trash | undefined, sort: Sort): Entry[] {
  return [
    ...sortFolders(trash?.folders ?? [], sort).map((folder): Entry => ({
      folder,
      kind: "folder",
      trashed: { at: folder.trashedAt, by: folder.trashedBy },
    })),
    ...sortFiles(trash?.files ?? [], sort).map((file): Entry => ({
      file,
      kind: "file",
      trashed: { at: file.trashedAt, by: file.trashedBy },
    })),
  ];
}

export interface DriveEntries {
  entries: Entry[];
  loading: boolean;
  /** How much each folder listed holds, while browsing folders. */
  counts?: Map<string, number>;
  /** The files of the folder shown, while browsing folders. */
  folderFiles?: DriveFile[];
  /** How many a search found, once it's done. */
  results?: number;
}

type Contents = FunctionReturnType<typeof api.drive.contents>;

/** A search: folders by name from the tree, files from the server. */
function searchEntries(
  tree: DriveTree,
  query: string,
  found: DriveFile[] | null | undefined,
  sort: Sort
): DriveEntries {
  const needle = query.toLowerCase();
  const folders = tree.folders.filter((folder) =>
    folder.name.toLowerCase().includes(needle)
  );
  const entries = listed(folders, found ?? NO_FILES, sort);
  return {
    entries,
    loading: found === undefined,
    results: found ? entries.length : undefined,
  };
}

/** A folder, or the top of the Drive: its folders from the tree, its files from the server. */
function folderEntries(
  tree: DriveTree,
  folderId: Id<"driveFolders"> | undefined,
  contents: Contents | undefined,
  sort: Sort
): DriveEntries {
  return {
    counts: new Map(
      contents?.counts.map(({ folderId: id, count }) => [id, count])
    ),
    entries: listed(
      tree.children.get(folderId ?? TOP) ?? NO_FOLDERS,
      contents?.files ?? NO_FILES,
      sort
    ),
    folderFiles: contents?.files,
    loading: contents === undefined,
  };
}

/**
 * What the Drive lists: a folder's contents, a search across it, recent or
 * starred files, or the trash. Only the query for what's shown runs.
 */
export function useDriveEntries({
  projectId,
  tree,
  folderId,
  view,
  query,
  sort,
  starred,
}: {
  projectId: Id<"projects">;
  tree: DriveTree;
  folderId?: Id<"driveFolders">;
  view?: DriveView;
  /** Text searched for across the Drive; empty when not searching. */
  query: string;
  sort: Sort;
  starred: ReadonlySet<string>;
}): DriveEntries {
  const shown = query ? "search" : (view ?? "files");
  const contents = useQuery(
    api.drive.contents,
    shown === "files" ? { folderId, projectId } : "skip"
  );
  const recent = useQuery(
    api.drive.recent,
    shown === "recent" ? { projectId } : "skip"
  );
  const starredFiles = useQuery(
    api.drive.starredFiles,
    shown === "starred" ? { projectId } : "skip"
  );
  const trash = useTrash(projectId, shown === "trash");
  const found = useQuery(
    api.drive.search,
    shown === "search" ? { projectId, text: query } : "skip"
  );

  switch (shown) {
    case "search": {
      return searchEntries(tree, query, found, sort);
    }
    case "recent": {
      return {
        entries: (recent ?? NO_FILES).map(fileEntry),
        loading: recent === undefined,
      };
    }
    case "starred": {
      return {
        entries: listed(
          tree.folders.filter((folder) => starred.has(folder._id)),
          starredFiles ?? NO_FILES,
          sort
        ),
        loading: starredFiles === undefined,
      };
    }
    case "trash": {
      return {
        entries: trashed(trash ?? undefined, sort),
        loading: trash === undefined,
      };
    }
    default: {
      return folderEntries(tree, folderId, contents ?? undefined, sort);
    }
  }
}
