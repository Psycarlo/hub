import {
  BitcoinIcon,
  CameraIcon,
  ChevronRightIcon,
  HouseIcon,
  InboxIcon,
  PlusIcon,
  ShieldIcon,
  SquareKanbanIcon,
} from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";

import { Logo, LogoMark } from "@/components/logo";
import { NavLink } from "@/components/nav-link";
import { ProjectAvatar } from "@/components/project-avatar";
import { SidebarNotice, useDismissed } from "@/components/sidebar-notice";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { ADMIN_PATH, SETTINGS_PATH, UserMenu } from "@/components/user-menu";
import { boardPath } from "@/features/board/board-context";
import { findBoard, parseSlug } from "@/features/board/board-route";
import { tablePath } from "@/features/crm/crm-context";
import { TableIcon } from "@/features/crm/table-icon";
import { SidebarDocs } from "@/features/docs/sidebar-docs";
import { INBOX_PATH } from "@/features/inbox/inbox-page";
import { portfolioPath } from "@/features/portfolios/portfolio-context";
import { useMe } from "@/hooks/use-users";
import type { NavTable } from "@/lib/crm";
import type { DocsContent } from "@/lib/docs";
import { EMPTY_DOCS } from "@/lib/docs";
import type { Board } from "@/lib/model";
import type { Portfolio } from "@/lib/portfolio";
import type { Project } from "@/lib/project";
import { canEdit, projectPath, splitPersonal } from "@/lib/project";

/** Asks people without a photo to add one, until they do or wave it away. */
function PhotoNotice() {
  const me = useMe();
  const [dismissed, dismiss] = useDismissed(`photo:${me._id}`);
  return (
    <SidebarNotice
      action={{ href: SETTINGS_PATH, label: "Upload a photo" }}
      className="group-data-[collapsible=icon]:hidden"
      description="So your team can spot you on cards, comments and docs."
      icon={<CameraIcon />}
      onDismiss={dismiss}
      show={!(me.image || dismissed)}
      title="Add a profile photo"
    />
  );
}

/** Projects shown open until the user folds them. */
const OPEN_BY_DEFAULT = 3;
const MAX_BADGE = 99;

/** The board the current page shows, if any. */
function useOpenBoard(boards: Board[]): Board | undefined {
  const [location] = useLocation();
  // Board pages sit one level deep: `/HUB` or `/HUB-12`.
  const [, segment = "", ...rest] = location.split("/");
  const slug = rest.length === 0 ? parseSlug(segment) : undefined;
  return slug ? findBoard(boards, slug.code) : undefined;
}

interface ProjectItemProps {
  project: Project;
  tables: NavTable[];
  docs: DocsContent;
  /** This project's boards. */
  boards: Board[];
  /** This project's portfolios. */
  portfolios: Portfolio[];
  openBoard?: Board;
  location: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Folded into the icon column, where only the project shows. */
  rail: boolean;
}

function ProjectItem({
  project,
  tables,
  docs,
  boards,
  portfolios,
  openBoard,
  location,
  open,
  onOpenChange,
  rail,
}: ProjectItemProps) {
  const base = projectPath(project);
  return (
    <Collapsible
      onOpenChange={onOpenChange}
      // Folds with the sidebar, so the rows below slide rather than jump.
      open={open && !rail}
      render={<SidebarMenuItem />}
    >
      <SidebarMenuButton
        // Wide enough for the avatar, centred in the icon column.
        className="pl-1.5 group-data-[collapsible=icon]:p-1.5!"
        isActive={location === base}
        render={<NavLink href={base} />}
        tooltip={project.title}
      >
        <ProjectAvatar project={project} />
        <span>{project.title}</span>
      </SidebarMenuButton>
      <CollapsibleTrigger
        render={
          <SidebarMenuAction
            aria-label={`${open ? "Collapse" : "Expand"} ${project.title}`}
            className="[&>svg]:transition-transform [&>svg]:duration-200 [&>svg]:ease-out data-panel-open:[&>svg]:rotate-90"
          />
        }
      >
        <ChevronRightIcon />
      </CollapsibleTrigger>
      <CollapsibleContent keepMounted>
        <SidebarMenuSub className="pt-0.5">
          {tables.map((table) => {
            const href = tablePath(project, table);
            return (
              <SidebarMenuSubItem key={table._id}>
                <SidebarMenuSubButton
                  isActive={
                    location === href || location.startsWith(`${href}/`)
                  }
                  render={<NavLink href={href} />}
                >
                  <TableIcon icon={table.icon} />
                  <span>{table.title}</span>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            );
          })}
          {boards.map((board) => (
            <SidebarMenuSubItem key={board._id}>
              <SidebarMenuSubButton
                isActive={board._id === openBoard?._id}
                render={<NavLink href={boardPath(board)} />}
              >
                <SquareKanbanIcon />
                <span>{board.title}</span>
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
          ))}
          {portfolios.map((portfolio) => {
            const href = portfolioPath(project, portfolio);
            return (
              <SidebarMenuSubItem key={portfolio._id}>
                <SidebarMenuSubButton
                  isActive={
                    location === href || location.startsWith(`${href}/`)
                  }
                  render={<NavLink href={href} />}
                >
                  <BitcoinIcon />
                  <span>{portfolio.title}</span>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            );
          })}
          <SidebarDocs
            canEdit={canEdit(project)}
            docs={docs}
            project={project}
          />
        </SidebarMenuSub>
      </CollapsibleContent>
    </Collapsible>
  );
}

interface AppSidebarProps {
  boards: Board[];
  projects: Project[];
  tables: NavTable[];
  /** Every project's doc pages, by project id. */
  docs: Map<string, DocsContent>;
  /** Portfolios in every project. */
  portfolios: Portfolio[];
  /** Unread notifications in the inbox. */
  unread: number;
  onNewProject: () => void;
}

export function AppSidebar({
  boards,
  projects,
  tables,
  docs,
  portfolios,
  unread,
  onNewProject,
}: AppSidebarProps) {
  const me = useMe();
  const admin = me.role === "admin";
  const [location] = useLocation();
  const openBoard = useOpenBoard(boards);
  const { isMobile, state } = useSidebar();
  const [folded, setFolded] = useState<Record<string, boolean>>({});
  const { personal, shared } = splitPersonal(projects, me._id);

  const isOpen = (project: Project, projectBoards: Board[]): boolean => {
    const choice = folded[project._id];
    if (choice !== undefined) {
      return choice;
    }
    return (
      project === personal ||
      shared.length <= OPEN_BY_DEFAULT ||
      location.startsWith(projectPath(project)) ||
      projectBoards.some((board) => board._id === openBoard?._id)
    );
  };

  const item = (project: Project) => {
    const projectBoards = boards.filter(
      (board) => board.projectId === project._id
    );
    return (
      <ProjectItem
        boards={projectBoards}
        docs={docs.get(project._id) ?? EMPTY_DOCS}
        key={project._id}
        location={location}
        onOpenChange={(open) => setFolded({ ...folded, [project._id]: open })}
        open={isOpen(project, projectBoards)}
        openBoard={openBoard}
        portfolios={portfolios.filter(
          (portfolio) => portfolio.projectId === project._id
        )}
        project={project}
        rail={state === "collapsed"}
        tables={tables.filter((table) => table.projectId === project._id)}
      />
    );
  };

  return (
    <Sidebar collapsible="icon">
      {/* The mark sits on the icon column's centre line, folded or not. */}
      <SidebarHeader className="flex-row items-center py-3 pl-2.5">
        <NavLink
          aria-label="Home"
          className="focus-visible:ring-ring/50 -mx-1.5 flex min-w-0 items-center rounded-lg px-1.5 py-1 outline-none focus-visible:ring-3"
          href="/"
        >
          <Logo className="h-7 group-data-[collapsible=icon]:hidden" />
          <LogoMark className="hidden size-7 group-data-[collapsible=icon]:block" />
        </NavLink>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive={location === "/"}
                render={<NavLink href="/" />}
                tooltip="Home"
              >
                <HouseIcon />
                <span>Home</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive={location === INBOX_PATH}
                render={<NavLink href={INBOX_PATH} />}
                tooltip="Inbox"
              >
                <InboxIcon />
                <span>Inbox</span>
                {unread > 0 && (
                  <span className="sr-only">, {unread} unread</span>
                )}
              </SidebarMenuButton>
              {unread > 0 && (
                <SidebarMenuBadge
                  aria-hidden
                  className="text-foreground font-medium"
                >
                  {unread > MAX_BADGE ? `${MAX_BADGE}+` : unread}
                </SidebarMenuBadge>
              )}
              {/* The count has no room in the icon column; a dot stands in. */}
              {unread > 0 && (
                <span
                  aria-hidden
                  className="bg-primary ring-sidebar pointer-events-none absolute top-1.5 left-5 hidden size-2 rounded-full ring-2 group-data-[collapsible=icon]:block"
                />
              )}
            </SidebarMenuItem>
            {admin && (
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={location === ADMIN_PATH}
                  render={<NavLink href={ADMIN_PATH} />}
                  tooltip="Admin"
                >
                  <ShieldIcon />
                  <span>Admin</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )}
          </SidebarMenu>
        </SidebarGroup>
        {/* Your own project sits apart, above the ones shared with you. */}
        {personal && (
          <SidebarGroup>
            <SidebarMenu>{item(personal)}</SidebarMenu>
          </SidebarGroup>
        )}
        <SidebarGroup>
          <SidebarGroupLabel>Projects</SidebarGroupLabel>
          {admin && (
            <SidebarGroupAction onClick={onNewProject} title="New project">
              <PlusIcon />
              <span className="sr-only">New project</span>
            </SidebarGroupAction>
          )}
          <SidebarMenu>
            {shared.map(item)}
            {shared.length === 0 && admin && (
              <SidebarMenuItem>
                <SidebarMenuButton
                  className="text-muted-foreground"
                  onClick={onNewProject}
                  tooltip="New project"
                >
                  <PlusIcon />
                  <span>New project</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )}
            {shared.length === 0 && !admin && (
              <li className="text-muted-foreground px-2 py-1.5 text-xs transition-opacity duration-200 ease-out group-data-[collapsible=icon]:opacity-0">
                No projects shared with you yet.
              </li>
            )}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <PhotoNotice />
        <SidebarMenu>
          <SidebarMenuItem>
            <UserMenu />
          </SidebarMenuItem>
        </SidebarMenu>
        {/* Bottom left, folded or not, so it's always where the hand expects. */}
        {!isMobile && <SidebarTrigger />}
      </SidebarFooter>
    </Sidebar>
  );
}
