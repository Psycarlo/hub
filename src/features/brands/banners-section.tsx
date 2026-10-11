import { cn } from "cn";
import { DownloadIcon, ImageIcon, PlusIcon, Trash2Icon } from "lucide-react";

import { IconButton } from "@/components/icon-button";
import { Button } from "@/components/ui/button";
import { FluidTooltip } from "@/components/ui/fluid-tooltip";
import { Spinner } from "@/components/ui/spinner";
import {
  AddPlaceholder,
  ShowcaseSection,
  useBrandUpload,
  useFilePicker,
} from "@/features/brands/brand-parts";
import { DROP_TARGET, useFileDrop } from "@/features/card/use-file-drop";
import { removeBrandFile } from "@/lib/brand-actions";
import { downloadBrandFile } from "@/lib/brand-kit";
import type { Brand, BrandFile } from "@/lib/brands";
import { MAX_BANNERS, bannerFiles, formatOf } from "@/lib/brands";

const ACCEPT = "image/*";
/** The shape a banner takes until its size is known: a wide social cover. */
const DEFAULT_RATIO = 3;

function Banner({
  brand,
  file,
  editable,
}: {
  brand: Brand;
  file: BrandFile;
  editable: boolean;
}) {
  const ratio =
    file.width && file.height ? file.width / file.height : DEFAULT_RATIO;
  return (
    <figure className="group/banner flex flex-col gap-2">
      <div
        className="bg-muted image-outline relative overflow-hidden rounded-2xl"
        style={{ aspectRatio: String(ratio) }}
      >
        <img
          alt={file.name}
          className="absolute inset-0 size-full object-cover"
          draggable={false}
          loading="lazy"
          src={file.url}
        />
        <div className="absolute top-2 right-2 flex gap-1 opacity-0 transition-opacity duration-150 ease-out group-focus-within/banner:opacity-100 group-hover/banner:opacity-100 max-sm:opacity-100">
          <FluidTooltip.Group>
            <IconButton
              className="bg-background/80 hover:bg-background backdrop-blur-sm"
              label="Download"
              onClick={() => downloadBrandFile(brand, file)}
            >
              <DownloadIcon />
            </IconButton>
            {editable && (
              <IconButton
                className="bg-background/80 hover:bg-background backdrop-blur-sm"
                label="Remove"
                onClick={() => removeBrandFile(brand, file)}
              >
                <Trash2Icon />
              </IconButton>
            )}
          </FluidTooltip.Group>
        </div>
      </div>
      <figcaption className="text-muted-foreground flex items-center gap-2 px-1 text-xs">
        <span className="text-foreground min-w-0 truncate font-medium">
          {file.name}
        </span>
        <span className="ml-auto shrink-0 tabular-nums">
          {file.width && file.height ? `${file.width} × ${file.height} · ` : ""}
          {formatOf(file)}
        </span>
      </figcaption>
    </figure>
  );
}

export function BannersSection({
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
  const banners = bannerFiles(files);
  const { add, busy } = useBrandUpload(brand, { kind: "banner" });
  const { handlers, over } = useFileDrop(add);
  const picker = useFilePicker(add, { accept: ACCEPT });
  const room = banners.length < MAX_BANNERS;
  return (
    <ShowcaseSection
      action={
        editable &&
        banners.length > 0 &&
        room && (
          <Button
            disabled={busy}
            onClick={() => picker.open()}
            size="sm"
            variant="outline"
          >
            {busy ? <Spinner /> : <PlusIcon />}
            Add banner
          </Button>
        )
      }
      description="Covers and headers for profiles and pages. The first leads the brand above."
      eyebrow="Imagery"
      number={number}
      title="Banners"
    >
      <div
        className={cn(
          "rounded-2xl transition-shadow duration-150 ease-out",
          over && DROP_TARGET
        )}
        {...(editable && room ? handlers : {})}
      >
        {editable && <input {...picker.inputProps} />}
        {banners.length > 0 ? (
          <div
            className={cn(
              "grid gap-x-3 gap-y-5",
              banners.length > 1 && "sm:grid-cols-2"
            )}
          >
            {banners.map((file) => (
              <Banner
                brand={brand}
                editable={editable}
                file={file}
                key={file._id}
              />
            ))}
          </div>
        ) : (
          <AddPlaceholder
            className="min-h-40 w-full"
            hint="Drop images here, like a 1500 × 500 social cover."
            icon={busy ? <Spinner /> : <ImageIcon />}
            onClick={() => picker.open()}
            title="Add a banner"
          />
        )}
      </div>
    </ShowcaseSection>
  );
}
