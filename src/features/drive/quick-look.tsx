import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { api } from "@convex/_generated/api";
import { cn } from "cn";
import { useQuery } from "convex/react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  ExternalLinkIcon,
  MessageCircleIcon,
  StarIcon,
  XIcon,
} from "lucide-react";
import type { KeyboardEvent, ReactNode } from "react";
import { useEffect, useState } from "react";

import { IconButton } from "@/components/icon-button";
import { Button } from "@/components/ui/button";
import { DialogOverlay, DialogPortal } from "@/components/ui/dialog";
import { FluidTooltip } from "@/components/ui/fluid-tooltip";
import { Spinner } from "@/components/ui/spinner";
import { useDrive } from "@/features/drive/drive-state";
import { FileIcon } from "@/features/drive/file-icon";
import { FilePanel } from "@/features/drive/file-panel";
import { run } from "@/lib/actions";
import { convex } from "@/lib/convex";
import { parseCsv } from "@/lib/csv";
import type { DriveFile } from "@/lib/drive";
import {
  fileKind,
  KIND_LABELS,
  MAX_TEXT_PREVIEW,
  previewOf,
} from "@/lib/drive";
import { downloadFile, markOpened, setStarred } from "@/lib/drive-actions";
import { formatBytes, readStorage, writeStorage } from "@/lib/utils";

const PANEL_KEY = "drive:panel";
/** Rows of a CSV shown; the rest is for the download. */
const MAX_ROWS = 1000;

function NoPreview({ file, note }: { file: DriveFile; note?: string }) {
  return (
    <div className="flex max-w-sm flex-col items-center gap-4 text-center">
      <FileIcon file={file} size="xl" />
      <div className="flex flex-col gap-1">
        <p className="font-medium wrap-break-word">{file.name}</p>
        <p className="text-muted-foreground text-sm">
          {note ??
            `${KIND_LABELS[fileKind(file)]} · ${formatBytes(file.size)}. There’s no preview for this kind of file.`}
        </p>
      </div>
      <Button onClick={() => downloadFile(file)}>
        <DownloadIcon />
        Download
      </Button>
    </div>
  );
}

/** The picture at its full size, its thumbnail standing in, blurred, until it loads. */
function ImagePreview({ file }: { file: DriveFile }) {
  const [loaded, setLoaded] = useState(false);
  const [broken, setBroken] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  if (broken) {
    return <NoPreview file={file} note="Your browser can’t show this image." />;
  }
  return (
    <div
      className={cn(
        "relative grid size-full place-items-center",
        zoomed ? "cursor-zoom-out overflow-auto" : "cursor-zoom-in"
      )}
      onClick={() => setZoomed(!zoomed)}
      onKeyDown={undefined}
      role="presentation"
    >
      {file.thumbUrl && !loaded && (
        <img
          alt=""
          className="absolute max-h-full max-w-full scale-[1.02] rounded-lg object-contain blur-md"
          src={file.thumbUrl}
        />
      )}
      <img
        alt={file.name}
        className={cn(
          "rounded-lg transition-opacity duration-300 ease-out select-none",
          zoomed ? "max-w-none" : "max-h-full max-w-full object-contain",
          loaded ? "opacity-100" : "opacity-0"
        )}
        draggable={false}
        onError={() => setBroken(true)}
        onLoad={() => setLoaded(true)}
        src={file.url}
      />
      {!(loaded || file.thumbUrl) && (
        <Spinner className="text-muted-foreground absolute" />
      )}
    </div>
  );
}

function VideoPreview({ file }: { file: DriveFile }) {
  const [broken, setBroken] = useState(false);
  if (broken) {
    return (
      <NoPreview
        file={file}
        note="Your browser can’t play this video. Download it to watch."
      />
    );
  }
  return (
    // oxlint-disable-next-line jsx-a11y/media-has-caption -- people's own videos have no captions to offer
    <video
      autoPlay
      className="max-h-full max-w-full rounded-lg bg-black"
      controls
      onError={() => setBroken(true)}
      playsInline
      poster={file.thumbUrl}
      src={file.url}
    />
  );
}

function AudioPreview({ file }: { file: DriveFile }) {
  return (
    <div className="bg-card shadow-raised flex w-full max-w-md flex-col items-center gap-5 rounded-3xl p-8">
      <FileIcon file={file} size="xl" />
      <p className="max-w-full truncate font-medium">{file.name}</p>
      {/* oxlint-disable-next-line jsx-a11y/media-has-caption -- recordings people upload have none */}
      <audio autoPlay className="w-full" controls src={file.url} />
    </div>
  );
}

/** A short-lived link that shows the file in place, under its own name and type. */
function useInlineLink(file: DriveFile): string | undefined | null {
  const [link, setLink] = useState<{ id: string; url: string | null }>();
  useEffect(() => {
    let current = true;
    const load = async () => {
      const url = await run(
        convex.mutation(api.drive.link, { download: false, fileId: file._id })
      );
      if (current) {
        setLink({ id: file._id, url: url ?? null });
      }
    };
    load();
    return () => {
      current = false;
    };
  }, [file._id]);
  return link?.id === file._id ? link.url : undefined;
}

function PdfPreview({ file }: { file: DriveFile }) {
  const url = useInlineLink(file);
  if (url === undefined) {
    return <Spinner className="text-muted-foreground" />;
  }
  if (url === null) {
    return <NoPreview file={file} />;
  }
  // The browser's own PDF viewer, which sandboxed frames would refuse to load.
  return (
    <object
      aria-label={file.name}
      className="size-full max-w-5xl rounded-lg bg-white"
      data={url}
      type="application/pdf"
    >
      <NoPreview
        file={file}
        note="Your browser can’t show PDFs here. Download it, or open it in a new tab."
      />
    </object>
  );
}

async function readText(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    return response.ok ? await response.text() : null;
  } catch {
    return null;
  }
}

/** The file's text, read through a short-lived link, up to what's worth showing. */
function useText(file: DriveFile): string | undefined | null {
  const url = useInlineLink(file);
  const [text, setText] = useState<{ url: string; text: string | null }>();
  useEffect(() => {
    if (!url) {
      return;
    }
    let current = true;
    const load = async () => {
      const body = await readText(url);
      if (current) {
        setText({ text: body?.slice(0, MAX_TEXT_PREVIEW) ?? null, url });
      }
    };
    load();
    return () => {
      current = false;
    };
  }, [url]);
  if (url === null) {
    return null;
  }
  return text && text.url === url ? text.text : undefined;
}

function pretty(file: DriveFile, text: string): string {
  if (!file.name.toLowerCase().endsWith(".json")) {
    return text;
  }
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

function TextPreview({ file }: { file: DriveFile }) {
  const text = useText(file);
  if (text === undefined) {
    return <Spinner className="text-muted-foreground" />;
  }
  if (text === null) {
    return <NoPreview file={file} note="This file couldn’t be read." />;
  }
  const lines = pretty(file, text).split("\n");
  return (
    <div className="bg-card text-card-foreground shadow-raised size-full max-w-4xl overflow-auto rounded-2xl">
      <pre className="grid grid-cols-[auto_1fr] font-mono text-[0.8125rem] leading-6">
        {lines.map((line, index) => (
          // Lines never reorder for the same text, so their number is a stable key.
          // oxlint-disable-next-line react/no-array-index-key
          <span className="contents" key={index}>
            <span className="text-muted-foreground/60 bg-card sticky left-0 pr-4 pl-4 text-right tabular-nums select-none">
              {index + 1}
            </span>
            <span className="pr-6 whitespace-pre-wrap">{line || " "}</span>
          </span>
        ))}
      </pre>
    </div>
  );
}

function TablePreview({ file }: { file: DriveFile }) {
  const text = useText(file);
  if (text === undefined) {
    return <Spinner className="text-muted-foreground" />;
  }
  if (text === null) {
    return <NoPreview file={file} note="This file couldn’t be read." />;
  }
  const [head = [], ...rows] = parseCsv(text);
  const shown = rows.slice(0, MAX_ROWS);
  return (
    <div className="bg-card text-card-foreground shadow-raised size-full max-w-6xl overflow-auto rounded-2xl">
      <table className="w-max min-w-full border-separate border-spacing-0 text-sm">
        <thead className="bg-card sticky top-0">
          <tr>
            {head.map((cell, index) => (
              // oxlint-disable-next-line react/no-array-index-key -- columns keep their order
              <th
                className="border-b px-3 py-2 text-left font-medium whitespace-nowrap"
                key={index}
              >
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((row, rowIndex) => (
            // oxlint-disable-next-line react/no-array-index-key -- rows keep their order
            <tr className="hover:bg-foreground/3" key={rowIndex}>
              {row.map((cell, index) => (
                // oxlint-disable-next-line react/no-array-index-key -- columns keep their order
                <td
                  className="max-w-80 truncate border-b px-3 py-1.5"
                  key={index}
                  title={cell}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > MAX_ROWS && (
        <p className="text-muted-foreground p-3 text-center text-xs">
          Showing the first {MAX_ROWS} of {rows.length} rows.
        </p>
      )}
    </div>
  );
}

function Preview({ file }: { file: DriveFile }) {
  const previews: Record<string, (props: { file: DriveFile }) => ReactNode> = {
    audio: AudioPreview,
    image: ImagePreview,
    pdf: PdfPreview,
    table: TablePreview,
    text: TextPreview,
    video: VideoPreview,
  };
  const kind = previewOf(file);
  const Shown = kind ? previews[kind] : undefined;
  return Shown ? <Shown file={file} /> : <NoPreview file={file} />;
}

/** Fetches the images on either side, so stepping to them is instant. */
function usePreload(files: DriveFile[]) {
  useEffect(() => {
    for (const file of files) {
      if (fileKind(file) === "image") {
        const image = new Image();
        image.src = file.url;
      }
    }
  }, [files]);
}

/** The person's mentions in the file's comments count as read once they look at it. */
function useReadMentions(fileId: string) {
  const inbox = useQuery(api.inbox.list);
  const unread = inbox?.some(
    (item) => item.kind === "file" && item.file._id === fileId && !item.read
  );
  useEffect(() => {
    if (unread) {
      run(
        convex.mutation(api.inbox.readFile, {
          fileId: fileId as DriveFile["_id"],
        })
      );
    }
  }, [unread, fileId]);
}

function Viewer({
  file,
  files,
  onNavigate,
}: {
  file: DriveFile;
  files: DriveFile[];
  /** Opens another file, or closes the preview when given none. */
  onNavigate: (file?: DriveFile) => void;
}) {
  const drive = useDrive();
  const [panel, setPanel] = useState(() => readStorage(PANEL_KEY) === "open");
  const index = files.findIndex((item) => item._id === file._id);
  const previous = index > 0 ? files[index - 1] : undefined;
  const next = index === -1 ? undefined : files[index + 1];
  const starred = drive.starred(file._id);
  usePreload([previous, next].filter((item) => item !== undefined));
  useReadMentions(file._id);

  useEffect(() => {
    markOpened(file._id);
  }, [file._id]);

  const togglePanel = () => {
    setPanel(!panel);
    writeStorage(PANEL_KEY, panel ? null : "open");
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement;
    if (
      target.closest("input, textarea, [contenteditable=true], video, audio")
    ) {
      return;
    }
    if (event.key === "ArrowLeft" && previous) {
      event.preventDefault();
      onNavigate(previous);
    } else if (event.key === "ArrowRight" && next) {
      event.preventDefault();
      onNavigate(next);
    } else if (event.key === " " && previewOf(file) !== "video") {
      // Like Quick Look: space closes what space opened.
      event.preventDefault();
      onNavigate();
    }
  };

  const step = (target: DriveFile | undefined, side: "left" | "right") =>
    target && (
      <IconButton
        className={cn(
          "absolute top-1/2 z-10 -translate-y-1/2 bg-black/40 text-white backdrop-blur-md hover:bg-black/60 hover:text-white max-sm:hidden",
          side === "left" ? "left-4" : "right-4"
        )}
        label={side === "left" ? "Previous file" : "Next file"}
        onClick={() => onNavigate(target)}
        size="icon-lg"
      >
        {side === "left" ? <ChevronLeftIcon /> : <ChevronRightIcon />}
      </IconButton>
    );

  return (
    <div
      className="flex size-full flex-col"
      onKeyDown={onKeyDown}
      role="presentation"
    >
      <header className="flex h-14 shrink-0 items-center gap-3 px-3 sm:px-4">
        <FileIcon file={file} size="md" />
        <div className="flex min-w-0 flex-1 flex-col">
          <DialogPrimitive.Title className="truncate text-sm font-medium">
            {file.name}
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="text-muted-foreground truncate text-xs">
            {KIND_LABELS[fileKind(file)]} · {formatBytes(file.size)}
            {files.length > 1 && index !== -1 && (
              <span className="tabular-nums">
                {" "}
                · {index + 1} of {files.length}
              </span>
            )}
          </DialogPrimitive.Description>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <FluidTooltip.Group>
            <IconButton
              aria-pressed={starred}
              label={starred ? "Remove star" : "Star"}
              onClick={() =>
                setStarred(drive.project._id, { fileId: file._id }, !starred)
              }
            >
              <StarIcon
                className={cn(starred && "fill-amber-400 text-amber-400")}
              />
            </IconButton>
            <IconButton
              aria-pressed={panel}
              className={cn(panel && "bg-muted text-foreground")}
              label="Details and comments"
              onClick={togglePanel}
            >
              <MessageCircleIcon />
            </IconButton>
            <IconButton label="Download" onClick={() => downloadFile(file)}>
              <DownloadIcon />
            </IconButton>
            <IconButton
              className="max-sm:hidden"
              label="Open in a new tab"
              onClick={() => window.open(file.url, "_blank", "noopener")}
            >
              <ExternalLinkIcon />
            </IconButton>
            <DialogPrimitive.Close render={<IconButton label="Close" />}>
              <XIcon />
            </DialogPrimitive.Close>
          </FluidTooltip.Group>
        </div>
      </header>
      <div className="relative flex min-h-0 flex-1 gap-3 px-3 pb-3 sm:px-4 sm:pb-4">
        <div className="relative flex min-w-0 flex-1 items-center justify-center">
          {step(previous, "left")}
          <div
            className="flex size-full items-center justify-center"
            key={file._id}
          >
            <Preview file={file} />
          </div>
          {step(next, "right")}
        </div>
        {panel && (
          <FilePanel
            className="w-[22rem] shrink-0 max-md:absolute max-md:inset-x-3 max-md:bottom-3 max-md:h-[60%] max-md:w-auto"
            file={file}
          />
        )}
      </div>
    </div>
  );
}

/**
 * The file open over the Drive, previewed when it can be: pictures, videos,
 * audio, PDFs and texts. ← and → step through the others listed with it.
 */
export function QuickLook({
  fileId,
  files,
  onNavigate,
}: {
  fileId: string | undefined;
  /** The files listed with it, in order, to step through. */
  files: DriveFile[];
  /** Opens another file, or closes the preview when given none. */
  onNavigate: (file?: DriveFile) => void;
}) {
  const listed = fileId ? files.find((file) => file._id === fileId) : undefined;
  // Opened from a link, it may not be among those listed.
  const fetched = useQuery(
    api.drive.file,
    fileId && !listed ? { fileId: fileId as DriveFile["_id"] } : "skip"
  );
  const file = listed ?? fetched ?? undefined;
  // Kept while the preview closes, so it fades out with what it showed.
  const [last, setLast] = useState<DriveFile>();
  if (file && file !== last) {
    setLast(file);
  }
  const shown = file ?? last;
  return (
    <DialogPrimitive.Root
      onOpenChange={(open) => {
        if (!open) {
          onNavigate();
        }
      }}
      open={file !== undefined}
    >
      <DialogPortal>
        <DialogOverlay className="bg-black/80 backdrop-blur-md dark:bg-black/80" />
        <DialogPrimitive.Popup className="dark text-foreground fixed inset-0 z-50 transition-[opacity,scale] duration-200 ease-out outline-none data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-ending-style:duration-150 data-starting-style:scale-[0.98] data-starting-style:opacity-0">
          {shown && (
            <Viewer
              file={shown}
              files={listed ? files : [shown]}
              onNavigate={onNavigate}
            />
          )}
        </DialogPrimitive.Popup>
      </DialogPortal>
    </DialogPrimitive.Root>
  );
}
