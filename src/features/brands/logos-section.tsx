import { cn } from "cn";
import {
  CodeIcon,
  DownloadIcon,
  PlusIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import {
  AddPlaceholder,
  ShowcaseSection,
  useBrandUpload,
  useFilePicker,
} from "@/features/brands/brand-parts";
import { DROP_TARGET, useFileDrop } from "@/features/card/use-file-drop";
import { removeBrandFile } from "@/lib/brand-actions";
import {
  copySvg,
  downloadBrandFile,
  downloadLogos,
  logoBase,
} from "@/lib/brand-kit";
import type { Brand, BrandFile, LogoKind, LogoMode } from "@/lib/brands";
import {
  LOGO_HINTS,
  LOGO_MODES,
  LOGO_NAMES,
  MAX_SLOT_FILES,
  MODE_BACKGROUNDS,
  MODE_NAMES,
  extensionOf,
  formatOf,
  logoFiles,
  shownFile,
  slotFiles,
} from "@/lib/brands";
import { plural } from "@/lib/utils";

/** Logos come in, as most files of them do: vectors, images, print files. */
const ACCEPT = "image/*,application/pdf,.svg,.pdf,.eps,.ai";

/** Wide logos get wide tiles; square ones sit four to a row. */
const GROUPS: { kinds: LogoKind[]; grid: string; tile: string }[] = [
  {
    grid: "sm:grid-cols-2",
    kinds: ["lockup", "wordmark"],
    tile: "aspect-[16/9]",
  },
  {
    grid: "grid-cols-2 lg:grid-cols-4",
    kinds: ["symbol", "icon"],
    tile: "aspect-square",
  },
];

/** Chips over a logo, readable on the background it's drawn for. */
const CHIP: Record<LogoMode, string> = {
  dark: "bg-white/10 text-white/80 hover:bg-white/20 hover:text-white",
  light: "bg-black/5 text-black/65 hover:bg-black/10 hover:text-black",
};

const CAPTION: Record<LogoMode, string> = {
  dark: "text-white/55",
  light: "text-black/45",
};

/** The formats of a logo with nothing to show, standing in for it. */
const INK: Record<LogoMode, string> = {
  dark: "text-white/85",
  light: "text-black/75",
};

/** An empty tile's prompt, in the tile's own colors whatever the app's theme. */
const PLACEHOLDER: Record<LogoMode, string> = {
  dark: "border-white/15 text-white/55 hover:border-white/30 hover:bg-white/[0.03] hover:text-white [&>span:first-of-type]:text-white",
  light:
    "border-black/15 text-black/50 hover:border-black/30 hover:bg-black/[0.02] hover:text-black [&>span:first-of-type]:text-black",
};

/** One format of a logo: download it, copy its code, or take it off. */
function FormatChip({
  brand,
  file,
  kind,
  mode,
  editable,
}: {
  brand: Brand;
  file: BrandFile;
  kind: LogoKind;
  mode: LogoMode;
  editable: boolean;
}) {
  const extension = extensionOf(file.name);
  const svg = file.type === "image/svg+xml" || extension === "svg";
  const name = `${logoBase(brand, kind, mode)}${extension ? `.${extension}` : ""}`;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "focus-visible:ring-ring/50 h-6 rounded-full px-2.5 font-mono text-[11px] font-medium tracking-wide backdrop-blur-sm transition-colors duration-150 ease-out outline-none focus-visible:ring-3",
          CHIP[mode]
        )}
      >
        {formatOf(file)}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => downloadBrandFile(brand, file, name)}>
          <DownloadIcon />
          Download {formatOf(file)}
        </DropdownMenuItem>
        {svg && (
          <DropdownMenuItem onClick={() => copySvg(brand, file)}>
            <CodeIcon />
            Copy SVG code
          </DropdownMenuItem>
        )}
        {editable && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => removeBrandFile(brand, file)}
              variant="destructive"
            >
              <Trash2Icon />
              Remove {formatOf(file)}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** A logo on the background it's made for, with its formats; a place to drop it, while empty. */
function LogoTile({
  brand,
  files,
  kind,
  mode,
  editable,
  className,
}: {
  brand: Brand;
  files: BrandFile[];
  kind: LogoKind;
  mode: LogoMode;
  editable: boolean;
  className: string;
}) {
  const slot = slotFiles(files, kind, mode);
  const shown = shownFile(slot);
  const { add, busy } = useBrandUpload(brand, {
    kind: "logo",
    logo: kind,
    mode,
  });
  const { handlers, over } = useFileDrop(add);
  const picker = useFilePicker(add, { accept: ACCEPT });
  const label = `${LOGO_NAMES[kind]} · ${MODE_NAMES[mode]}`;
  const room = slot.length < MAX_SLOT_FILES;

  if (slot.length === 0 && !editable) {
    return null;
  }
  return (
    <figure
      className={cn(
        "image-outline relative overflow-hidden rounded-2xl transition-shadow duration-150 ease-out",
        over && DROP_TARGET,
        className
      )}
      style={{ background: MODE_BACKGROUNDS[mode] }}
      {...(editable ? handlers : {})}
    >
      <input {...picker.inputProps} />
      {shown && (
        <img
          alt={`${brand.title} ${label}`}
          className="absolute inset-0 m-auto max-h-[44%] max-w-[62%] object-contain"
          draggable={false}
          src={shown.url}
        />
      )}
      {!shown && slot.length > 0 && (
        <div
          className={cn(
            "absolute inset-x-4 inset-y-10 flex flex-col items-center justify-center gap-2.5 text-center text-xs",
            CAPTION[mode]
          )}
        >
          <span
            className={cn(
              "font-mono text-xl font-semibold tracking-tight text-balance",
              INK[mode]
            )}
          >
            {slot.map(formatOf).join(" · ")}
          </span>
          {editable && room && (
            <button
              className={cn(
                "focus-visible:ring-ring/50 flex h-7 items-center gap-1.5 rounded-full px-3 font-medium transition-colors duration-150 ease-out outline-none focus-visible:ring-3",
                CHIP[mode]
              )}
              onClick={() => picker.open()}
              title="Add an SVG or PNG to show the logo here"
              type="button"
            >
              <PlusIcon className="size-3.5" />
              Add SVG or PNG
            </button>
          )}
          {!editable && <span>Download to open</span>}
        </div>
      )}
      {slot.length === 0 && (
        <AddPlaceholder
          className={cn("absolute inset-2 rounded-xl", PLACEHOLDER[mode])}
          hint={LOGO_HINTS[kind]}
          icon={<UploadIcon />}
          onClick={() => picker.open()}
          title={`Add ${LOGO_NAMES[kind].toLowerCase()} ${MODE_NAMES[mode].toLowerCase()}`}
        />
      )}
      {slot.length > 0 && (
        <figcaption
          className={cn(
            "absolute top-3 left-4 text-xs font-medium",
            CAPTION[mode]
          )}
        >
          {label}
        </figcaption>
      )}
      {slot.length > 0 && (
        <div className="absolute right-3 bottom-3 flex flex-wrap justify-end gap-1">
          {slot.map((file) => (
            <FormatChip
              brand={brand}
              editable={editable}
              file={file}
              key={file._id}
              kind={kind}
              mode={mode}
            />
          ))}
          {editable && room && (
            <button
              aria-label={`Add a format of the ${label}`}
              className={cn(
                "focus-visible:ring-ring/50 flex size-6 items-center justify-center rounded-full transition-colors duration-150 ease-out outline-none focus-visible:ring-3",
                CHIP[mode]
              )}
              onClick={() => picker.open()}
              title="Add another format"
              type="button"
            >
              <PlusIcon className="size-3.5" />
            </button>
          )}
        </div>
      )}
      {busy && (
        <div
          className={cn(
            "absolute top-3 right-3 flex items-center gap-1.5 text-xs",
            CAPTION[mode]
          )}
        >
          <Spinner className="size-3.5" />
          Uploading
        </div>
      )}
    </figure>
  );
}

export function LogosSection({
  number,
  brand,
  files,
  editable,
}: {
  number: number;
  brand: Brand;
  files: BrandFile[];
  editable: boolean;
}) {
  const logos = logoFiles(files);
  return (
    <ShowcaseSection
      action={
        logos.length > 0 && (
          <Button
            onClick={() => downloadLogos(brand, files)}
            size="sm"
            variant="outline"
          >
            <DownloadIcon />
            Download all
            <span className="text-muted-foreground tabular-nums">
              {logos.length}
            </span>
          </Button>
        )
      }
      description={
        editable
          ? "Each logo for light and dark backgrounds, in every format you have. Drop files on a tile to add them."
          : `Each logo for light and dark backgrounds: ${plural(logos.length, "file")} in all.`
      }
      eyebrow="Logo"
      number={number}
      title="Logos"
    >
      <div className="flex flex-col gap-3">
        {GROUPS.map(({ kinds, grid, tile }) => (
          <div className={cn("grid gap-3", grid)} key={kinds.join("-")}>
            {kinds.flatMap((kind) =>
              LOGO_MODES.map((mode) => (
                <LogoTile
                  brand={brand}
                  className={tile}
                  editable={editable}
                  files={files}
                  key={`${kind}-${mode}`}
                  kind={kind}
                  mode={mode}
                />
              ))
            )}
          </div>
        ))}
      </div>
    </ShowcaseSection>
  );
}
