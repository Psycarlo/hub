import { api } from "@convex/_generated/api";
import { cn } from "cn";
import { useQuery } from "convex/react";
import { LockIcon, PlusIcon, Settings2Icon } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { Link } from "wouter";

import { IconButton } from "@/components/icon-button";
import { ProjectAvatar } from "@/components/project-avatar";
import { TopBar } from "@/components/top-bar";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyTitle } from "@/components/ui/empty";
import { FluidTooltip } from "@/components/ui/fluid-tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { boardPath } from "@/features/board/board-context";
import {
  BoardCard,
  CARD_SURFACE,
  MemberAvatars,
} from "@/features/boards/board-card";
import { BoardDialog } from "@/features/boards/board-dialog";
import { tablePath } from "@/features/crm/crm-context";
import { NewTableDialog } from "@/features/crm/new-table-dialog";
import { TableIcon } from "@/features/crm/table-icon";
import { PageGrid, useNewPage } from "@/features/docs/docs-page";
import { AccountGrid } from "@/features/finance/account-card";
import { AccountDialog } from "@/features/finance/account-dialog";
import { HabitGrid } from "@/features/habits/habit-card";
import { HabitDialog } from "@/features/habits/habit-dialog";
import { PortfolioGrid } from "@/features/portfolios/portfolio-card";
import { PortfolioDialog } from "@/features/portfolios/portfolio-dialog";
import type { ProjectItem } from "@/features/projects/new-in-project";
import { NewInProject } from "@/features/projects/new-in-project";
import { ProjectDialog } from "@/features/projects/project-dialog";
import type { CrmRecord, CrmTable, NavTable, ProjectContent } from "@/lib/crm";
import { firstValue, stageField } from "@/lib/crm";
import type { DocPage, DocsContent } from "@/lib/docs";
import type { Account } from "@/lib/finance";
import type { Habit } from "@/lib/habits";
import type { Board } from "@/lib/model";
import { SWATCH_COLORS } from "@/lib/palette";
import type { Portfolio } from "@/lib/portfolio";
import type { Project } from "@/lib/project";
import { canEdit, canManage } from "@/lib/project";

export function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex h-9 items-center justify-between gap-4">
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Share of records in each stage, as one bar split by stage color. */
function StageBar({
  table,
  records,
}: {
  table: CrmTable;
  records: CrmRecord[];
}) {
  const stage = stageField(table);
  if (!stage || records.length === 0) {
    return null;
  }
  const parts = stage.options
    .map((option) => ({
      count: records.filter(
        (record) => firstValue(record, stage.id) === option.id
      ).length,
      option,
    }))
    .filter((part) => part.count > 0);
  const won = parts
    .filter((part) => part.option.kind === "won")
    .reduce((sum, part) => sum + part.count, 0);
  const wonLabel = stage.options.find((option) => option.kind === "won")?.label;
  return (
    <div className="mt-auto flex flex-col gap-2 pt-2">
      <div className="flex h-2 gap-0.5 overflow-hidden rounded-full">
        <FluidTooltip.Group>
          {parts.map(({ option, count }) => (
            <FluidTooltip.Root key={option.id}>
              <FluidTooltip.Trigger>
                <span
                  className={cn(
                    "h-full first:rounded-l-full last:rounded-r-full",
                    SWATCH_COLORS[option.color]
                  )}
                  style={{ flexGrow: count }}
                />
              </FluidTooltip.Trigger>
              <FluidTooltip.Content>
                {option.label} <span className="tabular-nums">{count}</span>
              </FluidTooltip.Content>
            </FluidTooltip.Root>
          ))}
        </FluidTooltip.Group>
      </div>
      {wonLabel && (
        <span className="text-muted-foreground text-xs">
          <span className="text-foreground font-medium tabular-nums">
            {won}
          </span>{" "}
          {wonLabel.toLowerCase()}
        </span>
      )}
    </div>
  );
}

function TableCard({
  project,
  table,
  records,
}: {
  project: Project;
  table: CrmTable;
  records: CrmRecord[];
}) {
  return (
    <Link className={CARD_SURFACE} href={tablePath(project, table)}>
      <div className="flex items-center gap-3">
        <span className="bg-muted flex size-8 shrink-0 items-center justify-center rounded-lg">
          <TableIcon className="size-4" icon={table.icon} />
        </span>
        <h3 className="min-w-0 truncate leading-snug font-medium">
          {table.title}
        </h3>
        <span className="text-muted-foreground ml-auto text-sm tabular-nums">
          {records.length}
        </span>
      </div>
      {table.description && (
        <p className="text-muted-foreground line-clamp-2 text-sm">
          {table.description}
        </p>
      )}
      <StageBar records={records} table={table} />
    </Link>
  );
}

interface ProjectPageProps {
  project: Project;
  docs: DocsContent;
  docsLoaded: boolean;
  projects: Project[];
  boards: Board[];
  boardsLoaded: boolean;
  /** Tables in every project, known before their records load. */
  tables: NavTable[];
  /** The project's portfolios. */
  portfolios: Portfolio[];
  portfoliosLoaded: boolean;
  /** The project's finance accounts. */
  accounts: Account[];
  accountsLoaded: boolean;
  /** The project's habits; only personal projects have them. */
  habits: Habit[];
  habitsLoaded: boolean;
  content?: ProjectContent;
  loaded: boolean;
}

/** The project's CRM tables with where their records stand. */
function ProjectTables({
  project,
  tables,
  content,
  onNew,
}: {
  project: Project;
  /** The project's tables, shown as placeholders until `content` arrives. */
  tables: Pick<CrmTable, "_id">[];
  content?: ProjectContent;
  onNew: () => void;
}) {
  return (
    <Section
      action={
        canEdit(project) && (
          <Button onClick={onNew} variant="outline">
            <PlusIcon />
            New table
          </Button>
        )
      }
      title="CRM"
    >
      <div
        aria-busy={!content}
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
      >
        {content
          ? content.tables.map((table) => (
              <TableCard
                key={table._id}
                project={project}
                records={content.byTable.get(table._id) ?? []}
                table={table}
              />
            ))
          : tables.map((table) => (
              <Skeleton className="h-36 rounded-2xl" key={table._id} />
            ))}
      </div>
    </Section>
  );
}

/** The project's boards with where each stands. */
function ProjectBoards({
  project,
  boards,
  members,
  onNew,
}: {
  project: Project;
  /** The project's boards. */
  boards: Board[];
  members: string[];
  onNew: () => void;
}) {
  const progress = useQuery(api.boards.progress, { projectId: project._id });
  return (
    <Section
      action={
        canEdit(project) && (
          <Button onClick={onNew} variant="outline">
            <PlusIcon />
            New board
          </Button>
        )
      }
      title="Boards"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {boards.map((board) => (
          <BoardCard
            board={board}
            href={boardPath(project, board)}
            key={board._id}
            members={members}
            progress={progress?.find((item) => item.boardId === board._id)}
          />
        ))}
      </div>
    </Section>
  );
}

/** Who and what the project is, and its settings for whoever manages it. */
function ProjectHeader({
  project,
  members,
  onSettings,
}: {
  project: Project;
  members: string[];
  onSettings: () => void;
}) {
  // A personal project nobody else was let into.
  const alone = project.personalFor !== undefined && members.length <= 1;
  return (
    <header className="flex flex-wrap items-start gap-4">
      <ProjectAvatar project={project} size="lg" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h2 className="text-2xl font-semibold tracking-tight">
          {project.title}
        </h2>
        {project.description && (
          <p className="text-muted-foreground max-w-2xl text-sm">
            {project.description}
          </p>
        )}
        {!project.description && alone && (
          <p className="text-muted-foreground flex items-center gap-1.5 text-sm">
            <LockIcon aria-hidden className="size-3.5" />
            Only you can see this. Share it from its settings.
          </p>
        )}
      </div>
      <div className="flex items-center gap-2">
        {!alone && <MemberAvatars members={members} />}
        {canManage(project) && (
          <IconButton
            label={project.personalFor ? "Sharing" : "Project settings"}
            onClick={onSettings}
          >
            <Settings2Icon />
          </IconButton>
        )}
      </div>
    </header>
  );
}

/** A section for each kind of thing the project has; none for what it lacks. */
function ProjectSections({
  project,
  tables,
  content,
  boards,
  members,
  pages,
  portfolios,
  accounts,
  habits,
  onNew,
}: {
  project: Project;
  /** The project's tables, shown as placeholders until `content` arrives. */
  tables: Pick<CrmTable, "_id">[];
  content?: ProjectContent;
  boards: Board[];
  members: string[];
  /** The pages at the top of the project's docs. */
  pages: DocPage[];
  portfolios: Portfolio[];
  accounts: Account[];
  habits: Habit[];
  onNew: (kind: ProjectItem) => void;
}) {
  const editable = canEdit(project);
  return (
    <>
      {/* Checked off every day, so they lead. */}
      {habits.length > 0 && (
        <Section
          action={
            editable && (
              <Button onClick={() => onNew("habit")} variant="outline">
                <PlusIcon />
                New habit
              </Button>
            )
          }
          title="Habits"
        >
          <HabitGrid habits={habits} project={project} />
        </Section>
      )}
      {tables.length > 0 && (
        <ProjectTables
          content={content}
          onNew={() => onNew("table")}
          project={project}
          tables={tables}
        />
      )}
      {boards.length > 0 && (
        <ProjectBoards
          boards={boards}
          members={members}
          onNew={() => onNew("board")}
          project={project}
        />
      )}
      {pages.length > 0 && (
        <Section
          action={
            editable && (
              <Button onClick={() => onNew("page")} variant="outline">
                <PlusIcon />
                New page
              </Button>
            )
          }
          title="Docs"
        >
          <PageGrid pages={pages} project={project} />
        </Section>
      )}
      {portfolios.length > 0 && (
        <Section
          action={
            editable && (
              <Button onClick={() => onNew("portfolio")} variant="outline">
                <PlusIcon />
                New portfolio
              </Button>
            )
          }
          title="Portfolios"
        >
          <PortfolioGrid portfolios={portfolios} project={project} withTotal />
        </Section>
      )}
      {accounts.length > 0 && (
        <Section
          action={
            editable && (
              <Button onClick={() => onNew("account")} variant="outline">
                <PlusIcon />
                New account
              </Button>
            )
          }
          title="Finance"
        >
          <AccountGrid accounts={accounts} project={project} withTotal />
        </Section>
      )}
    </>
  );
}

/** Where a project's boards, tables, docs, portfolios, accounts and habits go, before it has any. */
function NoContent({
  editable,
  personal,
  onNew,
}: {
  editable: boolean;
  /** A personal project, which can keep habits too. */
  personal: boolean;
  onNew: (kind: ProjectItem) => void;
}) {
  let description =
    "Boards, tables, docs, portfolios and accounts in this project show up here.";
  if (editable && personal) {
    description =
      "Build habits, plan work on boards, track deals in CRM tables, write docs, follow bitcoin portfolios and the money in your accounts.";
  } else if (editable) {
    description =
      "Plan work on boards, track deals in CRM tables, write docs, follow bitcoin portfolios and the money in your accounts.";
  }
  return (
    <Empty className="bg-muted/60 rounded-2xl py-10">
      <EmptyTitle>Nothing here yet</EmptyTitle>
      <EmptyDescription className="max-w-sm">{description}</EmptyDescription>
      {editable && <NewInProject onNew={onNew} personal={personal} />}
    </Empty>
  );
}

/** What the page can open: the project's settings, or a new thing in it. */
type Dialog = "settings" | Exclude<ProjectItem, "page">;

export function ProjectPage({
  project,
  docs,
  docsLoaded,
  projects,
  boards,
  boardsLoaded,
  tables,
  portfolios,
  portfoliosLoaded,
  accounts,
  accountsLoaded,
  habits,
  habitsLoaded,
  content,
  loaded,
}: ProjectPageProps) {
  const [dialog, setDialog] = useState<Dialog>();
  const newPage = useNewPage(project);
  const editable = canEdit(project);
  const members = project.members.map((member) => member.userId);
  const projectBoards = boards.filter(
    (board) => board.projectId === project._id
  );
  // Until the records arrive, the tables listed for the sidebar say whether
  // there are any, so the section holds its place instead of jumping in.
  const projectTables = loaded
    ? (content?.tables ?? [])
    : tables.filter((table) => table.projectId === project._id);
  const dialogProps = (name: Dialog) => ({
    onOpenChange: (open: boolean) => setDialog(open ? name : undefined),
    open: dialog === name,
  });
  const onNew = (kind: ProjectItem) => {
    if (kind === "page") {
      newPage();
    } else {
      setDialog(kind);
    }
  };

  // Only what the project has gets a section; nothing at all gets one note.
  const hasAny = [
    projectTables,
    projectBoards,
    docs.roots,
    portfolios,
    accounts,
    habits,
  ].some((items) => items.length > 0);
  const allLoaded = [
    loaded,
    boardsLoaded,
    docsLoaded,
    portfoliosLoaded,
    accountsLoaded,
    habitsLoaded,
  ].every(Boolean);

  let body: ReactNode = (
    <ProjectSections
      accounts={accounts}
      boards={projectBoards}
      habits={habits}
      content={loaded ? content : undefined}
      members={members}
      onNew={onNew}
      pages={docs.roots}
      portfolios={portfolios}
      project={project}
      tables={projectTables}
    />
  );
  if (!(hasAny || allLoaded)) {
    body = (
      <div aria-busy className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-36 rounded-2xl" />
        <Skeleton className="h-36 rounded-2xl max-sm:hidden" />
      </div>
    );
  } else if (!hasAny) {
    body = (
      <NoContent
        editable={editable}
        onNew={onNew}
        personal={project.personalFor !== undefined}
      />
    );
  }

  return (
    <>
      <TopBar
        crumbs={[
          { icon: <ProjectAvatar project={project} />, label: project.title },
        ]}
      >
        {editable && hasAny && (
          <NewInProject
            onNew={onNew}
            personal={project.personalFor !== undefined}
            size="sm"
            variant="outline"
          />
        )}
      </TopBar>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10 px-4 pt-4 pb-10 sm:px-6">
        <ProjectHeader
          members={members}
          onSettings={() => setDialog("settings")}
          project={project}
        />
        {body}
      </main>
      <ProjectDialog
        {...dialogProps("settings")}
        project={project}
        projects={projects}
      />
      <BoardDialog
        {...dialogProps("board")}
        project={project}
        projects={projects}
      />
      <NewTableDialog {...dialogProps("table")} project={project} />
      <PortfolioDialog {...dialogProps("portfolio")} project={project} />
      <AccountDialog {...dialogProps("account")} project={project} />
      {project.personalFor && (
        <HabitDialog {...dialogProps("habit")} project={project} />
      )}
    </>
  );
}
