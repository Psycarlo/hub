import { cn } from "cn";
import {
  DownloadIcon,
  ExternalLinkIcon,
  PencilIcon,
  PlusIcon,
  TypeIcon,
  UploadIcon,
} from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  AddPlaceholder,
  ShowcaseSection,
  useBrandUpload,
  useFilePicker,
} from "@/features/brands/brand-parts";
import { DROP_TARGET, useFileDrop } from "@/features/card/use-file-drop";
import { downloadFont } from "@/lib/brand-kit";
import type { Brand, BrandFile, BrandFont } from "@/lib/brands";
import {
  MAX_FONTS,
  WEIGHT_NAMES,
  cssFamily,
  fontFiles,
  fontWeights,
  googleFontsPage,
} from "@/lib/brands";
import { plural } from "@/lib/utils";

const ACCEPT = ".woff2,.woff,.otf,.ttf,font/woff2,font/woff,font/otf,font/ttf";
const GLYPHS = [
  "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  "abcdefghijklmnopqrstuvwxyz",
  "0123456789 & @ ! ? € $ % ( ) “ ”",
];

/** A typeface set in itself: its name, its letters and every weight it's used in. */
function Specimen({
  brand,
  files,
  font,
  editable,
  onEdit,
}: {
  brand: Brand;
  files: BrandFile[];
  font: BrandFont;
  editable: boolean;
  onEdit: () => void;
}) {
  const family = cssFamily(font);
  const own = fontFiles(files, font.id);
  const weights = fontWeights(font, files);
  const uploads = font.source === "file";
  const { add, busy } = useBrandUpload(brand, {
    fontId: font.id,
    kind: "font",
  });
  const { handlers, over } = useFileDrop(add);
  const picker = useFilePicker(add, { accept: ACCEPT });
  const droppable = editable && uploads;

  return (
    <article
      className={cn(
        "bg-card shadow-surface flex flex-col gap-6 overflow-hidden rounded-2xl p-6 transition-shadow duration-150 ease-out sm:p-8",
        over && DROP_TARGET
      )}
      {...(droppable ? handlers : {})}
    >
      {droppable && <input {...picker.inputProps} />}
      <div className="flex items-start gap-6">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            {font.role || "Typeface"}
          </p>
          <h3
            className="truncate text-3xl leading-tight sm:text-4xl"
            style={{ fontFamily: family }}
          >
            {font.family}
          </h3>
          <p className="text-muted-foreground text-sm">
            {font.source === "google"
              ? "Google Fonts"
              : plural(own.length, "file")}{" "}
            · {plural(weights.length, "weight")}
          </p>
        </div>
        <span
          aria-hidden
          className="text-foreground/90 -mt-2 shrink-0 text-7xl leading-none select-none sm:text-8xl"
          style={{ fontFamily: family }}
        >
          Aa
        </span>
      </div>

      <p
        className="text-muted-foreground flex flex-col gap-1 text-lg leading-snug break-all sm:text-xl"
        style={{ fontFamily: family }}
      >
        {GLYPHS.map((line) => (
          <span key={line}>{line}</span>
        ))}
      </p>

      {weights.length > 0 && (
        <div className="border-border flex flex-wrap gap-x-6 gap-y-2 border-t pt-5">
          {weights.map((weight) => (
            <span
              className="flex items-baseline gap-2"
              key={weight}
              style={{ fontFamily: family }}
            >
              <span className="text-2xl" style={{ fontWeight: weight }}>
                Ag
              </span>
              <span className="text-muted-foreground font-sans text-xs tabular-nums">
                {WEIGHT_NAMES[weight] ?? weight} {weight}
              </span>
            </span>
          ))}
        </div>
      )}

      <div className="-mb-1 flex flex-wrap items-center gap-2">
        {font.source === "google" ? (
          <a
            className={buttonVariants({ size: "sm", variant: "outline" })}
            href={googleFontsPage(font.family)}
            rel="noreferrer"
            target="_blank"
          >
            <ExternalLinkIcon />
            Google Fonts
          </a>
        ) : (
          own.length > 0 && (
            <Button
              onClick={() => downloadFont(brand, font, files)}
              size="sm"
              variant="outline"
            >
              <DownloadIcon />
              Download {own.length === 1 ? "file" : "files"}
            </Button>
          )
        )}
        {droppable && (
          <Button onClick={() => picker.open()} size="sm" variant="ghost">
            {busy ? <Spinner /> : <UploadIcon />}
            {busy ? "Uploading" : "Add files"}
          </Button>
        )}
        {editable && (
          <Button
            className="ml-auto"
            onClick={onEdit}
            size="sm"
            variant="ghost"
          >
            <PencilIcon />
            Edit
          </Button>
        )}
      </div>
    </article>
  );
}

export function TypeSection({
  number,
  brand,
  files,
  editable,
  onEdit,
}: {
  number: number;
  brand: Brand;
  files: BrandFile[];
  editable: boolean;
  /** Opens a typeface to change, or a new one without. */
  onEdit: (font?: BrandFont) => void;
}) {
  return (
    <ShowcaseSection
      action={
        editable &&
        brand.fonts.length > 0 &&
        brand.fonts.length < MAX_FONTS && (
          <Button onClick={() => onEdit()} size="sm" variant="outline">
            <PlusIcon />
            Add typeface
          </Button>
        )
      }
      description="Roles say what sets headings and body text, else the first and the next do. Uploaded typefaces download with the kit."
      eyebrow="Typography"
      number={number}
      title="Typefaces"
    >
      {brand.fonts.length > 0 ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {brand.fonts.map((font) => (
            <Specimen
              brand={brand}
              editable={editable}
              files={files}
              font={font}
              key={font.id}
              onEdit={() => onEdit(font)}
            />
          ))}
        </div>
      ) : (
        <AddPlaceholder
          className="min-h-40"
          hint="From Google Fonts by name, or upload your own files."
          icon={<TypeIcon />}
          onClick={() => onEdit()}
          title="Add the brand’s typefaces"
        />
      )}
    </ShowcaseSection>
  );
}
