import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { OptimisticLocalStore } from "convex/browser";
import { toast } from "sonner";

import { run } from "@/lib/actions";
import { convex } from "@/lib/convex";
import type { DriveFile, DriveFolder } from "@/lib/drive";
import type { Color } from "@/lib/palette";
import { plural } from "@/lib/utils";

type ProjectId = Id<"projects">;
type FileId = Id<"driveFiles">;
type FolderId = Id<"driveFolders">;

/** Files and folders acted on together, like a selection. */
export interface Items {
  fileIds: FileId[];
  folderIds: FolderId[];
}

export function countItems({ fileIds, folderIds }: Items): string {
  if (folderIds.length === 0) {
    return plural(fileIds.length, "file");
  }
  if (fileIds.length === 0) {
    return plural(folderIds.length, "folder");
  }
  return plural(fileIds.length + folderIds.length, "item");
}

function patchTree(
  store: OptimisticLocalStore,
  patch: (folders: DriveFolder[]) => DriveFolder[]
): void {
  const folders = store.getQuery(api.drive.tree, {});
  if (folders) {
    store.setQuery(api.drive.tree, {}, patch(folders));
  }
}

/** Changes the files of every folder already loaded. */
function patchContents(
  store: OptimisticLocalStore,
  patch: (files: DriveFile[], folderId: FolderId | undefined) => DriveFile[]
): void {
  for (const { args, value } of store.getAllQueries(api.drive.contents)) {
    if (value) {
      store.setQuery(api.drive.contents, args, {
        ...value,
        files: patch(value.files, args.folderId),
      });
    }
  }
}

/** The folders and everything inside them, by id, as far as the tree knows. */
function withInside(folders: DriveFolder[], ids: Set<string>): Set<string> {
  const all = new Set(ids);
  for (let grew = true; grew;) {
    grew = false;
    for (const folder of folders) {
      if (folder.parentId && all.has(folder.parentId) && !all.has(folder._id)) {
        all.add(folder._id);
        grew = true;
      }
    }
  }
  return all;
}

/** Starts a folder, and resolves with it once the server made it. */
export function createFolder(
  projectId: ProjectId,
  parentId?: FolderId,
  name?: string
) {
  return run(
    convex.mutation(api.drive.createFolder, { name, parentId, projectId })
  );
}

export function renameFile(file: Pick<DriveFile, "_id">, name: string) {
  return run(
    convex.mutation(
      api.drive.renameFile,
      { fileId: file._id, name },
      {
        optimisticUpdate: (store) =>
          patchContents(store, (files) =>
            files.map((item) =>
              item._id === file._id ? { ...item, name: name.trim() } : item
            )
          ),
      }
    )
  );
}

export function updateFolder(
  folder: Pick<DriveFolder, "_id">,
  changes: { name?: string; color?: Color | null; icon?: string | null }
) {
  return run(
    convex.mutation(
      api.drive.updateFolder,
      { folderId: folder._id, ...changes },
      {
        optimisticUpdate: (store) =>
          patchTree(store, (folders) =>
            folders.map((item) =>
              item._id === folder._id
                ? {
                    ...item,
                    color:
                      changes.color === undefined
                        ? item.color
                        : (changes.color ?? undefined),
                    icon:
                      changes.icon === undefined
                        ? item.icon
                        : changes.icon || undefined,
                    name: changes.name?.trim() || item.name,
                  }
                : item
            )
          ),
      }
    )
  );
}

/** Moves files and folders into a folder, or to the top of the Drive. */
export function moveItems(
  projectId: ProjectId,
  items: Items,
  to: FolderId | undefined
) {
  const files = new Set<string>(items.fileIds);
  const folders = new Set<string>(items.folderIds);
  return run(
    convex.mutation(
      api.drive.move,
      { ...items, projectId, to: to ?? null },
      {
        optimisticUpdate: (store) => {
          patchTree(store, (list) =>
            list.map((folder) =>
              folders.has(folder._id) ? { ...folder, parentId: to } : folder
            )
          );
          const moving: DriveFile[] = [];
          for (const { value } of store.getAllQueries(api.drive.contents)) {
            moving.push(
              ...(value?.files.filter((file) => files.has(file._id)) ?? [])
            );
          }
          patchContents(store, (list, folderId) => {
            const others = list.filter((file) => !files.has(file._id));
            return folderId === to
              ? [
                  ...others,
                  ...moving.map((file) => ({ ...file, folderId: to })),
                ]
              : others;
          });
        },
      }
    )
  );
}

export function restoreItems(projectId: ProjectId, items: Items) {
  const gone = new Set<string>([...items.fileIds, ...items.folderIds]);
  return run(
    convex.mutation(
      api.drive.restore,
      { ...items, projectId },
      {
        optimisticUpdate: (store) => {
          const trash = store.getQuery(api.drive.trashed, { projectId });
          if (trash) {
            store.setQuery(
              api.drive.trashed,
              { projectId },
              {
                files: trash.files.filter((file) => !gone.has(file._id)),
                folders: trash.folders.filter(
                  (folder) => !gone.has(folder._id)
                ),
              }
            );
          }
        },
      }
    )
  );
}

/** Puts files and folders in the trash, with a toast to take it back. */
export async function trashItems(projectId: ProjectId, items: Items) {
  const files = new Set<string>(items.fileIds);
  const done = await run(
    convex.mutation(
      api.drive.trash,
      { ...items, projectId },
      {
        optimisticUpdate: (store) => {
          const tree = store.getQuery(api.drive.tree, {}) ?? [];
          const folders = withInside(tree, new Set(items.folderIds));
          patchTree(store, (list) =>
            list.filter((folder) => !folders.has(folder._id))
          );
          patchContents(store, (list) =>
            list.filter((file) => !files.has(file._id))
          );
        },
      }
    )
  );
  if (done !== undefined) {
    toast.success(`${countItems(items)} moved to the trash`, {
      action: {
        label: "Undo",
        onClick: () => restoreItems(projectId, items),
      },
    });
  }
}

function clearFromTrash(
  store: OptimisticLocalStore,
  projectId: ProjectId,
  keep: (id: string) => boolean
): void {
  const trash = store.getQuery(api.drive.trashed, { projectId });
  if (trash) {
    store.setQuery(
      api.drive.trashed,
      { projectId },
      {
        files: trash.files.filter((file) => keep(file._id)),
        folders: trash.folders.filter((folder) => keep(folder._id)),
      }
    );
  }
}

/** Deletes trashed files and folders for good. */
export function purgeItems(projectId: ProjectId, items: Items) {
  const gone = new Set<string>([...items.fileIds, ...items.folderIds]);
  return run(
    convex.mutation(
      api.drive.purge,
      { ...items, projectId },
      {
        optimisticUpdate: (store) =>
          clearFromTrash(store, projectId, (id) => !gone.has(id)),
      }
    )
  );
}

export function emptyTrash(projectId: ProjectId) {
  return run(
    convex.mutation(
      api.drive.emptyTrash,
      { projectId },
      {
        optimisticUpdate: (store) =>
          clearFromTrash(store, projectId, () => false),
      }
    )
  );
}

/** The ids with `id` in them or out of them. */
function toggled<T extends string>(ids: T[], id: T, on: boolean): T[] {
  const rest = ids.filter((other) => other !== id);
  return on ? [...rest, id] : rest;
}

export function setStarred(
  projectId: ProjectId,
  item: { fileId: FileId } | { folderId: FolderId },
  starred: boolean
) {
  return run(
    convex.mutation(
      api.drive.star,
      { ...item, starred },
      {
        optimisticUpdate: (store) => {
          const stars = store.getQuery(api.drive.stars, { projectId });
          if (!stars) {
            return;
          }
          store.setQuery(
            api.drive.stars,
            { projectId },
            {
              fileIds:
                "fileId" in item
                  ? toggled(stars.fileIds, item.fileId, starred)
                  : stars.fileIds,
              folderIds:
                "folderId" in item
                  ? toggled(stars.folderIds, item.folderId, starred)
                  : stars.folderIds,
            }
          );
        },
      }
    )
  );
}

/** Browsers take downloads started together better a little apart. */
const DOWNLOAD_GAP = 400;

function save(url: string): void {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.rel = "noopener";
  anchor.click();
}

function downloadLink(file: Pick<DriveFile, "_id">) {
  return run(
    convex.mutation(api.drive.link, { download: true, fileId: file._id })
  );
}

/** Saves the file under the name it has now, which its own link may not. */
export async function downloadFile(file: Pick<DriveFile, "_id">) {
  const url = await downloadLink(file);
  if (url) {
    save(url);
  }
}

/** Saves several files, one after the other, so the browser takes each. */
export async function downloadFiles(files: Pick<DriveFile, "_id">[]) {
  const urls = await Promise.all(files.map(downloadLink));
  for (const [index, url] of urls.entries()) {
    if (url) {
      setTimeout(() => save(url), index * DOWNLOAD_GAP);
    }
  }
}

/** Notes the file was opened, for the person's recent files; nothing to tell if it can't be. */
export async function markOpened(fileId: FileId): Promise<void> {
  try {
    await convex.mutation(api.drive.opened, { fileId });
  } catch {
    // Recent files just won't list it.
  }
}

export function addFileComment(fileId: FileId, content: string) {
  return run(convex.mutation(api.drive.comment, { content, fileId }));
}

export function deleteFileComment(commentId: Id<"driveComments">) {
  return run(
    convex.mutation(
      api.drive.removeComment,
      { commentId },
      {
        optimisticUpdate: (store) => {
          for (const { args, value } of store.getAllQueries(
            api.drive.activity
          )) {
            if (value) {
              store.setQuery(
                api.drive.activity,
                args,
                value.filter((entry) => entry._id !== commentId)
              );
            }
          }
        },
      }
    )
  );
}
