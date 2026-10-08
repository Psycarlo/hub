import { BitcoinIcon, ChartSplineIcon, PlusIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "wouter";

import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyTitle } from "@/components/ui/empty";
import { CARD_SURFACE } from "@/features/boards/board-card";
import {
  portfolioPath,
  portfoliosPath,
} from "@/features/portfolios/portfolio-context";
import { useMe } from "@/hooks/use-users";
import { useBtcPrices } from "@/lib/bitcoin-price";
import type { Portfolio } from "@/lib/portfolio";
import { fiatValue, formatBtc, formatFiat, totalSats } from "@/lib/portfolio";
import type { Project } from "@/lib/project";
import { plural } from "@/lib/utils";

function HoldingsCardLink({
  href,
  icon,
  title,
  description,
  sats,
  price,
}: {
  href: string;
  icon: ReactNode;
  title: string;
  description?: string;
  sats: number;
  /** What one bitcoin costs now, once known. */
  price?: number;
}) {
  const { currency: fiat } = useMe();
  return (
    <Link className={CARD_SURFACE} href={href}>
      <div className="flex items-center gap-3">
        <span className="bg-muted flex size-8 shrink-0 items-center justify-center rounded-lg [&_svg]:size-4">
          {icon}
        </span>
        <h3 className="min-w-0 truncate leading-snug font-medium">{title}</h3>
      </div>
      {description && (
        <p className="text-muted-foreground line-clamp-2 text-sm">
          {description}
        </p>
      )}
      <div className="mt-auto flex flex-col pt-2 tabular-nums">
        <span className="text-lg font-semibold tracking-tight">
          {price === undefined ? "—" : formatFiat(fiatValue(sats, price), fiat)}
        </span>
        <span className="text-muted-foreground text-sm">{formatBtc(sats)}</span>
      </div>
    </Link>
  );
}

/**
 * The project's portfolios as cards, worth what bitcoin costs now; `withTotal`
 * leads with one for all of them together, once there's more than one.
 */
export function PortfolioGrid({
  project,
  portfolios,
  withTotal = false,
}: {
  project: Project;
  portfolios: Portfolio[];
  withTotal?: boolean;
}) {
  const { currency: fiat } = useMe();
  const price = useBtcPrices().data?.[fiat];
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {withTotal && portfolios.length > 1 && (
        <HoldingsCardLink
          description={`${plural(portfolios.length, "portfolio")} together`}
          href={portfoliosPath(project)}
          icon={<ChartSplineIcon />}
          price={price}
          sats={totalSats(portfolios)}
          title="Total"
        />
      )}
      {portfolios.map((portfolio) => (
        <HoldingsCardLink
          description={portfolio.description}
          href={portfolioPath(project, portfolio)}
          icon={<BitcoinIcon />}
          key={portfolio._id}
          price={price}
          sats={portfolio.sats}
          title={portfolio.title}
        />
      ))}
    </div>
  );
}

/** Where portfolios would be: a way to start one, for whoever can. */
export function NoPortfolios({
  editable,
  onNew,
}: {
  editable: boolean;
  onNew: () => void;
}) {
  return (
    <Empty>
      <ChartSplineIcon
        aria-hidden
        className="text-muted-foreground size-8"
        strokeWidth={1.5}
      />
      <EmptyTitle>No portfolios yet</EmptyTitle>
      <EmptyDescription>
        {editable
          ? "Track bitcoin bought and sold, and see what it’s worth over time."
          : "Portfolios in this project show up here."}
      </EmptyDescription>
      {editable && (
        <Button onClick={onNew}>
          <PlusIcon />
          New portfolio
        </Button>
      )}
    </Empty>
  );
}
