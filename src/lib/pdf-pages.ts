import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
// oxlint-disable-next-line import/default -- Vite's ?url imports export the asset's address
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc = workerUrl;

/** Pages drawn of a long PDF; the rest are for opening it whole. */
export const MAX_PAGES = 12;

/** A PDF read from its bytes, to draw its pages. Close it once it's no longer shown. */
export async function openPdf(
  data: ArrayBuffer
): Promise<{ pdf: PDFDocumentProxy; close: () => void }> {
  const task = getDocument({ data: new Uint8Array(data) });
  const close = () => {
    task.destroy();
  };
  try {
    return { close, pdf: await task.promise };
  } catch (error) {
    close();
    throw error;
  }
}

/** The drawing each canvas is busy with: PDF.js draws one at a time on a canvas. */
const drawing = new WeakMap<HTMLCanvasElement, Promise<void>>();

/**
 * Draws one page `width` CSS pixels wide, sharp on the screen it's on, once
 * the canvas is done with any page drawn before. Canceling stops it.
 */
export function drawPage(
  pdf: PDFDocumentProxy,
  number: number,
  canvas: HTMLCanvasElement,
  width: number
): { cancel: () => void } {
  let canceled = false;
  let task: RenderTask | undefined;
  const draw = async () => {
    await drawing.get(canvas);
    const page = await pdf.getPage(number);
    if (canceled) {
      return;
    }
    const base = page.getViewport({ scale: 1 });
    const ratio = Math.min(devicePixelRatio || 1, 2);
    const viewport = page.getViewport({ scale: (width / base.width) * ratio });
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    canvas.style.aspectRatio = `${base.width} / ${base.height}`;
    task = page.render({ canvas, viewport });
    await task.promise;
  };
  const settle = async () => {
    try {
      await draw();
    } catch {
      // Canceled, or the document closed meanwhile: the page stays as it was.
    }
  };
  drawing.set(canvas, settle());
  return {
    cancel: () => {
      canceled = true;
      task?.cancel();
    },
  };
}
