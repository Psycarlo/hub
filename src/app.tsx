import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "@convex/_generated/api";
import {
  Authenticated,
  AuthLoading,
  Unauthenticated,
  useQuery,
} from "convex/react";
import { SquareKanbanIcon } from "lucide-react";
import { MotionConfig } from "motion/react";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { DefaultParams } from "wouter";
import { Redirect, Route, Switch, useRoute } from "wouter";

import { AppSidebar } from "@/components/app-sidebar";
import { ErrorBoundary } from "@/components/error-boundary";
import { ProjectAvatar } from "@/components/project-avatar";
import { AccessRemoved, LoadingScreen } from "@/components/status-screens";
import type { Crumb } from "@/components/top-bar";
import { TopBar } from "@/components/top-bar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ADMIN_PATH, SETTINGS_PATH } from "@/components/user-menu";
import { AdminPage } from "@/features/admin/admin-page";
import { BoardRoute, findBoard, parseSlug } from "@/features/board/board-route";
import { HomePage } from "@/features/home/home-page";
import { INBOX_PATH, InboxPage } from "@/features/inbox/inbox-page";
import { LoginPage } from "@/features/login/login-page";
import { ProjectDialog } from "@/features/projects/project-dialog";
import { SettingsPage } from "@/features/settings/settings-page";
import { useInbox } from "@/hooks/use-inbox";
import type { User } from "@/hooks/use-users";
import { MeContext, useMe } from "@/hooks/use-users";
import { run } from "@/lib/actions";
import { convex } from "@/lib/convex";
import type { NavTable } from "@/lib/crm";
import type { DocPage } from "@/lib/docs";
import { docsByProject } from "@/lib/docs";
import type { Board } from "@/lib/model";
import type { Project } from "@/lib/project";
import { projectPath } from "@/lib/project";

// regexparam's types misread several optional segments in a row.
interface ProjectParams extends DefaultParams {
  readonly project: string;
  readonly table?: string;
  readonly record?: string;
}

const NO_PROJECTS: Project[] = [];
const NO_BOARDS: Board[] = [];
const NO_TABLES: NavTable[] = [];
const NO_PAGES: DocPage[] = [];

function boardCrumbs(code: string, board?: Board, project?: Project): Crumb[] {
  const crumb: Crumb = {
    icon: (
      <SquareKanbanIcon className="text-muted-foreground size-4 shrink-0" />
    ),
    label: board?.title ?? code,
  };
  return project
    ? [
        {
          href: projectPath(project),
          icon: <ProjectAvatar project={project} />,
          label: project.title,
        },
        crumb,
      ]
    : [crumb];
}

// Projects carry the CRM and its table library, which board-only visits never need.
const ProjectRoute = lazy(async () => {
  const module = await import("@/features/projects/project-route");
  return { default: module.ProjectRoute };
});

function RouteFallback() {
  return (
    <>
      <TopBar crumbs={[]} />
      <main
        aria-busy
        className="flex grow flex-col gap-4 px-4 pt-4 pb-8 sm:px-6"
      >
        <Skeleton className="h-9 w-64 rounded-full" />
        <Skeleton className="min-h-64 grow rounded-2xl" />
      </main>
    </>
  );
}

/** Accounts made before personal projects existed get theirs on first visit. */
function useEnsurePersonal(projects: Project[] | undefined) {
  const me = useMe();
  const asked = useRef(false);
  const missing =
    projects !== undefined &&
    !projects.some((project) => project.personalFor === me._id);
  useEffect(() => {
    if (missing && !asked.current) {
      asked.current = true;
      run(convex.mutation(api.projects.ensurePersonal, {}));
    }
  }, [missing]);
}

function Workspace() {
  const projectList = useQuery(api.projects.list);
  useEnsurePersonal(projectList);
  const boardList = useQuery(api.boards.list);
  const tables = useQuery(api.crm.navTables) ?? NO_TABLES;
  const pages = useQuery(api.docs.tree);
  const inbox = useInbox();
  const projects = projectList ?? NO_PROJECTS;
  const boards = boardList ?? NO_BOARDS;
  const docs = docsByProject(pages ?? NO_PAGES);
  const [creatingProject, setCreatingProject] = useState(false);
  const [, params] = useRoute<{ slug: string }>("/:slug");
  const slug = params ? parseSlug(params.slug) : undefined;
  const board = slug ? findBoard(boards, slug.code) : undefined;
  const boardProject = board
    ? projects.find((project) => project._id === board.projectId)
    : undefined;
  const projectsLoaded = projectList !== undefined;
  const newProject = () => setCreatingProject(true);

  return (
    <SidebarProvider>
      <AppSidebar
        boards={boards}
        docs={docs}
        onNewProject={newProject}
        projects={projects}
        tables={tables}
        unread={inbox.unread}
      />
      <SidebarInset>
        <Switch>
          <Route path="/">
            <HomePage
              boards={boards}
              loaded={projectsLoaded && boardList !== undefined}
              onNewProject={newProject}
              projects={projects}
              tables={tables}
            />
          </Route>
          <Route<ProjectParams> path="/p/:project/:table?/:record?">
            {(route) => (
              <Suspense fallback={<RouteFallback />}>
                <ProjectRoute
                  boards={boards}
                  docs={docs}
                  docsLoaded={pages !== undefined}
                  loaded={projectsLoaded}
                  projects={projects}
                  recordId={route.record}
                  slug={route.project}
                  tableSlug={route.table}
                />
              </Suspense>
            )}
          </Route>
          <Route path={INBOX_PATH}>
            <InboxPage inbox={inbox} />
          </Route>
          <Route path={SETTINGS_PATH}>
            <SettingsPage />
          </Route>
          <Route path={ADMIN_PATH}>
            <AdminPage />
          </Route>
          {slug && (
            <Route path="/:slug">
              <TopBar crumbs={boardCrumbs(slug.code, board, boardProject)} />
              <BoardRoute
                board={board}
                cardNumber={slug.number}
                loaded={projectsLoaded && boardList !== undefined}
                project={boardProject}
                projects={projects}
              />
            </Route>
          )}
          <Route>
            <Redirect replace to="/" />
          </Route>
        </Switch>
      </SidebarInset>
      <ProjectDialog
        onOpenChange={setCreatingProject}
        open={creatingProject}
        projects={projects}
      />
    </SidebarProvider>
  );
}

/** An account whose user record is gone signs out, back to the sign-in page. */
function SignOut() {
  const { signOut } = useAuthActions();
  useEffect(() => {
    signOut();
  }, [signOut]);
  return <LoadingScreen />;
}

function SignedIn() {
  const me: User | null | undefined = useQuery(api.users.me);
  if (me === undefined) {
    return <LoadingScreen />;
  }
  if (me === null) {
    return <SignOut />;
  }
  if (me.deactivated) {
    return <AccessRemoved email={me.email} />;
  }
  return (
    <MeContext value={me}>
      <Workspace />
    </MeContext>
  );
}

export function App() {
  return (
    <MotionConfig reducedMotion="user">
      <TooltipProvider>
        <ErrorBoundary>
          <AuthLoading>
            <LoadingScreen />
          </AuthLoading>
          <Unauthenticated>
            <LoginPage />
          </Unauthenticated>
          <Authenticated>
            <SignedIn />
          </Authenticated>
        </ErrorBoundary>
        <Toaster position="bottom-center" />
      </TooltipProvider>
    </MotionConfig>
  );
}
