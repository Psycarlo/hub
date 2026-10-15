import { cn } from "cn";
import {
  CheckIcon,
  ChevronDownIcon,
  CopyIcon,
  PaletteIcon,
  PencilIcon,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import { ICON_SWAP, copyText, useCopy } from "@/components/copy";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AddPlaceholder, ShowcaseSection } from "@/features/brands/brand-parts";
import type { Brand, BrandColor } from "@/lib/brands";
import {
  TOKEN_FORMATS,
  contrast,
  contrastGrade,
  formatCmyk,
  formatHsl,
  formatRgb,
  paletteTokens,
} from "@/lib/brands";
import { isLight } from "@/lib/color";
import type { HexColor } from "@/lib/palette";
import { playSound } from "@/lib/sounds";

const WHITE: HexColor = "#ffffff";
const BLACK: HexColor = "#000000";

/** A value of the color, copied on click. */
function ColorValue({ label, value }: { label: string; value: string }) {
  const { copied, copy } = useCopy();
  return (
    <button
      className="hover:bg-foreground/5 focus-visible:ring-ring/50 group/value -mx-2 flex items-center gap-3 rounded-lg px-2 py-1 text-left outline-none focus-visible:ring-3"
      onClick={() => copy(value)}
      title={`Copy ${label}`}
      type="button"
    >
      <span className="text-muted-foreground w-10 shrink-0 text-[11px] font-medium tracking-wide uppercase">
        {label}
      </span>
      <span className="min-w-0 flex-1 truncate font-mono text-xs tabular-nums">
        {value}
      </span>
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          className="text-muted-foreground flex opacity-0 transition-opacity duration-150 group-hover/value:opacity-100 group-focus-visible/value:opacity-100 data-[copied=true]:opacity-100"
          data-copied={copied}
          key={copied ? "copied" : "copy"}
          {...ICON_SWAP}
        >
          {copied ? (
            <CheckIcon className="size-3.5" />
          ) : (
            <CopyIcon className="size-3.5" />
          )}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}

/** How readable white and black text are on the color, as WCAG grades it. */
function ContrastChip({ color, text }: { color: HexColor; text: HexColor }) {
  const ratio = contrast(color, text);
  const grade = contrastGrade(ratio);
  return (
    <div
      className="image-outline flex items-center gap-2 rounded-lg px-2.5 py-1.5"
      style={{ background: color, color: text }}
      title={`${text === WHITE ? "White" : "Black"} text: ${ratio.toFixed(2)} to 1`}
    >
      <span className="text-sm font-semibold">Aa</span>
      <span className="font-mono text-[11px] tabular-nums opacity-80">
        {ratio.toFixed(1)}
      </span>
      <span
        className={cn(
          "ml-auto rounded px-1 text-[10px] font-semibold tracking-wide whitespace-nowrap",
          grade === "—" && "line-through opacity-60"
        )}
        style={{
          background:
            text === WHITE ? "rgb(255 255 255 / 0.18)" : "rgb(0 0 0 / 0.1)",
        }}
      >
        {grade === "—" ? "AA" : grade}
      </span>
    </div>
  );
}

function Swatch({ color, lead }: { color: BrandColor; lead: boolean }) {
  const { copied, copy } = useCopy();
  const light = isLight(color.hex);
  return (
    <article
      className={cn(
        "bg-card shadow-surface flex flex-col overflow-hidden rounded-2xl",
        lead && "sm:col-span-2"
      )}
    >
      <button
        className={cn(
          "focus-visible:ring-ring/50 relative flex w-full flex-col items-start justify-end gap-0.5 p-4 text-left outline-none focus-visible:ring-3 focus-visible:ring-inset",
          lead ? "h-44" : "h-32",
          light ? "text-black/80" : "text-white"
        )}
        onClick={() => copy(color.hex)}
        style={{ background: color.hex }}
        title="Copy hex"
        type="button"
      >
        <span className="absolute top-3 right-3 flex text-current opacity-70">
          <AnimatePresence initial={false} mode="popLayout">
            <motion.span
              className="flex"
              key={copied ? "copied" : "copy"}
              {...ICON_SWAP}
            >
              {copied ? (
                <CheckIcon className="size-4" />
              ) : (
                <CopyIcon className="size-4" />
              )}
            </motion.span>
          </AnimatePresence>
        </span>
        <span
          className={cn(
            "font-semibold tracking-tight",
            lead ? "text-xl" : "text-base"
          )}
        >
          {color.name || color.hex.toUpperCase()}
        </span>
        {color.name && (
          <span className="font-mono text-xs uppercase opacity-75">
            {color.hex}
          </span>
        )}
      </button>
      <div className="@container flex flex-1 flex-col gap-3 p-4">
        <div className="flex flex-col">
          <ColorValue label="Hex" value={color.hex.toUpperCase()} />
          <ColorValue label="RGB" value={formatRgb(color.hex)} />
          <ColorValue label="HSL" value={formatHsl(color.hex)} />
          <ColorValue label="CMYK" value={formatCmyk(color.hex)} />
        </div>
        {/* Side by side only with room for "AA Large" in each; else stacked. */}
        <div className="mt-auto grid grid-cols-1 gap-1.5 @[17rem]:grid-cols-2">
          <ContrastChip color={color.hex} text={WHITE} />
          <ContrastChip color={color.hex} text={BLACK} />
        </div>
      </div>
    </article>
  );
}

/** The palette as one bar, each color as wide as its place says. */
function PaletteBar({ colors }: { colors: BrandColor[] }) {
  return (
    <div className="image-outline flex h-3 overflow-hidden rounded-full">
      {colors.map((color, index) => (
        <span
          className="h-full"
          key={color.id}
          style={{
            background: color.hex,
            // The lead color takes most, the rest less down the list.
            flexGrow: Math.max(1, colors.length - index),
          }}
          title={color.name || color.hex}
        />
      ))}
    </div>
  );
}

export function ColorsSection({
  number,
  brand,
  editable,
  onEdit,
}: {
  number: number;
  brand: Brand;
  editable: boolean;
  onEdit: () => void;
}) {
  const { colors } = brand;
  return (
    <ShowcaseSection
      action={
        <>
          {colors.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button size="sm" variant="outline" />}
              >
                Copy as
                <ChevronDownIcon />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {TOKEN_FORMATS.map(({ format, label }) => (
                  <DropdownMenuItem
                    key={format}
                    onClick={async () => {
                      if (await copyText(paletteTokens(brand, format))) {
                        playSound("tap");
                      }
                    }}
                  >
                    {label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {editable && colors.length > 0 && (
            <Button onClick={onEdit} size="sm" variant="ghost">
              <PencilIcon />
              Edit
            </Button>
          )}
        </>
      }
      description="The first leads. Click a swatch or any value to copy it; the chips show how white and black text read on each."
      eyebrow="Color"
      number={number}
      title="Colors"
    >
      {colors.length > 0 ? (
        <div className="flex flex-col gap-3">
          <PaletteBar colors={colors} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {colors.map((color, index) => (
              <Swatch color={color} key={color.id} lead={index === 0} />
            ))}
          </div>
        </div>
      ) : (
        <AddPlaceholder
          className="min-h-40"
          hint="Name them and give their hex; values and contrast follow."
          icon={<PaletteIcon />}
          onClick={onEdit}
          title="Add the brand’s colors"
        />
      )}
    </ShowcaseSection>
  );
}
