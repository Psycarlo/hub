import { api } from "@convex/_generated/api";
import type { Doc } from "@convex/_generated/dataModel";
import { cn } from "cn";
import { useQuery } from "convex/react";
import {
  BookOpenTextIcon,
  EllipsisIcon,
  FileIcon,
  SmilePlusIcon,
} from "lucide-react";
import type { ChangeEvent, KeyboardEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";

import { IconButton } from "@/components/icon-button";
import { MarkdownView } from "@/components/markdown-editor";
import type { BlockCommand } from "@/components/markdown-editor/blocks";
import { dropEmptyLine } from "@/components/markdown-editor/blocks";
import { ProjectAvatar } from "@/components/project-avatar";
import type { Crumb } from "@/components/top-bar";
import { TopBar } from "@/components/top-bar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { docsPath, pagePath } from "@/features/docs/docs-context";
import { IconPicker } from "@/features/docs/icon-picker";
import type { PageEditorHandle } from "@/features/docs/page-editor";
import { PageEditor } from "@/features/docs/page-editor";
import { PageIcon } from "@/features/docs/page-icon";
import { PageMenu } from "@/features/docs/page-menu";
import { useMe } from "@/hooks/use-users";
import { run } from "@/lib/actions";
import { convex } from "@/lib/convex";
import type { DocPage, DocsContent } from "@/lib/docs";
import { ancestors, pageTitle } from "@/lib/docs";
import { createPage, updatePage } from "@/lib/docs-actions";
import type { Project } from "@/lib/project";
import { canEdit, projectPath } from "@/lib/project";

const ICON =
  "-ml-1 flex size-16 items-center justify-center self-start rounded-xl text-5xl leading-none";
const TITLE = "text-3xl leading-tight font-bold tracking-tight sm:text-4xl";

interface PageViewProps {
  project: Project;
  docs: DocsContent;
  page: DocPage;
}

function crumbsFor(
  project: Project,
  docs: DocsContent,
  page: DocPage
): Crumb[] {
  return [
    {
      href: projectPath(project),
      icon: <ProjectAvatar project={project} />,
      label: project.title,
    },
    {
      href: docsPath(project),
      icon: (
        <BookOpenTextIcon className="text-muted-foreground size-4 shrink-0" />
      ),
      label: "Docs",
    },
    ...ancestors(docs, page).map((parent) => ({
      href: pagePath(project, parent),
      icon: <PageIcon className="text-muted-foreground" page={parent} />,
      label: pageTitle(parent),
    })),
    {
      icon: <PageIcon className="text-muted-foreground" page={page} />,
      label: pageTitle(page),
    },
  ];
}

/** The pages under this one, listed after its text. */
function SubPages({ project, pages }: { project: Project; pages: DocPage[] }) {
  return (
    <section
      aria-label="Pages inside"
      className="flex flex-col gap-1 border-t pt-6"
    >
      {pages.map((child) => (
        <Link
          className="hover:bg-foreground/5 focus-visible:ring-ring/50 -mx-2 flex min-w-0 items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors duration-150 outline-none focus-visible:ring-3"
          href={pagePath(project, child)}
          key={child._id}
        >
          <PageIcon className="text-muted-foreground" page={child} />
          <span
            className={cn(
              "truncate font-medium underline decoration-current/20 underline-offset-3",
              !child.title.trim() && "text-muted-foreground"
            )}
          >
            {pageTitle(child)}
          </span>
        </Link>
      ))}
    </section>
  );
}

/** Seeing the page counts as reading the mentions of you on it. */
function useReadMentions(page: DocPage) {
  const inbox = useQuery(api.inbox.list);
  const unread = inbox?.some(
    (item) => item.kind === "page" && item.page._id === page._id && !item.read
  );
  useEffect(() => {
    if (unread) {
      run(convex.mutation(api.inbox.readPage, { pageId: page._id }));
    }
  }, [unread, page._id]);
}

/** The page's icon, title and text, edited in place. */
function EditablePage({
  project,
  docs,
  page,
  full,
}: PageViewProps & { full: Doc<"docPages"> }) {
  const [, navigate] = useLocation();
  const me = useMe();
  const editor = useRef<PageEditorHandle>(null);
  // The title being typed, until the field is left.
  const [title, setTitle] = useState<string>();

  const addPage = async () => {
    const pageId = await createPage(project._id, { parentId: page._id });
    if (pageId) {
      navigate(pagePath(project, { _id: pageId, title: "" }));
    }
  };

  const commands: BlockCommand[] = [
    {
      icon: FileIcon,
      id: "page",
      keywords: ["page", "subpage", "child", "document"],
      label: "Page inside",
      run: (chain) => {
        addPage();
        return dropEmptyLine(chain);
      },
    },
  ];

  const onPublish = async (content: string, base: number) => {
    // A page someone deleted stays deleted, even with edits left to save.
    if (!docs.byId.has(page._id)) {
      return;
    }
    return await run(
      convex.mutation(api.docs.save, { base, content, pageId: page._id })
    );
  };

  const saveTitle = () => {
    if (title !== undefined && title !== page.title) {
      updatePage(page, { title });
    }
    setTitle(undefined);
  };

  const onTitleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    const field = event.currentTarget;
    const atEnd = field.selectionStart === field.value.length;
    if (
      (event.key === "Enter" && !event.nativeEvent.isComposing) ||
      (event.key === "ArrowDown" && atEnd)
    ) {
      event.preventDefault();
      saveTitle();
      editor.current?.focus("start");
    }
  };

  return (
    <>
      <div className="group/title flex flex-col gap-2">
        <IconPicker
          icon={page.icon}
          onChange={(icon) => updatePage(page, { icon })}
          trigger={
            page.icon ? (
              <button
                aria-label="Change icon"
                className={cn(
                  ICON,
                  "hover:bg-foreground/5 focus-visible:ring-ring/50 transition-colors duration-150 outline-none focus-visible:ring-3"
                )}
                type="button"
              >
                {page.icon}
              </button>
            ) : (
              <Button
                className="text-muted-foreground -ml-2 self-start opacity-0 transition-opacity duration-150 group-hover/title:opacity-100 focus-visible:opacity-100 data-popup-open:opacity-100 pointer-coarse:opacity-100"
                size="sm"
                variant="ghost"
              >
                <SmilePlusIcon />
                Add icon
              </Button>
            )
          }
        />
        <textarea
          aria-label="Title"
          className={cn(
            TITLE,
            "placeholder:text-muted-foreground/60 field-sizing-content w-full resize-none bg-transparent outline-none"
          )}
          onBlur={saveTitle}
          onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
            setTitle(event.target.value.replaceAll("\n", " "))
          }
          onKeyDown={onTitleKeyDown}
          placeholder="Untitled"
          rows={1}
          value={title ?? page.title}
        />
      </div>
      <div className="mt-4">
        <PageEditor
          commands={commands}
          key={page._id}
          latest={{ content: full.content, revision: full.revision }}
          onPublish={onPublish}
          people={project.members
            .map((member) => member.userId)
            .filter((userId) => userId !== me._id)}
          ref={editor}
        />
      </div>
      {/* Clicking under the text carries on writing at its end. */}
      <div
        aria-hidden
        className="min-h-24 grow cursor-text"
        onClick={() => editor.current?.focus("end")}
      />
    </>
  );
}

/** The page as its newest version reads, for viewers of the project. */
function ReadOnlyPage({
  page,
  full,
}: {
  page: DocPage;
  full: Doc<"docPages">;
}) {
  return (
    <>
      <div className="flex flex-col gap-2">
        {page.icon && <span className={ICON}>{page.icon}</span>}
        <h2
          className={cn(
            TITLE,
            "wrap-break-word",
            !page.title.trim() && "text-muted-foreground/60"
          )}
        >
          {pageTitle(page)}
        </h2>
      </div>
      <MarkdownView className="page-text mt-4" value={full.content} />
      <div aria-hidden className="min-h-24 grow" />
    </>
  );
}

function PageSkeleton() {
  return (
    <div aria-busy className="flex flex-col gap-4">
      <Skeleton className="h-10 w-2/3 rounded-xl" />
      <Skeleton className="h-4 w-full rounded-full" />
      <Skeleton className="h-4 w-5/6 rounded-full" />
      <Skeleton className="h-4 w-3/4 rounded-full" />
    </div>
  );
}

/** One doc page: its icon, title and text, then the pages inside it. */
export function PageView({ project, docs, page }: PageViewProps) {
  const full = useQuery(api.docs.get, { pageId: page._id });
  const children = docs.children.get(page._id) ?? [];
  useReadMentions(page);
  const editable = canEdit(project);
  let body = <PageSkeleton />;
  if (full && editable) {
    body = (
      <EditablePage docs={docs} full={full} page={page} project={project} />
    );
  } else if (full) {
    body = <ReadOnlyPage full={full} page={page} />;
  }
  return (
    <>
      <TopBar crumbs={crumbsFor(project, docs, page)}>
        <PageMenu
          canEdit={editable}
          docs={docs}
          page={page}
          project={project}
          trigger={
            <IconButton label="Page options">
              <EllipsisIcon />
            </IconButton>
          }
        />
      </TopBar>
      <main className="flex grow flex-col">
        <article className="mx-auto flex w-full max-w-3xl grow flex-col px-4 pt-6 pb-10 sm:px-16 sm:pt-14">
          {body}
          {children.length > 0 && (
            <SubPages pages={children} project={project} />
          )}
        </article>
      </main>
    </>
  );
}
