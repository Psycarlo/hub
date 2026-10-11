import { cn } from "cn";
import type { CSSProperties, ReactNode } from "react";

import { BrandCover, BrandMark } from "@/features/brands/brand-card";
import { ShowcaseSection } from "@/features/brands/brand-parts";
import { linkLabel, platformOf } from "@/features/brands/platforms";
import type { Brand, BrandFile, LogoKind, LogoMode } from "@/lib/brands";
import { cssFamily, logoFor } from "@/lib/brands";
import { isLight } from "@/lib/color";
import type { HexColor } from "@/lib/palette";

const INK: HexColor = "#0a0d14";
const PAPER: HexColor = "#ffffff";
/** Logos that fit a wide space, best first, and ones that fit a square. */
const WIDE: LogoKind[] = ["lockup", "wordmark", "symbol"];
const SQUARE: LogoKind[] = ["symbol", "icon", "lockup"];

/** What the mockups draw with: the brand's colors, type and logos, with sensible stand-ins. */
interface Kit {
  brand: Brand;
  files: BrandFile[];
  primary: HexColor;
  /** Text that reads on the primary color. */
  onPrimary: HexColor;
  heading?: CSSProperties;
  body?: CSSProperties;
  /** The first social link with a handle, as it reads. */
  handle: string;
}

function textOn(color: HexColor): HexColor {
  return isLight(color) ? INK : PAPER;
}

/** A logo made for the background, or the brand's name set in its heading type instead. */
function LogoOn({
  kit,
  kinds,
  mode,
  className,
  textClassName,
}: {
  kit: Kit;
  kinds: LogoKind[];
  mode: LogoMode;
  className: string;
  textClassName: string;
}) {
  const logo = logoFor(kit.files, kinds, mode);
  if (logo?.mode === mode) {
    return (
      <img
        alt=""
        className={cn("object-contain", className)}
        draggable={false}
        src={logo.file.url}
      />
    );
  }
  return (
    <span
      className={cn("truncate font-semibold tracking-tight", textClassName)}
      style={kit.heading}
    >
      {kit.brand.title}
    </span>
  );
}

function Stage({ label, children }: { label: string; children: ReactNode }) {
  return (
    <figure className="flex flex-col gap-2">
      <div className="bg-muted/70 bg-grain flex min-h-80 items-center justify-center overflow-hidden rounded-2xl p-6">
        {children}
      </div>
      <figcaption className="text-muted-foreground px-1 text-xs">
        {label}
      </figcaption>
    </figure>
  );
}

function Profile({ kit }: { kit: Kit }) {
  const { brand } = kit;
  return (
    <div className="bg-card shadow-raised w-full max-w-72 overflow-hidden rounded-2xl">
      <BrandCover brand={brand} className="h-20" />
      <div className="flex flex-col gap-2 px-4 pb-4">
        <div className="flex items-end justify-between gap-2">
          <BrandMark
            brand={brand}
            className="ring-card -mt-7 size-14 rounded-full text-xl ring-4"
          />
          <span
            className="flex h-7 items-center rounded-full px-3.5 text-xs font-semibold"
            style={{ background: kit.primary, color: kit.onPrimary }}
          >
            Follow
          </span>
        </div>
        <div className="flex min-w-0 flex-col">
          <span
            className="truncate leading-tight font-semibold"
            style={kit.heading}
          >
            {brand.title}
          </span>
          <span className="text-muted-foreground truncate text-xs">
            {kit.handle}
          </span>
        </div>
        {brand.description && (
          <p
            className="text-muted-foreground line-clamp-3 text-xs leading-relaxed"
            style={kit.body}
          >
            {brand.description}
          </p>
        )}
      </div>
    </div>
  );
}

function BusinessCards({ kit }: { kit: Kit }) {
  const { brand } = kit;
  const frontMode: LogoMode = isLight(kit.primary) ? "light" : "dark";
  const contact = [brand.website, ...brand.socials.slice(0, 1)]
    .filter(Boolean)
    .map(linkLabel);
  return (
    // The front, in the brand's color, sits behind; the back with the details lies on top.
    <div className="relative aspect-[1/0.85] w-full max-w-80">
      <div
        className="shadow-raised absolute top-[2%] right-0 flex aspect-[1.75] w-[78%] rotate-6 items-center justify-center rounded-lg"
        style={{ background: kit.primary, color: kit.onPrimary }}
      >
        <LogoOn
          className="h-[38%] max-w-[50%]"
          kinds={SQUARE}
          kit={kit}
          mode={frontMode}
          textClassName="text-lg"
        />
      </div>
      <div
        className="shadow-raised absolute bottom-[2%] left-0 flex aspect-[1.75] w-[78%] -rotate-3 flex-col justify-between rounded-lg p-[6%]"
        style={{ background: PAPER, color: INK }}
      >
        <LogoOn
          className="h-6 max-w-[60%] self-start"
          kinds={WIDE}
          kit={kit}
          mode="light"
          textClassName="text-sm"
        />
        <div className="flex flex-col text-[9px] leading-snug" style={kit.body}>
          <span className="font-semibold">{brand.title}</span>
          {contact.map((line) => (
            <span className="truncate opacity-60" key={line}>
              {line}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function Website({ kit }: { kit: Kit }) {
  const { brand } = kit;
  const host = brand.website ? linkLabel(brand.website).split("/")[0] : "";
  const accent = brand.colors[1]?.hex ?? kit.primary;
  return (
    <div
      className="shadow-raised w-full max-w-80 overflow-hidden rounded-xl"
      style={{ background: PAPER, color: INK }}
    >
      <div className="flex h-7 items-center gap-1 bg-black/[0.04] px-2.5">
        {["#ff5f57", "#febc2e", "#28c840"].map((dot) => (
          <span
            className="size-2 rounded-full"
            key={dot}
            style={{ background: dot }}
          />
        ))}
        <span className="mx-auto h-4 w-1/2 truncate rounded-full bg-black/[0.05] px-2 text-center text-[8px] leading-4 text-black/50">
          {host || `${brand.title.toLowerCase().replaceAll(/\s+/gu, "")}.com`}
        </span>
      </div>
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between gap-3">
          <LogoOn
            className="h-4 max-w-[45%]"
            kinds={WIDE}
            kit={kit}
            mode="light"
            textClassName="text-xs"
          />
          <span
            className="flex gap-2 text-[8px] text-black/45"
            style={kit.body}
          >
            <span>About</span>
            <span>Work</span>
            <span>Contact</span>
          </span>
        </div>
        <div className="flex flex-col gap-1.5 pt-3">
          <span
            className="line-clamp-2 text-xl leading-tight font-semibold tracking-tight"
            style={kit.heading}
          >
            {brand.title}
          </span>
          {brand.description && (
            <span
              className="line-clamp-2 text-[10px] leading-relaxed text-black/55"
              style={kit.body}
            >
              {brand.description}
            </span>
          )}
        </div>
        <div className="flex gap-1.5 pt-1 pb-2" style={kit.body}>
          <span
            className="rounded-full px-3 py-1 text-[9px] font-semibold"
            style={{ background: kit.primary, color: kit.onPrimary }}
          >
            Get started
          </span>
          <span
            className="rounded-full border px-3 py-1 text-[9px] font-semibold"
            style={{ borderColor: `${accent}55`, color: accent }}
          >
            Learn more
          </span>
        </div>
      </div>
    </div>
  );
}

/** The brand put to work: a profile, business cards and a site, drawn from what it has now. */
export function MockupsSection({
  number,
  brand,
  files,
}: {
  number: number;
  brand: Brand;
  files: BrandFile[];
}) {
  const [heading, second] = brand.fonts;
  const body = second ?? heading;
  const primary = brand.colors[0]?.hex ?? INK;
  const handled = brand.socials.find((link) => platformOf(link)?.handle);
  const kit: Kit = {
    body: body ? { fontFamily: cssFamily(body) } : undefined,
    brand,
    files,
    handle: handled
      ? linkLabel(handled)
      : `@${brand.title.toLowerCase().replaceAll(/[^\da-z]+/gu, "")}`,
    heading: heading ? { fontFamily: cssFamily(heading) } : undefined,
    onPrimary: textOn(primary),
    primary,
  };
  return (
    <ShowcaseSection
      description="How it comes together, drawn from the brand as it is now."
      eyebrow="Preview"
      number={number}
      title="In use"
    >
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        <Stage label="Social profile">
          <Profile kit={kit} />
        </Stage>
        <Stage label="Business cards">
          <BusinessCards kit={kit} />
        </Stage>
        <Stage label="Website">
          <Website kit={kit} />
        </Stage>
      </div>
    </ShowcaseSection>
  );
}
