import { api } from "@convex/_generated/api";
import { useQuery } from "convex/react";
import { ChartSplineIcon, PlusIcon } from "lucide-react";
import { useState } from "react";

import { ProjectAvatar } from "@/components/project-avatar";
import { TopBar } from "@/components/top-bar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { HoldingsCard } from "@/features/portfolios/holdings-card";
import {
  NoPortfolios,
  PortfolioGrid,
} from "@/features/portfolios/portfolio-card";
import { PortfolioDialog } from "@/features/portfolios/portfolio-dialog";
import { Section } from "@/features/projects/project-page";
import type { Portfolio } from "@/lib/portfolio";
import { totalSats } from "@/lib/portfolio";
import type { Project } from "@/lib/project";
import { canEdit, projectPath } from "@/lib/project";

/** A project's portfolios: what they hold together, then each one. */
export function PortfoliosPage({
  project,
  portfolios,
  loaded,
}: {
  project: Project;
  /** The project's portfolios. */
  portfolios: Portfolio[];
  loaded: boolean;
}) {
  const [creating, setCreating] = useState(false);
  const editable = canEdit(project);
  // Null once the project is out of reach; the route moves on then.
  const transactions = useQuery(api.portfolios.transactions, {
    projectId: project._id,
  });

  let body = (
    <>
      <HoldingsCard
        label="All portfolios"
        sats={totalSats(portfolios)}
        transactions={transactions ?? undefined}
      />
      <Section title="Portfolios">
        <PortfolioGrid portfolios={portfolios} project={project} />
      </Section>
    </>
  );
  if (portfolios.length === 0 && !loaded) {
    body = (
      <div aria-busy className="flex flex-col gap-10">
        <Skeleton className="h-96 rounded-2xl" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-36 rounded-2xl" />
          <Skeleton className="h-36 rounded-2xl max-sm:hidden" />
        </div>
      </div>
    );
  } else if (portfolios.length === 0) {
    body = (
      <NoPortfolios editable={editable} onNew={() => setCreating(true)} page />
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
          {
            icon: (
              <ChartSplineIcon className="text-muted-foreground size-4 shrink-0" />
            ),
            label: "Portfolios",
          },
        ]}
      >
        {editable && portfolios.length > 0 && (
          <Button onClick={() => setCreating(true)} size="sm" variant="outline">
            <PlusIcon />
            New portfolio
          </Button>
        )}
      </TopBar>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10 px-4 pt-4 pb-10 sm:px-6">
        {body}
      </main>
      <PortfolioDialog
        onOpenChange={setCreating}
        open={creating}
        project={project}
      />
    </>
  );
}
