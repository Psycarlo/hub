import { BookOpenTextIcon, PlusIcon } from "lucide-react";
import { useLocation } from "wouter";

import { ProjectAvatar } from "@/components/project-avatar";
import { TopBar } from "@/components/top-bar";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { pagePath } from "@/features/docs/docs-context";
import { PageCard } from "@/features/docs/page-card";
import type { DocPage, DocsContent } from "@/lib/docs";
import { createPage } from "@/lib/docs-actions";
import type { Project } from "@/lib/project";
import { canEdit, projectPath } from "@/lib/project";

export function PageGrid({
  project,
  pages,
}: {
  project: Project;
  pages: DocPage[];
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {pages.map((page) => (
        <PageCard key={page._id} page={page} project={project} />
      ))}
    </div>
  );
}

/** Starts a page at the top of the project's docs and opens it. */
export function useNewPage(project: Project) {
  const [, navigate] = useLocation();
  return async () => {
    const pageId = await createPage(project._id);
    if (pageId) {
      navigate(pagePath(project, { _id: pageId, title: "" }));
    }
  };
}

/** A project's docs: the pages at the top. */
export function DocsPage({
  project,
  docs,
  loaded,
}: {
  project: Project;
  docs: DocsContent;
  loaded: boolean;
}) {
  const newPage = useNewPage(project);
  const editable = canEdit(project);

  let body = <PageGrid pages={docs.roots} project={project} />;
  if (docs.roots.length === 0 && !loaded) {
    body = (
      <div aria-busy className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-36 rounded-2xl" />
        <Skeleton className="h-36 rounded-2xl max-sm:hidden" />
        <Skeleton className="h-36 rounded-2xl max-lg:hidden" />
      </div>
    );
  } else if (docs.roots.length === 0) {
    body = editable ? (
      <Empty className="bg-muted/60 rounded-2xl py-10">
        <EmptyDescription className="mt-0 max-w-sm">
          Write down how the team works, in pages inside pages.
        </EmptyDescription>
        <Button onClick={newPage}>
          <PlusIcon />
          New page
        </Button>
      </Empty>
    ) : (
      <p className="text-muted-foreground text-sm">
        No pages in this project yet.
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
          {
            icon: (
              <BookOpenTextIcon className="text-muted-foreground size-4 shrink-0" />
            ),
            label: "Docs",
          },
        ]}
      >
        {editable && docs.roots.length > 0 && (
          <Button onClick={newPage} size="sm" variant="outline">
            <PlusIcon />
            New page
          </Button>
        )}
      </TopBar>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 pt-4 pb-10 sm:px-6">
        {body}
      </main>
    </>
  );
}
