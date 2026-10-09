import { api } from "@convex/_generated/api";
import { useQuery } from "convex/react";
import { LandmarkIcon, PlusIcon, TagsIcon } from "lucide-react";
import { useState } from "react";

import { IconButton } from "@/components/icon-button";
import { ProjectAvatar } from "@/components/project-avatar";
import { TopBar } from "@/components/top-bar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AccountGrid, NoAccounts } from "@/features/finance/account-card";
import { AccountDialog } from "@/features/finance/account-dialog";
import { CategoriesDialog } from "@/features/finance/categories-dialog";
import type { Account } from "@/lib/finance";
import type { Project } from "@/lib/project";
import { canEdit, projectPath } from "@/lib/project";

/** A project's finance accounts, with this month across them. */
export function FinancePage({
  project,
  accounts,
  loaded,
}: {
  project: Project;
  /** The project's accounts. */
  accounts: Account[];
  loaded: boolean;
}) {
  const [dialog, setDialog] = useState<"account" | "categories">();
  const editable = canEdit(project);
  const categories = useQuery(api.finance.categories, {
    projectId: project._id,
  });

  let body = <AccountGrid accounts={accounts} project={project} withTotal />;
  if (accounts.length === 0 && !loaded) {
    body = (
      <div aria-busy className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-36 rounded-2xl" />
        <Skeleton className="h-36 rounded-2xl max-sm:hidden" />
      </div>
    );
  } else if (accounts.length === 0) {
    body = (
      <NoAccounts editable={editable} onNew={() => setDialog("account")} />
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
              <LandmarkIcon className="text-muted-foreground size-4 shrink-0" />
            ),
            label: "Finance",
          },
        ]}
      >
        {editable && accounts.length > 0 && (
          <>
            <IconButton
              label="Categories"
              onClick={() => setDialog("categories")}
            >
              <TagsIcon />
            </IconButton>
            <Button
              onClick={() => setDialog("account")}
              size="sm"
              variant="outline"
            >
              <PlusIcon />
              New account
            </Button>
          </>
        )}
      </TopBar>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10 px-4 pt-4 pb-10 sm:px-6">
        {body}
      </main>
      <AccountDialog
        onOpenChange={(open) => setDialog(open ? "account" : undefined)}
        open={dialog === "account"}
        project={project}
      />
      {editable && (
        <CategoriesDialog
          categories={categories ?? undefined}
          onOpenChange={(open) => setDialog(open ? "categories" : undefined)}
          open={dialog === "categories"}
          projectId={project._id}
        />
      )}
    </>
  );
}
