import type { DragEvent } from "react";
import { useState } from "react";

/** Whether a drag carries files, rather than text or a link. */
function draggingFiles(event: DragEvent): boolean {
  return event.dataTransfer.types.includes("Files");
}

/** The tint of a place that takes the files dragged over it. */
export const DROP_TARGET = "bg-primary/5 ring-2 ring-primary/40";

/**
 * Takes files dropped on an element: spread `handlers` on it, and show it
 * with `DROP_TARGET` while files are `over` it.
 */
export function useFileDrop(onFiles: (files: File[]) => void) {
  const [over, setOver] = useState(false);
  const handlers = {
    onDragLeave: (event: DragEvent) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node)) {
        setOver(false);
      }
    },
    onDragOver: (event: DragEvent) => {
      if (draggingFiles(event)) {
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        setOver(true);
      }
    },
    onDrop: (event: DragEvent) => {
      if (!draggingFiles(event)) {
        return;
      }
      setOver(false);
      // Taken already by something inside, like a text editor putting images in.
      if (!event.defaultPrevented) {
        event.preventDefault();
        onFiles([...event.dataTransfer.files]);
      }
    },
  };
  return { handlers, over };
}
