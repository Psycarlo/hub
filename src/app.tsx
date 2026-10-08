import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "@convex/_generated/api";
import {
  Authenticated,
  AuthLoading,
  Unauthenticated,
  useQuery,
} from "convex/react";
import { MotionConfig } from "motion/react";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { DefaultParams } from "wouter";
import { Redirect, Route, Switch } from "wouter";

import { AppSidebar } from "@/components/app-sidebar";
import { ErrorBoundary } from "@/components/error-boundary";
import { PageGlow } from "@/components/page-glow";
import { AccessRemoved, LoadingScreen } from "@/components/status-screens";
import { TopBar } from "@/components/top-bar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ADMIN_PATH, SETTINGS_PATH } from "@/components/user-menu";
import { AdminPage } from "@/features/admin/admin-page";
import { BOARD_ROUTE } from "@/features/board/board-context";
import { BoardRoute } from "@/features/board/board-route";
import { FocusMode } from "@/features/focus/focus-mode";
import { HomePage } from "@/features/home/home-page";
import { INBOX_PATH, InboxPage } from "@/features/inbox/inbox-page";
import { LoginPage } from "@/features/login/login-page";
import { ProjectDialog } from "@/features/projects/project-dialog";
import { SettingsPage } from "@/features/settings/settings-page";
import { useInbox } from "@/hooks/use-inbox";
import type { User } from "@/hooks/use-users";
import { MeContext, useMe } from "@/hooks/use-users";
import { run } from "@/lib/actions";
import { useBrandSync, useUnreadIcon } from "@/lib/brand";
import { convex } from "@/lib/convex";
import type { NavTable } from "@/lib/crm";
import type { DocPage } from "@/lib/docs";
import { docsByProject } from "@/lib/docs";
import type { Board } from "@/lib/model";
import type { Portfolio } from "@/lib/portfolio";
import type { Project } from "@/lib/project";

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
const NO_PORTFOLIOS: Portfolio[] = [];

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
  const portfolioList = useQuery(api.portfolios.list);
  const widgets = useQuery(api.widgets.list);
  const inbox = useInbox();
  useUnreadIcon(inbox.unread > 0);
  const projects = projectList ?? NO_PROJECTS;
  const boards = boardList ?? NO_BOARDS;
  const docs = docsByProject(pages ?? NO_PAGES);
  const portfolios = portfolioList ?? NO_PORTFOLIOS;
  const [creatingProject, setCreatingProject] = useState(false);
  const projectsLoaded = projectList !== undefined;
  const boardsLoaded = boardList !== undefined;
  const newProject = () => setCreatingProject(true);

  return (
    <SidebarProvider>
      <AppSidebar
        boards={boards}
        docs={docs}
        onNewProject={newProject}
        portfolios={portfolios}
        projects={projects}
        tables={tables}
        unread={inbox.unread}
      />
      <SidebarInset>
        <PageGlow />
        {/* Positioned, so every page paints over the glow. */}
        <div className="relative flex min-w-0 flex-1 flex-col">
          <Switch>
            <Route path="/">
              <HomePage
                boards={boards}
                loaded={projectsLoaded && boardsLoaded && widgets !== undefined}
                onNewProject={newProject}
                projects={projects}
                tables={tables}
                widgets={widgets}
              />
            </Route>
            <Route path={BOARD_ROUTE}>
              {(route) => (
                <BoardRoute
                  boards={boards}
                  loaded={projectsLoaded && boardsLoaded}
                  projects={projects}
                  slug={route.slug}
                />
              )}
            </Route>
            <Route<ProjectParams> path="/p/:project/:table?/:record?">
              {(route) => (
                <Suspense fallback={<RouteFallback />}>
                  <ProjectRoute
                    boards={boards}
                    boardsLoaded={boardsLoaded}
                    docs={docs}
                    docsLoaded={pages !== undefined}
                    loaded={projectsLoaded}
                    portfolios={portfolios}
                    portfoliosLoaded={portfolioList !== undefined}
                    projects={projects}
                    recordId={route.record}
                    slug={route.project}
                    tableSlug={route.table}
                    tables={tables}
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
            {/* Short links like `/HUB-12`, after the app's own pages so those always win. */}
            <Route path="/:slug">
              {(route) => (
                <BoardRoute
                  boards={boards}
                  loaded={projectsLoaded && boardsLoaded}
                  projects={projects}
                  slug={route.slug}
                />
              )}
            </Route>
            <Route>
              <Redirect replace to="/" />
            </Route>
          </Switch>
        </div>
      </SidebarInset>
      <ProjectDialog
        onOpenChange={setCreatingProject}
        open={creatingProject}
        projects={projects}
      />
      <FocusMode widgets={widgets} />
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

/** Keeps the favicon on the hub's logo. */
function BrandSync() {
  useBrandSync();
  return null;
}

export function App() {
  return (
    <MotionConfig reducedMotion="user">
      <TooltipProvider>
        <ErrorBoundary>
          <BrandSync />
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
