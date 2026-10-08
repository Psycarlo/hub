import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { discardUpload } from "@/lib/actions";
import type { Upload } from "@/lib/upload";
import { uploadable, uploadAttachment } from "@/lib/upload";
import { errorMessage } from "@/lib/utils";

export interface DraftFile {
  id: string;
  name: string;
  type: string;
  /** Set once the file is uploaded. */
  upload?: Upload;
}

/**
 * Files to send with a comment, uploaded as soon as they're picked. Those not
 * sent in the end, taken out or left behind, are deleted again.
 */
export function useDraftFiles(limit: number) {
  const [files, setFiles] = useState<DraftFile[]>([]);
  // Uploads not yet sent, by draft: their keys, or undefined while uploading.
  const unsent = useRef(new Map<string, string | undefined>());

  useEffect(() => {
    const uploads = unsent.current;
    return () => {
      for (const key of uploads.values()) {
        if (key) {
          discardUpload(key);
        }
      }
      uploads.clear();
    };
  }, []);

  const without = (ids: Set<string>) =>
    setFiles((current) => current.filter((file) => !ids.has(file.id)));

  const upload = async (id: string, file: File) => {
    try {
      const done = await uploadAttachment(file);
      if (!unsent.current.has(id)) {
        // Taken out, or left behind, while it uploaded.
        discardUpload(done.key);
        return;
      }
      unsent.current.set(id, done.key);
      setFiles((current) =>
        current.map((item) =>
          item.id === id ? { ...item, upload: done } : item
        )
      );
    } catch (error) {
      unsent.current.delete(id);
      without(new Set([id]));
      toast.error(errorMessage(error));
    }
  };

  const add = (picked: File[]) => {
    const fitting = uploadable(picked);
    const room = Math.max(0, limit - unsent.current.size);
    if (fitting.length > room) {
      toast.error(`A comment can carry up to ${limit} files.`);
    }
    const added = fitting.slice(0, room).map((file) => ({
      file,
      id: crypto.randomUUID(),
    }));
    setFiles((current) => [
      ...current,
      ...added.map(({ file, id }) => ({
        id,
        name: file.name,
        type: file.type,
      })),
    ]);
    for (const { file, id } of added) {
      unsent.current.set(id, undefined);
      upload(id, file);
    }
  };

  const remove = (id: string) => {
    const key = unsent.current.get(id);
    unsent.current.delete(id);
    if (key) {
      discardUpload(key);
    }
    without(new Set([id]));
  };

  /** The files went out with a comment: they're its now, not drafts. */
  const sent = (ids: string[]) => {
    for (const id of ids) {
      unsent.current.delete(id);
    }
    without(new Set(ids));
  };

  return { add, files, remove, sent };
}
