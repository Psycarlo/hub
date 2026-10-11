import { cn } from "cn";
import { PlusIcon, SwatchBookIcon } from "lucide-react";
import { Link } from "wouter";

import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyTitle } from "@/components/ui/empty";
import { CARD_SURFACE } from "@/features/boards/board-card";
import { brandPath } from "@/features/brands/brands-context";
import type { Brand } from "@/lib/brands";
import { MODE_BACKGROUNDS, paletteGradient } from "@/lib/brands";
import { isLight } from "@/lib/color";
import { mediaUrl } from "@/lib/convex";
import type { Project } from "@/lib/project";

/** Colors shown as dots on a card; past it, a count. */
const SHOWN_COLORS = 6;

/**
 * The brand's mark on the background it's drawn for, or its initial on its
 * first color until it has a logo. Positioned, so it paints over a cover it
 * overlaps.
 */
export function BrandMark({
  brand,
  className,
}: {
  brand: Pick<Brand, "colors" | "mark" | "title">;
  className?: string;
}) {
  const { mark } = brand;
  const color = brand.colors[0]?.hex;
  if (mark) {
    return (
      <span
        className={cn(
          "image-outline relative flex shrink-0 items-center justify-center overflow-hidden",
          className
        )}
        style={{ background: MODE_BACKGROUNDS[mark.mode] }}
      >
        <img
          alt=""
          className="size-[64%] object-contain"
          draggable={false}
          src={mediaUrl(mark.key)}
        />
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        "bg-muted image-outline relative flex shrink-0 items-center justify-center font-semibold",
        color && !isLight(color) ? "text-white" : "text-foreground",
        className
      )}
      style={color ? { background: color } : undefined}
    >
      {brand.title.trim().charAt(0).toUpperCase() || "·"}
    </span>
  );
}

/** The brand's banner, or a wash of its colors, or a quiet grain before it has either. */
export function BrandCover({
  brand,
  className,
}: {
  brand: Pick<Brand, "colors" | "coverKey">;
  className?: string;
}) {
  const gradient = paletteGradient(brand.colors);
  return (
    <div
      className={cn("bg-muted relative overflow-hidden", className)}
      style={gradient ? { background: gradient } : undefined}
    >
      {brand.coverKey ? (
        <img
          alt=""
          className="absolute inset-0 size-full object-cover"
          draggable={false}
          src={mediaUrl(brand.coverKey)}
        />
      ) : (
        <div aria-hidden className="bg-grain absolute inset-0" />
      )}
    </div>
  );
}

function BrandCard({ project, brand }: { project: Project; brand: Brand }) {
  const hidden = brand.colors.length - SHOWN_COLORS;
  return (
    <Link
      className={cn(CARD_SURFACE, "gap-0 overflow-hidden p-0")}
      href={brandPath(project, brand)}
    >
      <BrandCover brand={brand} className="h-20" />
      <div className="flex flex-1 flex-col gap-2 px-5 pb-5">
        <BrandMark
          brand={brand}
          className="ring-card -mt-6 mb-1 size-12 rounded-xl text-lg ring-4"
        />
        <h3 className="min-w-0 truncate leading-snug font-medium">
          {brand.title}
        </h3>
        {brand.description && (
          <p className="text-muted-foreground line-clamp-2 text-sm">
            {brand.description}
          </p>
        )}
        {brand.colors.length > 0 && (
          <div className="mt-auto flex items-center gap-1 pt-2">
            {brand.colors.slice(0, SHOWN_COLORS).map((color) => (
              <span
                className="image-outline size-4 rounded-full"
                key={color.id}
                style={{ background: color.hex }}
                title={color.name || color.hex}
              />
            ))}
            {hidden > 0 && (
              <span className="text-muted-foreground ml-1 text-xs tabular-nums">
                +{hidden}
              </span>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}

export function BrandGrid({
  project,
  brands,
}: {
  project: Project;
  brands: Brand[];
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {brands.map((brand) => (
        <BrandCard brand={brand} key={brand._id} project={project} />
      ))}
    </div>
  );
}

/** Where brands would be: a way to start one, for whoever can. */
export function NoBrands({
  editable,
  onNew,
}: {
  editable: boolean;
  onNew: () => void;
}) {
  return (
    <Empty>
      <SwatchBookIcon
        aria-hidden
        className="text-muted-foreground size-8"
        strokeWidth={1.5}
      />
      <EmptyTitle>No brands yet</EmptyTitle>
      <EmptyDescription>
        {editable
          ? "Keep logos, colors, type and links in one place, ready to share."
          : "Brands in this project show up here."}
      </EmptyDescription>
      {editable && (
        <Button onClick={onNew}>
          <PlusIcon />
          New brand
        </Button>
      )}
    </Empty>
  );
}
