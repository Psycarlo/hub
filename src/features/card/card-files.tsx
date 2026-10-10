import { cn } from "cn";
import type { LucideIcon } from "lucide-react";
import {
  FileArchiveIcon,
  FileCodeIcon,
  FileIcon,
  FileImageIcon,
  FileMusicIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  FileVideoCameraIcon,
  PaperclipIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { IconButton } from "@/components/icon-button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { FluidTooltip } from "@/components/ui/fluid-tooltip";
import { Spinner } from "@/components/ui/spinner";
import { useBoard } from "@/features/board/board-context";
import { When } from "@/features/card/card-parts";
import type { DraftFile } from "@/features/card/use-draft-files";
import { DROP_TARGET, useFileDrop } from "@/features/card/use-file-drop";
import type { Attachment } from "@/hooks/use-attachments";
import { useAttachments } from "@/hooks/use-attachments";
import { attachFile, removeAttachment } from "@/lib/actions";
import type { Card } from "@/lib/model";
import { MAX_CARD_FILES } from "@/lib/model";
import { uploadable } from "@/lib/upload";
import { formatBytes } from "@/lib/utils";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

/** A file as a small pill: its icon, then its name. */
export const FILE_PILL =
  "bg-foreground/5 flex h-7 min-w-0 items-center gap-1.5 rounded-full text-xs font-medium";

const ARCHIVE = /zip|rar|7z|tar|gzip|compressed/u;
const SHEET = /spreadsheet|excel|csv/u;
const DOCUMENT = /pdf|word|document|presentation|powerpoint|rtf/u;
const CODE = /json|javascript|typescript|xml|html|css/u;

const FILE_ICONS = {
  archive: FileArchiveIcon,
  audio: FileMusicIcon,
  code: FileCodeIcon,
  document: FileTextIcon,
  file: FileIcon,
  image: FileImageIcon,
  sheet: FileSpreadsheetIcon,
  video: FileVideoCameraIcon,
} satisfies Record<string, LucideIcon>;

type FileKind = keyof typeof FILE_ICONS;

/** What kind of file a MIME type stands for, as far as its icon goes. */
function fileKind(type: string): FileKind {
  for (const kind of ["image", "video", "audio"] as const) {
    if (type.startsWith(`${kind}/`)) {
      return kind;
    }
  }
  // Office types mention XML too, so documents are told apart before code.
  for (const [pattern, kind] of [
    [ARCHIVE, "archive"],
    [SHEET, "sheet"],
    [DOCUMENT, "document"],
    [CODE, "code"],
  ] as const) {
    if (pattern.test(type)) {
      return kind;
    }
  }
  return type.startsWith("text/") ? "document" : "file";
}

/** An icon for a kind of file, by its MIME type. */
export function FileTypeIcon({
  type,
  className,
}: {
  type: string;
  className?: string;
}) {
  const Icon = FILE_ICONS[fileKind(type)];
  return <Icon aria-hidden className={className} />;
}

export function isImageType(type: string): boolean {
  return type.startsWith("image/");
}

/** A paperclip that asks for files. */
export function AttachButton({
  onFiles,
  className,
}: {
  onFiles: (files: File[]) => void;
  className?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <IconButton
        className={className}
        label="Attach files"
        onClick={() => input.current?.click()}
        type="button"
      >
        <PaperclipIcon />
      </IconButton>
      <input
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
    </>
  );
}

function DraftChip({
  file,
  locked,
  onRemove,
}: {
  file: DraftFile;
  /** Sending: the file is on its way. */
  locked: boolean;
  onRemove: () => void;
}) {
  return (
    <motion.li
      animate={{ opacity: 1, scale: 1 }}
      aria-busy={!file.upload}
      className={cn(FILE_PILL, "max-w-56 pr-0.5 pl-2.5")}
      exit={{ opacity: 0, scale: 0.9 }}
      initial={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.15, ease: EASE_OUT }}
    >
      {file.upload ? (
        <FileTypeIcon
          className="text-muted-foreground size-3.5 shrink-0"
          type={file.type}
        />
      ) : (
        <Spinner className="text-muted-foreground size-3.5 shrink-0" />
      )}
      <span className="truncate" title={file.name}>
        {file.name}
      </span>
      <IconButton
        disabled={locked}
        label={`Remove ${file.name}`}
        onClick={onRemove}
        size="icon-xs"
        tooltip="Remove"
        type="button"
      >
        <XIcon />
      </IconButton>
    </motion.li>
  );
}

/** Files picked to go out with something, each with a way to take it out again. */
export function DraftChips({
  files,
  label,
  locked = false,
  onRemove,
  className,
}: {
  files: DraftFile[];
  label: string;
  locked?: boolean;
  onRemove: (id: string) => void;
  className?: string;
}) {
  return (
    <ul
      aria-label={label}
      className={cn("flex flex-wrap gap-1.5 empty:hidden", className)}
    >
      <AnimatePresence initial={false}>
        {files.map((file) => (
          <DraftChip
            file={file}
            key={file.id}
            locked={locked}
            onRemove={() => onRemove(file.id)}
          />
        ))}
      </AnimatePresence>
    </ul>
  );
}

const THUMB = "size-10 shrink-0 rounded-lg";

/** A preview of an image, or an icon for any other file. */
function Thumbnail({ file }: { file: Pick<Attachment, "type" | "url"> }) {
  // Some images, like HEIC photos, won't show in every browser.
  const [broken, setBroken] = useState(false);
  if (isImageType(file.type) && !broken) {
    return (
      <img
        alt=""
        className={cn(THUMB, "image-outline object-cover")}
        loading="lazy"
        onError={() => setBroken(true)}
        src={file.url}
      />
    );
  }
  return (
    <span
      className={cn(
        THUMB,
        "bg-foreground/5 text-muted-foreground grid place-items-center"
      )}
    >
      <FileTypeIcon className="size-5" type={file.type} />
    </span>
  );
}

function DeleteFile({ file }: { file: Attachment }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <IconButton
        className="relative z-10 opacity-0 transition-opacity duration-150 group-hover/file:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
        label="Delete file"
        onClick={() => setOpen(true)}
        size="icon-xs"
      >
        <Trash2Icon />
      </IconButton>
      <AlertDialog onOpenChange={setOpen} open={open}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete file?</AlertDialogTitle>
            <AlertDialogDescription className="wrap-break-word">
              {file.name} disappears for everyone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => removeAttachment(file._id)}
              variant="destructive"
            >
              Delete file
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

const TILE =
  "relative flex min-w-0 items-center gap-3 rounded-xl bg-card p-2 pr-3 shadow-surface";

function FileTile({ file, canEdit }: { file: Attachment; canEdit: boolean }) {
  return (
    <li
      className={cn(
        TILE,
        "group/file hover:bg-accent transition-[background-color] duration-150 ease-out"
      )}
    >
      <Thumbnail file={file} />
      <div className="flex min-w-0 flex-1 flex-col">
        {/* The link covers the whole tile; only the delete button sits above it. */}
        <a
          className="focus-visible:after:ring-ring/50 truncate text-sm font-medium outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-3"
          href={file.url}
          rel="noreferrer"
          target="_blank"
          title={file.name}
        >
          {file.name}
        </a>
        <span className="text-muted-foreground truncate text-xs">
          {formatBytes(file.size)} · <When at={file._creationTime} />
        </span>
      </div>
      {canEdit && <DeleteFile file={file} />}
    </li>
  );
}

function UploadingTile({ name }: { name: string }) {
  return (
    <li aria-busy className={TILE}>
      <span
        className={cn(
          THUMB,
          "bg-foreground/5 text-muted-foreground grid place-items-center"
        )}
      >
        <Spinner />
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium">{name}</span>
        <span className="text-muted-foreground text-xs">Uploading…</span>
      </div>
    </li>
  );
}

interface Uploading {
  id: string;
  name: string;
}

/**
 * The files attached to a card. Editors attach more with the paperclip, or by
 * dropping them here. `children`, like the card's reactions, lead the row the
 * paperclip is in, and share its tooltips.
 */
export function CardFiles({
  card,
  children,
}: {
  card: Card;
  children?: ReactNode;
}) {
  const { canEdit } = useBoard();
  const files = useAttachments(card);
  const [uploading, setUploading] = useState<Uploading[]>([]);

  const upload = async (file: File, id: string) => {
    await attachFile(card, file);
    // Attached by now, and listed with the rest, or failed and said so.
    setUploading((current) => current.filter((item) => item.id !== id));
  };

  const add = (picked: File[]) => {
    const fitting = uploadable(picked);
    const room = Math.max(0, MAX_CARD_FILES - files.length - uploading.length);
    if (fitting.length > room) {
      toast.error(`A card can have up to ${MAX_CARD_FILES} files.`);
    }
    const added = fitting
      .slice(0, room)
      .map((file) => ({ file, id: crypto.randomUUID(), name: file.name }));
    setUploading((current) => [
      ...current,
      ...added.map(({ id, name }) => ({ id, name })),
    ]);
    for (const { file, id } of added) {
      upload(file, id);
    }
  };

  const drop = useFileDrop(add);

  const list = (files.length > 0 || uploading.length > 0) && (
    <ul aria-label="Files" className="grid gap-2 sm:grid-cols-2">
      {files.map((file) => (
        <FileTile canEdit={canEdit} file={file} key={file._id} />
      ))}
      {uploading.map((item) => (
        <UploadingTile key={item.id} name={item.name} />
      ))}
    </ul>
  );

  if (!canEdit) {
    return (
      <div className="flex flex-col gap-2 pt-2 empty:hidden">
        <FluidTooltip.Group>{children}</FluidTooltip.Group>
        {list}
      </div>
    );
  }
  return (
    <div
      className={cn(
        "-mx-2 flex flex-col gap-2 rounded-xl p-2 transition-[background-color,box-shadow] duration-150 ease-out",
        drop.over && DROP_TARGET
      )}
      {...drop.handlers}
    >
      {/* A button leading the row lines its icon up with the text above. */}
      <div className="flex flex-wrap items-center gap-1 [&>button:first-child]:-ml-2">
        <FluidTooltip.Group>
          {children}
          <AttachButton onFiles={add} />
        </FluidTooltip.Group>
      </div>
      {list}
    </div>
  );
}
