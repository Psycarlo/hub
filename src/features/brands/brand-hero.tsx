import { PencilIcon, PlusIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { BrandCover, BrandMark } from "@/features/brands/brand-card";
import { linkLabel, platformOf } from "@/features/brands/platforms";
import { SocialIcon } from "@/features/brands/social-icon";
import type { Brand } from "@/lib/brands";
import { cssFamily, textFonts } from "@/lib/brands";

/** The brand's own site, then its profiles elsewhere, as pills. */
function Links({ brand }: { brand: Brand }) {
  const links = [
    ...(brand.website ? [{ link: brand.website, website: true }] : []),
    ...brand.socials.map((link) => ({ link, website: false })),
  ];
  return (
    <ul className="flex flex-wrap gap-1.5">
      {links.map(({ link, website }) => {
        const platform = website ? undefined : platformOf(link);
        return (
          <li key={link}>
            <a
              className="bg-foreground/5 hover:bg-foreground/10 focus-visible:ring-ring/50 inline-flex h-8 max-w-64 items-center gap-2 rounded-full pr-3.5 pl-2.5 text-sm transition-colors duration-150 ease-out outline-none focus-visible:ring-3"
              href={link}
              rel="noreferrer"
              target="_blank"
              title={platform ? `${platform.name}: ${link}` : link}
            >
              <SocialIcon
                className="size-4 shrink-0"
                platform={platform}
                website={website}
              />
              <span className="truncate">{linkLabel(link)}</span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}

/** The brand at a glance: its banner, mark and name, what it is and where it lives. */
export function BrandHero({
  brand,
  editable,
  onEdit,
}: {
  brand: Brand;
  editable: boolean;
  /** Opens its name, description and links. */
  onEdit: () => void;
}) {
  const { heading, body } = textFonts(brand.fonts);
  const hasLinks = brand.website !== "" || brand.socials.length > 0;
  return (
    <section className="bg-card shadow-surface overflow-hidden rounded-3xl">
      <BrandCover
        brand={brand}
        className="aspect-[5/2] max-h-80 w-full sm:aspect-[4/1]"
      />
      <div className="flex flex-col gap-5 px-5 pb-6 sm:px-8 sm:pb-8">
        <div className="flex items-end justify-between gap-4">
          <BrandMark
            brand={brand}
            className="ring-card -mt-10 size-20 rounded-[1.375rem] text-3xl ring-[6px] sm:-mt-12 sm:size-24 sm:rounded-[1.625rem]"
          />
          {editable && (
            <Button onClick={onEdit} size="sm" variant="outline">
              <PencilIcon />
              Edit details
            </Button>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <h1
            className="text-3xl font-semibold tracking-tight text-balance sm:text-5xl"
            style={heading ? { fontFamily: cssFamily(heading) } : undefined}
          >
            {brand.title}
          </h1>
          {brand.description && (
            <p
              className="text-muted-foreground max-w-2xl text-base text-pretty whitespace-pre-line sm:text-lg"
              style={body ? { fontFamily: cssFamily(body) } : undefined}
            >
              {brand.description}
            </p>
          )}
        </div>
        {hasLinks && <Links brand={brand} />}
        {!hasLinks && editable && (
          <Button
            className="self-start"
            onClick={onEdit}
            size="sm"
            variant="ghost"
          >
            <PlusIcon />
            Add website and social links
          </Button>
        )}
      </div>
      {brand.colors.length > 0 && (
        <div aria-hidden className="flex h-1.5">
          {brand.colors.map((color) => (
            <span
              className="flex-1"
              key={color.id}
              style={{ background: color.hex }}
            />
          ))}
        </div>
      )}
    </section>
  );
}
