import { Extension } from "@tiptap/core";
import { Fragment, Slice } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { toast } from "sonner";

import { isImage, uploadFile } from "@/lib/upload";
import { errorMessage } from "@/lib/utils";

/** Marks the change that puts an uploaded image in, so editors can save it. */
export const IMAGE_UPLOAD_META = "imageUpload";

/** Uploads one image, saying how it goes; resolves with its address once uploaded. */
async function upload(file: File): Promise<string | undefined> {
  const toastId = toast.loading(`Uploading ${file.name}…`);
  try {
    const { url } = await uploadFile(file);
    toast.dismiss(toastId);
    return url;
  } catch (error) {
    toast.error(errorMessage(error), { id: toastId });
    return undefined;
  }
}

/** Uploads the images to R2 and puts them in the text, at `pos` or the cursor. */
export async function insertImages(
  view: EditorView,
  files: File[],
  pos?: number
): Promise<void> {
  const urls = await Promise.all(files.map(upload));
  const { image } = view.state.schema.nodes;
  if (view.isDestroyed || !image) {
    return;
  }
  const nodes = urls.flatMap((url, index) =>
    url
      ? [
          image.create({
            alt: files[index]?.name.replace(/\.[^.]+$/u, "") ?? "",
            src: url,
          }),
        ]
      : []
  );
  if (nodes.length === 0) {
    return;
  }
  const { tr } = view.state;
  if (pos !== undefined && pos <= tr.doc.content.size) {
    tr.insert(pos, nodes);
  } else {
    tr.replaceSelection(new Slice(Fragment.from(nodes), 0, 0));
  }
  view.dispatch(tr.setMeta(IMAGE_UPLOAD_META, true).scrollIntoView());
}

/** Asks for image files and puts them in at the cursor. */
export function pickImages(view: EditorView): void {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.multiple = true;
  input.addEventListener("change", () => {
    insertImages(view, [...(input.files ?? [])].filter(isImage));
  });
  input.click();
}

/** Images pasted or dropped into the text are uploaded and shown in place. */
export const ImageUpload = Extension.create({
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("imageUpload"),
        props: {
          handleDrop: (view, event, _slice, moved) => {
            const files = [...(event.dataTransfer?.files ?? [])].filter(
              isImage
            );
            if (moved || files.length === 0 || !view.editable) {
              return false;
            }
            event.preventDefault();
            const pos = view.posAtCoords({
              left: event.clientX,
              top: event.clientY,
            })?.pos;
            insertImages(view, files, pos);
            return true;
          },
          handlePaste: (view, event) => {
            const files = [...(event.clipboardData?.files ?? [])].filter(
              isImage
            );
            if (files.length === 0 || !view.editable) {
              return false;
            }
            event.preventDefault();
            insertImages(view, files);
            return true;
          },
        },
      }),
    ];
  },
  name: "imageUpload",
  // Ahead of the markdown paste, which would take the file's name as text.
  priority: 102,
});
