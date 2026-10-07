import { FolderLockIcon, LockIcon, PlusIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "wouter";

import { ProjectAvatar } from "@/components/project-avatar";
import { TopBar } from "@/components/top-bar";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { CARD_SURFACE, MemberAvatars } from "@/features/boards/board-card";
import { useMe } from "@/hooks/use-users";
import type { NavTable } from "@/lib/crm";
import type { Board } from "@/lib/model";
import type { Project } from "@/lib/project";
import { projectPath, splitPersonal } from "@/lib/project";
import { plural } from "@/lib/utils";

const ROLE_LABELS: Record<Project["role"], string> = {
  editor: "Can edit",
  owner: "Owner",
  viewer: "Can view",
};

function ProjectCard({
  project,
  tables,
  boards,
}: {
  project: Project;
  tables: number;
  boards: number;
}) {
  return (
    <Link className={CARD_SURFACE} href={projectPath(project)}>
      <div className="flex items-center gap-3">
        <ProjectAvatar project={project} size="md" />
        <h3 className="min-w-0 truncate leading-snug font-medium">
          {project.title}
        </h3>
        {project.role === "viewer" && (
          <span className="bg-muted text-muted-foreground ml-auto shrink-0 rounded-md px-1.5 py-0.5 text-xs">
            {ROLE_LABELS[project.role]}
          </span>
        )}
      </div>
      {project.description && (
        <p className="text-muted-foreground line-clamp-2 text-sm">
          {project.description}
        </p>
      )}
      <div className="mt-auto flex items-center justify-between gap-3 pt-2">
        {project.personalFor && project.members.length <= 1 ? (
          <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <LockIcon aria-hidden className="size-3.5" />
            Only you
          </span>
        ) : (
          <MemberAvatars
            members={project.members.map((member) => member.userId)}
          />
        )}
        <span className="text-muted-foreground text-xs tabular-nums">
          {plural(tables, "table")} · {plural(boards, "board")}
        </span>
      </div>
    </Link>
  );
}

function Section({
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

function CardsSkeleton() {
  return (
    <div aria-busy className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <Skeleton className="h-36 rounded-2xl" />
      <Skeleton className="h-36 rounded-2xl" />
      <Skeleton className="h-36 rounded-2xl max-lg:hidden" />
    </div>
  );
}

interface HomePageProps {
  boards: Board[];
  projects: Project[];
  tables: NavTable[];
  loaded: boolean;
  onNewProject: () => void;
}

export function HomePage({
  boards,
  projects,
  tables,
  loaded,
  onNewProject,
}: HomePageProps) {
  const me = useMe();
  const admin = me.role === "admin";
  const newProject = admin && (
    <Button onClick={onNewProject}>
      <PlusIcon />
      New project
    </Button>
  );

  const { personal, shared } = splitPersonal(projects, me._id);
  const card = (project: Project) => (
    <ProjectCard
      boards={boards.filter((board) => board.projectId === project._id).length}
      key={project._id}
      project={project}
      tables={tables.filter((table) => table.projectId === project._id).length}
    />
  );

  let content: ReactNode;
  if (shared.length > 0) {
    content = (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {shared.map(card)}
      </div>
    );
  } else if (!loaded) {
    content = <CardsSkeleton />;
  } else if (admin) {
    content = (
      <Empty className="bg-muted/60 rounded-2xl py-10">
        <EmptyTitle>Start your first project</EmptyTitle>
        <EmptyDescription>
          Projects hold boards, CRM tables and docs. Only the people you assign
          to a project can see it.
        </EmptyDescription>
        {newProject}
      </Empty>
    );
  } else {
    content = (
      <Empty className="bg-muted/60 rounded-2xl py-10">
        <FolderLockIcon
          aria-hidden
          className="text-muted-foreground size-8"
          strokeWidth={1.5}
        />
        <EmptyTitle>No shared projects yet</EmptyTitle>
        <EmptyDescription>
          You see a project once someone adds you to it. Until then, your
          personal project is all yours.
        </EmptyDescription>
      </Empty>
    );
  }

  return (
    <>
      <TopBar crumbs={[{ label: "Home" }]} />
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10 px-4 pt-4 pb-10 sm:px-6">
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-semibold tracking-tight">
            Hi, {me.name.split(" ")[0]}
          </h2>
          <p className="text-muted-foreground text-sm">
            {shared.length > 0
              ? `You’re on ${plural(shared.length, "project")}.`
              : "Welcome to the hub."}
          </p>
        </div>
        {personal && (
          <Section title="Personal">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {card(personal)}
            </div>
          </Section>
        )}
        <Section action={shared.length > 0 && newProject} title="Projects">
          {content}
        </Section>
      </main>
    </>
  );
}
