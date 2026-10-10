import { api } from "@convex/_generated/api";
import type { EntryFile } from "@convex/finance";
import { cn } from "cn";
import {
  CircleAlertIcon,
  ExternalLinkIcon,
  PaperclipIcon,
  PlusIcon,
  RotateCcwIcon,
  SparklesIcon,
  XIcon,
} from "lucide-react";
import { motion } from "motion/react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import { IconButton } from "@/components/icon-button";
import { FluidTooltip } from "@/components/ui/fluid-tooltip";
import { Spinner } from "@/components/ui/spinner";
import { DROP_TARGET } from "@/features/card/use-file-drop";
import { FileIcon } from "@/features/drive/file-icon";
import { run } from "@/lib/actions";
import { convex } from "@/lib/convex";
import { fileKind } from "@/lib/drive";
import { MAX_ENTRY_FILES } from "@/lib/finance";
import type { InvoiceJob } from "@/lib/invoice-jobs";
import { formatBytes } from "@/lib/utils";

export type { EntryFile } from "@convex/finance";

/** A file in the entry form: one the entry keeps already, or one on its way to it. */
export type FormFile =
  | { kind: "kept"; file: EntryFile }
  | { kind: "new"; job: InvoiceJob };

export function formFileId(item: FormFile): string {
  return item.kind === "kept" ? item.file._id : item.job.id;
}

function detailsOf(item: FormFile): { name: string; type: string } {
  return item.kind === "kept" ? item.file : item.job;
}

/** What a model can read: a PDF or a picture. */
export function isReadable(item: FormFile): boolean {
  const kind = fileKind(detailsOf(item));
  return kind === "pdf" || kind === "image";
}

/** Formats people pick invoices and receipts in. */
export const INVOICE_TYPES = "application/pdf,image/*";

/**
 * Where to load a file from: its own copy while it's new, its address once
 * kept, or, for a kept PDF that's fetched to be drawn, a short-lived link
 * straight to R2. Undefined while that link comes; null if it can't.
 */
function useSource(
  item: FormFile,
  fetched: boolean
): string | null | undefined {
  const fileId = item.kind === "kept" ? item.file._id : undefined;
  const [link, setLink] = useState<{ id: string; url: string | null }>();
  useEffect(() => {
    if (!(fileId && fetched)) {
      return;
    }
    let current = true;
    const load = async () => {
      const url = await run(
        convex.mutation(api.finance.fileLink, { download: false, fileId })
      );
      if (current) {
        setLink({ id: fileId, url: url ?? null });
      }
    };
    load();
    return () => {
      current = false;
    };
  }, [fileId, fetched]);
  if (item.kind === "new") {
    return item.job.url;
  }
  if (!fetched) {
    return item.file.url;
  }
  return link?.id === item.file._id ? link.url : undefined;
}

/** Draws a page once PDF.js has loaded, unless stopped first. Returns the way to stop. */
function drawLater(
  pdf: PDFDocumentProxy,
  number: number,
  canvas: HTMLCanvasElement,
  width: number
): () => void {
  let stopped = false;
  let drawing: { cancel: () => void } | undefined;
  const start = async () => {
    const { drawPage } = await import("@/lib/pdf-pages");
    if (!stopped) {
      drawing = drawPage(pdf, number, canvas, width);
    }
  };
  start();
  return () => {
    stopped = true;
    drawing?.cancel();
  };
}

/**
 * Fetches a PDF and opens it, with how many of its pages to draw. PDF.js is
 * big, so it's only loaded once there's a PDF to show.
 */
async function loadPdf(src: string) {
  const response = await fetch(src);
  if (!response.ok) {
    throw new Error("Can’t load it");
  }
  const { MAX_PAGES, openPdf } = await import("@/lib/pdf-pages");
  const { close, pdf } = await openPdf(await response.arrayBuffer());
  return { close, pages: Math.min(pdf.numPages, MAX_PAGES), pdf };
}

/** One page drawn to fit the width it's given, again whenever that changes. */
function PdfPage({
  pdf,
  number,
  width,
}: {
  pdf: PDFDocumentProxy;
  number: number;
  width: number;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const target = canvas.current;
    if (!(target && width > 0)) {
      return;
    }
    return drawLater(pdf, number, target, width);
  }, [pdf, number, width]);
  return (
    <canvas
      aria-label={`Page ${number}`}
      className="image-outline block w-full rounded-md bg-white shadow-sm"
      ref={canvas}
    />
  );
}

/** Width steps pages are drawn at, so a dialog growing doesn't draw them again at every pixel. */
const WIDTH_STEP = 32;

/** Every page of a PDF, one under another, as wide as there's room for; `fallback` if it won't open. */
function PdfPages({ src, fallback }: { src: string; fallback: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState<{
    pdf: PDFDocumentProxy;
    pages: number;
  }>();
  const [failed, setFailed] = useState(false);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    let current = true;
    let close: (() => void) | undefined;
    const load = async () => {
      try {
        const opened = await loadPdf(src);
        ({ close } = opened);
        if (current) {
          setLoaded(opened);
        } else {
          close();
        }
      } catch {
        if (current) {
          setFailed(true);
        }
      }
    };
    load();
    return () => {
      current = false;
      close?.();
    };
  }, [src]);

  useEffect(() => {
    const element = box.current;
    if (!element) {
      return;
    }
    const observer = new ResizeObserver(([entry]) => {
      const inner = entry?.contentRect.width ?? 0;
      setWidth(
        Math.max(WIDTH_STEP, Math.ceil(inner / WIDTH_STEP) * WIDTH_STEP)
      );
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  if (failed) {
    return fallback;
  }
  return (
    <div className="flex flex-col gap-3" ref={box}>
      {loaded ? (
        Array.from({ length: loaded.pages }, (_, index) => (
          <PdfPage
            // oxlint-disable-next-line react/no-array-index-key -- pages keep their order
            key={index}
            number={index + 1}
            pdf={loaded.pdf}
            width={width}
          />
        ))
      ) : (
        <div className="grid aspect-[1/1.414] w-full place-items-center rounded-md bg-white/60 dark:bg-white/5">
          <Spinner className="text-muted-foreground" />
        </div>
      )}
    </div>
  );
}

/** The file's icon, name and size, for files with no preview, or none that loaded. */
function NoPreview({ item, note }: { item: FormFile; note: string }) {
  const { name } = detailsOf(item);
  const size = item.kind === "kept" ? item.file.size : item.job.size;
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <FileIcon file={detailsOf(item)} size="xl" />
      <div className="flex max-w-60 flex-col gap-0.5">
        <p className="font-medium wrap-break-word">{name}</p>
        <p className="text-muted-foreground text-xs">
          {formatBytes(size)} · {note}
        </p>
      </div>
    </div>
  );
}

/** A file as large as its pane allows: its pages, its picture, or its icon. */
function Preview({ item }: { item: FormFile }) {
  const kind = fileKind(detailsOf(item));
  const source = useSource(item, kind === "pdf");
  // Keyed by the file where it's shown, so a picture that won't load is forgotten with it.
  const [broken, setBroken] = useState(false);
  if (kind !== "pdf" && kind !== "image") {
    return <NoPreview item={item} note="No preview for this kind of file" />;
  }
  if (broken || source === null) {
    return <NoPreview item={item} note="Couldn’t show it here" />;
  }
  if (source === undefined) {
    return (
      <div className="grid h-full place-items-center">
        <Spinner className="text-muted-foreground" />
      </div>
    );
  }
  if (kind === "pdf") {
    return (
      <PdfPages
        fallback={<NoPreview item={item} note="Couldn’t show it here" />}
        src={source}
      />
    );
  }
  return (
    <img
      alt={detailsOf(item).name}
      className="image-outline mx-auto block h-auto max-w-full rounded-md bg-white shadow-sm"
      onError={() => setBroken(true)}
      src={source}
    />
  );
}

/** Where a new file stands, said over its preview while it's not up yet. */
function JobState({ job }: { job: InvoiceJob }) {
  if (job.status === "uploading") {
    return (
      <span className="flex items-center gap-1.5">
        <Spinner className="size-3" />
        Uploading…
      </span>
    );
  }
  if (job.status === "failed") {
    return (
      <span className="text-destructive">{job.error ?? "Didn’t upload"}</span>
    );
  }
  return null;
}

/**
 * The file shown large, with its name and what can be done with it. While
 * it's `reading`, a band of light passes down it.
 */
export function FileViewer({
  item,
  reading,
  readable,
  onRead,
  onRemove,
}: {
  item: FormFile;
  reading: boolean;
  /** Offered to read in place of the file read so far. */
  readable: boolean;
  onRead: () => void;
  onRemove?: () => void;
}) {
  const { name } = detailsOf(item);
  const href = item.kind === "kept" ? item.file.url : item.job.url;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-11 shrink-0 items-center gap-2 pr-1.5 pl-3">
        <span
          className="min-w-0 flex-1 truncate text-sm font-medium"
          title={name}
        >
          {name}
        </span>
        {item.kind === "new" && (
          <span className="text-muted-foreground shrink-0 text-xs">
            <JobState job={item.job} />
          </span>
        )}
        <FluidTooltip.Group>
          <div className="flex shrink-0 items-center">
            {readable && (
              <IconButton
                disabled={reading}
                label="Read this file"
                onClick={onRead}
                type="button"
              >
                <SparklesIcon />
              </IconButton>
            )}
            <IconButton
              label="Open in a new tab"
              nativeButton={false}
              render={
                <a
                  aria-label="Open in a new tab"
                  href={href}
                  rel="noreferrer"
                  target="_blank"
                />
              }
            >
              <ExternalLinkIcon />
            </IconButton>
            {onRemove && (
              <IconButton label="Remove file" onClick={onRemove} type="button">
                <XIcon />
              </IconButton>
            )}
          </div>
        </FluidTooltip.Group>
      </header>
      <div className="relative min-h-0 flex-1">
        <div className="absolute inset-0 overflow-y-auto overscroll-contain px-3 pb-3">
          <Preview item={item} key={formFileId(item)} />
        </div>
        {reading && <div aria-hidden className="invoice-scan" />}
      </div>
    </div>
  );
}

/** A small picture of a file in the strip: its image, or its icon. */
function Thumb({ item }: { item: FormFile }) {
  const [broken, setBroken] = useState(false);
  const details = detailsOf(item);
  const url = item.kind === "kept" ? item.file.url : item.job.url;
  if (fileKind(details) === "image" && !broken) {
    return (
      <img
        alt=""
        className="size-full object-cover"
        onError={() => setBroken(true)}
        src={url}
      />
    );
  }
  return (
    <span className="grid size-full place-items-center">
      <FileIcon file={details} size="sm" />
    </span>
  );
}

const TILE =
  "relative size-12 shrink-0 overflow-hidden rounded-lg transition-[scale,box-shadow] duration-150 ease-out active:scale-[0.96]";

/** The entry's files side by side, to pick the one shown, take one out, or add more. */
export function FileStrip({
  items,
  selected,
  readId,
  onSelect,
  onRemove,
  onRetry,
  onAdd,
}: {
  items: FormFile[];
  selected?: string;
  /** The file read as the invoice. */
  readId?: string;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
  onAdd?: (files: File[]) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const room = MAX_ENTRY_FILES - items.length;
  return (
    <ul
      aria-label="Files"
      className="flex shrink-0 items-center gap-2 p-3 pt-0"
    >
      {items.map((item) => {
        const id = formFileId(item);
        const job = item.kind === "new" ? item.job : undefined;
        const { name } = detailsOf(item);
        return (
          <li className="group/thumb relative" key={id}>
            <button
              aria-label={name}
              aria-pressed={id === selected}
              className={cn(
                TILE,
                "bg-card shadow-surface focus-visible:ring-ring/50 outline-none focus-visible:ring-3",
                id === selected && "ring-primary ring-2"
              )}
              onClick={() =>
                job?.status === "failed" ? onRetry(id) : onSelect(id)
              }
              title={job?.status === "failed" ? `Try ${name} again` : name}
              type="button"
            >
              <Thumb item={item} />
              {job?.status === "uploading" && (
                <span className="bg-card/70 absolute inset-0 grid place-items-center">
                  <Spinner className="size-4" />
                </span>
              )}
              {job?.status === "failed" && (
                <span className="bg-card/80 text-destructive absolute inset-0 grid place-items-center">
                  <RotateCcwIcon className="size-4" />
                </span>
              )}
            </button>
            {id === readId && (
              <span
                aria-hidden
                className="bg-primary text-primary-foreground ring-popover pointer-events-none absolute -bottom-1 -left-1 grid size-4.5 place-items-center rounded-full ring-2"
              >
                <SparklesIcon className="size-2.5" />
              </span>
            )}
            <button
              aria-label={`Remove ${name}`}
              className="bg-foreground text-background ring-popover absolute -top-1.5 -right-1.5 grid size-5 scale-90 place-items-center rounded-full opacity-0 ring-2 transition-[opacity,scale] duration-150 ease-out group-hover/thumb:scale-100 group-hover/thumb:opacity-100 focus-visible:scale-100 focus-visible:opacity-100 pointer-coarse:scale-100 pointer-coarse:opacity-100"
              onClick={() => onRemove(id)}
              type="button"
            >
              <XIcon className="size-3" strokeWidth={2.5} />
            </button>
          </li>
        );
      })}
      {onAdd && room > 0 && (
        <li>
          <button
            aria-label="Add files"
            className={cn(
              TILE,
              "text-muted-foreground hover:text-foreground hover:bg-foreground/5 focus-visible:ring-ring/50 grid place-items-center border border-dashed outline-none focus-visible:ring-3"
            )}
            onClick={() => input.current?.click()}
            title="Add files"
            type="button"
          >
            <PlusIcon className="size-4" />
          </button>
          <input
            accept={INVOICE_TYPES}
            aria-label="Add files"
            className="sr-only"
            multiple
            onChange={(event) => {
              const files = [...(event.target.files ?? [])];
              event.target.value = "";
              if (files.length > 0) {
                onAdd(files);
              }
            }}
            ref={input}
            tabIndex={-1}
            type="file"
          />
        </li>
      )}
    </ul>
  );
}

/** Where an entry without files takes its first: dropped on it, or picked. */
export function FileDropZone({
  reads,
  over,
  onFiles,
}: {
  /** Whether an invoice dropped here is read to fill the form in. */
  reads: boolean;
  /** Files are dragged over the form around it, which takes them too. */
  over: boolean;
  onFiles: (files: File[]) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div
      className={cn(
        "border-foreground/15 hover:border-foreground/25 hover:bg-foreground/2 relative flex items-center gap-3 rounded-xl border border-dashed px-3 py-2.5 transition-[background-color,border-color,box-shadow] duration-150 ease-out",
        over && cn(DROP_TARGET, "border-transparent")
      )}
    >
      <span className="bg-foreground/5 text-muted-foreground grid size-8 shrink-0 place-items-center rounded-lg">
        {reads ? (
          <SparklesIcon className="size-4" />
        ) : (
          <PaperclipIcon className="size-4" />
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm font-medium">
          {reads ? "Fill in from an invoice" : "Attach an invoice or receipt"}
        </span>
        <span className="text-muted-foreground text-xs">
          Drop a PDF or photo here, or{" "}
          <button
            className="text-primary focus-visible:after:ring-ring/50 font-medium outline-none after:absolute after:inset-0 after:rounded-xl hover:underline focus-visible:after:ring-3"
            onClick={() => input.current?.click()}
            type="button"
          >
            browse
          </button>
        </span>
      </span>
      <input
        accept={INVOICE_TYPES}
        aria-label="Attach files"
        className="sr-only"
        multiple
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          event.target.value = "";
          if (files.length > 0) {
            onFiles(files);
          }
        }}
        ref={input}
        tabIndex={-1}
        type="file"
      />
    </div>
  );
}

/** A small mark beside a field's label, saying the invoice filled it in. It blooms in as it fills. */
export function ReadMark() {
  return (
    <motion.span
      animate={{ filter: "blur(0px)", opacity: 1, scale: 1 }}
      className="text-primary ml-1.5 inline-flex align-[-0.125em]"
      initial={{ filter: "blur(4px)", opacity: 0, scale: 0.25 }}
      transition={{ bounce: 0, duration: 0.3, type: "spring" }}
    >
      <SparklesIcon aria-hidden className="size-3.5" />
      <span className="sr-only">Read from the invoice</span>
    </motion.span>
  );
}

/** A note under a field about what the invoice said, with a way to use it. */
export function InvoiceHint({
  children,
  action,
  onAction,
  tone = "muted",
}: {
  children: ReactNode;
  action?: string;
  onAction?: () => void;
  tone?: "muted" | "warning";
}) {
  return (
    <p
      className={cn(
        "flex flex-wrap items-center gap-x-2 text-xs",
        tone === "warning"
          ? "text-amber-700 dark:text-amber-400"
          : "text-muted-foreground"
      )}
    >
      {tone === "warning" ? (
        <CircleAlertIcon aria-hidden className="size-3 shrink-0" />
      ) : (
        <SparklesIcon aria-hidden className="text-primary size-3 shrink-0" />
      )}
      <span>{children}</span>
      {action && onAction && (
        <button
          className="text-primary font-medium hover:underline"
          onClick={onAction}
          type="button"
        >
          {action}
        </button>
      )}
    </p>
  );
}
