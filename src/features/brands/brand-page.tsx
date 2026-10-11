import { api } from "@convex/_generated/api";
import { useQuery } from "convex/react";
import { BookOpenIcon, PackageIcon, SwatchBookIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

import { ProjectAvatar } from "@/components/project-avatar";
import { TopBar } from "@/components/top-bar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { BannersSection } from "@/features/brands/banners-section";
import { saveBrandBook } from "@/features/brands/brand-book-job";
import { BrandDialog } from "@/features/brands/brand-dialog";
import { BrandHero } from "@/features/brands/brand-hero";
import { brandsPath } from "@/features/brands/brands-context";
import { ColorsDialog } from "@/features/brands/colors-dialog";
import { ColorsSection } from "@/features/brands/colors-section";
import { FontDialog } from "@/features/brands/font-dialog";
import { LogosSection } from "@/features/brands/logos-section";
import { MockupsSection } from "@/features/brands/mockups-section";
import { TypeSection } from "@/features/brands/type-section";
import { useMe } from "@/hooks/use-users";
import { useBrandFonts } from "@/lib/brand-fonts";
import { downloadKit } from "@/lib/brand-kit";
import type { Brand, BrandFile, BrandFont } from "@/lib/brands";
import { bannerFiles, logoFiles } from "@/lib/brands";
import type { Project } from "@/lib/project";
import { canEdit, canManage, projectPath } from "@/lib/project";

const NO_FILES: BrandFile[] = [];

type Dialog = "details" | "colors" | "font";

/** Waits while the brand's files load, in the shape of what's coming. */
function LoadingSections() {
  return (
    <div aria-busy className="flex flex-col gap-3">
      <Skeleton className="h-9 w-48 rounded-full" />
      <div className="grid gap-3 sm:grid-cols-2">
        <Skeleton className="aspect-[16/9] rounded-2xl" />
        <Skeleton className="aspect-[16/9] rounded-2xl max-sm:hidden" />
      </div>
    </div>
  );
}

/**
 * The parts of the guidelines to show, in order: all of them for whoever can
 * fill them in, and only what's filled in for everyone else. Numbered as they
 * show, so they count from one without gaps.
 */
function showcaseParts({
  brand,
  files,
  editable,
  onColors,
  onFont,
}: {
  brand: Brand;
  files: BrandFile[];
  editable: boolean;
  onColors: () => void;
  onFont: (font?: BrandFont) => void;
}): { key: string; render: (number: number) => ReactNode }[] {
  const shared = { brand, editable, files };
  const hasLook =
    brand.mark !== undefined ||
    brand.colors.length > 0 ||
    brand.fonts.length > 0;
  const parts = [
    {
      key: "logos",
      render: (number: number) => <LogosSection {...shared} number={number} />,
      shown: logoFiles(files).length > 0,
    },
    {
      key: "colors",
      render: (number: number) => (
        <ColorsSection
          brand={brand}
          editable={editable}
          number={number}
          onEdit={onColors}
        />
      ),
      shown: brand.colors.length > 0,
    },
    {
      key: "type",
      render: (number: number) => (
        <TypeSection {...shared} number={number} onEdit={onFont} />
      ),
      shown: brand.fonts.length > 0,
    },
    {
      key: "mockups",
      render: (number: number) => (
        <MockupsSection brand={brand} files={files} number={number} />
      ),
      // Nothing to put to work yet, even for whoever could fill it in.
      shown: hasLook,
      whenEmpty: false,
    },
    {
      key: "banners",
      render: (number: number) => (
        <BannersSection {...shared} number={number} />
      ),
      shown: bannerFiles(files).length > 0,
    },
  ];
  return parts.filter(
    (part) => part.shown || (editable && part.whenEmpty !== false)
  );
}

/**
 * A brand as its guidelines: logos for every background, colors with their
 * values, typefaces set in themselves, the brand in use and its banners.
 * Whoever can edit the project fills each part in place.
 */
export function BrandPage({
  project,
  brand,
  alone = false,
}: {
  project: Project;
  brand: Brand;
  /** The project's only brand, with no list of them to go back to. */
  alone?: boolean;
}) {
  const me = useMe();
  const editable = canEdit(project);
  const manageable =
    editable && (canManage(project) || brand.createdBy === me._id);
  // Null once the brand is out of reach; the route moves on then.
  const loaded = useQuery(api.brands.files, { brandId: brand._id });
  const files = loaded ?? NO_FILES;
  useBrandFonts(brand, loaded ?? undefined);
  const [dialog, setDialog] = useState<Dialog>();
  // Kept while the dialog closes, so it doesn't change under its exit.
  const [font, setFont] = useState<BrandFont>();
  const [drawing, setDrawing] = useState(false);

  const dialogProps = (name: Dialog) => ({
    onOpenChange: (open: boolean) => setDialog(open ? name : undefined),
    open: dialog === name,
  });
  const editFont = (picked?: BrandFont) => {
    setFont(picked);
    setDialog("font");
  };
  const drawBook = async () => {
    setDrawing(true);
    await saveBrandBook(brand, files);
    setDrawing(false);
  };

  const parts = showcaseParts({
    brand,
    editable,
    files,
    onColors: () => setDialog("colors"),
    onFont: editFont,
  });

  let body: ReactNode = parts.map((part, index) => (
    <div key={part.key}>{part.render(index + 1)}</div>
  ));
  if (loaded === undefined) {
    body = <LoadingSections />;
  } else if (parts.length === 0) {
    body = (
      <p className="text-muted-foreground py-6 text-center text-sm">
        Nothing in this brand yet.
      </p>
    );
  }

  return (
    <>
      <TopBar
        crumbs={[
          {
            href: projectPath(project),
            icon: <ProjectAvatar project={project} />,
            label: project.title,
          },
          ...(alone
            ? []
            : [
                {
                  href: brandsPath(project),
                  icon: (
                    <SwatchBookIcon className="text-muted-foreground size-4 shrink-0" />
                  ),
                  label: "Brands",
                },
              ]),
          { label: brand.title },
        ]}
      >
        <Button
          disabled={loaded === undefined}
          onClick={() => downloadKit(brand, files)}
          size="sm"
          variant="outline"
        >
          <PackageIcon />
          <span className="max-sm:sr-only">Brand kit</span>
        </Button>
        <Button
          disabled={loaded === undefined || drawing}
          onClick={drawBook}
          size="sm"
        >
          {drawing ? <Spinner /> : <BookOpenIcon />}
          <span className="max-sm:sr-only">Brand book</span>
        </Button>
      </TopBar>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-14 px-4 pt-4 pb-16 sm:px-6">
        <BrandHero
          brand={brand}
          editable={editable}
          onEdit={() => setDialog("details")}
        />
        {body}
      </main>
      {editable && (
        <>
          <BrandDialog
            {...dialogProps("details")}
            brand={brand}
            manageable={manageable}
            project={project}
          />
          <ColorsDialog {...dialogProps("colors")} brand={brand} />
          <FontDialog
            {...dialogProps("font")}
            brand={brand}
            files={files}
            font={font}
            key={font?.id ?? "new"}
          />
        </>
      )}
    </>
  );
}
