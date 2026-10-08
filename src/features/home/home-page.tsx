import { DragDropProvider } from "@dnd-kit/react";
import { cn } from "cn";
import { FolderLockIcon, LockIcon, PlusIcon } from "lucide-react";
import type { Variants } from "motion/react";
import { AnimatePresence, motion } from "motion/react";
import type { PointerEvent, ReactNode } from "react";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { Link } from "wouter";

import { ProjectAvatar } from "@/components/project-avatar";
import { TopBar } from "@/components/top-bar";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { useCardDrag } from "@/features/board/use-card-drag";
import { CARD_SURFACE, MemberAvatars } from "@/features/boards/board-card";
import { AddWidget } from "@/features/widgets/add-widget";
import { WidgetCard } from "@/features/widgets/widget-card";
import { useMe } from "@/hooks/use-users";
import type { NavTable } from "@/lib/crm";
import type { Board } from "@/lib/model";
import type { Project } from "@/lib/project";
import { projectPath, splitPersonal } from "@/lib/project";
import { plural } from "@/lib/utils";
import { moveWidgets } from "@/lib/widget-actions";
import type { Widget } from "@/lib/widgets";

const EASE = [0.23, 1, 0.32, 1] as const;
/** The gap between one part of the page rising in and the next. */
const STEP = 0.05;
const MINUTE = 60_000;

/** Rises out of a blur. A delay, passed as `custom`, places it in the page's entrance. */
const RISE: Variants = {
  hidden: { filter: "blur(4px)", opacity: 0, y: 8 },
  show: (delay?: number) => ({
    filter: "blur(0px)",
    opacity: 1,
    // Left out when not given, so a grid's stagger can set it instead.
    transition: {
      duration: 0.45,
      ease: EASE,
      ...(delay === undefined ? {} : { delay }),
    },
    y: 0,
  }),
};

/** Brings its cards in one after another, starting after the delay passed as `custom`. */
const GRID: Variants = {
  show: (delay = 0) => ({
    transition: { delayChildren: delay, staggerChildren: STEP },
  }),
};

/** Goes back the way it came, quicker. */
const LEAVE = {
  filter: "blur(4px)",
  opacity: 0,
  scale: 0.96,
  transition: { duration: 0.15, ease: EASE },
};

type Intro = "hidden" | false;

/** Set once the dashboard has played its entrance, so coming back to it is instant. */
let introPlayed = false;

/** The entrance plays on the first visit of the session only, once the projects are in. */
function useIntro(ready: boolean): Intro {
  // Read once, on arrival: playing it shouldn't cut it short.
  const intro = useMemo(() => !introPlayed, []);
  useEffect(() => {
    if (ready) {
      introPlayed = true;
    }
  }, [ready]);
  return intro ? "hidden" : false;
}

function subscribeMinute(onChange: () => void): () => void {
  const timer = setInterval(onChange, MINUTE);
  return () => clearInterval(timer);
}

/** The current minute, so the greeting and date turn over with the page left open. */
function useNow(): Date {
  const minute = useSyncExternalStore(subscribeMinute, () =>
    Math.floor(Date.now() / MINUTE)
  );
  return new Date(minute * MINUTE);
}

const TODAY = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "long",
  weekday: "long",
});

function greeting(hour: number): string {
  if (hour >= 5 && hour < 12) {
    return "Good morning";
  }
  if (hour >= 12 && hour < 18) {
    return "Good afternoon";
  }
  return "Good evening";
}

/** Moves the card's spotlight to the pointer. */
function trackSpotlight(event: PointerEvent<HTMLElement>) {
  const card = event.currentTarget;
  const { left, top } = card.getBoundingClientRect();
  card.style.setProperty("--spot-x", `${event.clientX - left}px`);
  card.style.setProperty("--spot-y", `${event.clientY - top}px`);
}

function Reveal({
  at,
  initial,
  children,
}: {
  at: number;
  initial: Intro;
  children: ReactNode;
}) {
  return (
    <motion.div animate="show" custom={at} initial={initial} variants={RISE}>
      {children}
    </motion.div>
  );
}

function CardGrid({
  at,
  initial,
  children,
}: {
  at: number;
  initial: Intro;
  children: ReactNode;
}) {
  return (
    <motion.div
      animate="show"
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
      custom={at}
      initial={initial}
      variants={GRID}
    >
      {children}
    </motion.div>
  );
}

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
    <motion.div className="grid" variants={RISE}>
      <Link
        className={cn(CARD_SURFACE, "group/card relative isolate")}
        href={projectPath(project)}
        onPointerEnter={trackSpotlight}
        onPointerMove={trackSpotlight}
      >
        <span
          aria-hidden
          className="spotlight pointer-events-none absolute inset-0 -z-10 rounded-[inherit] opacity-0 transition-opacity duration-300 ease-out group-hover/card:opacity-100"
        />
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
    </motion.div>
  );
}

function Section({
  title,
  action,
  at,
  initial,
  children,
}: {
  title: string;
  action?: ReactNode;
  at: number;
  initial: Intro;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <Reveal at={at} initial={initial}>
        <div className="flex h-9 items-center justify-between gap-4">
          <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
          {action}
        </div>
      </Reveal>
      {children}
    </section>
  );
}

/**
 * The person's widgets, in the order they've dragged them into. Widgets added
 * later rise in like the rest; removed ones sink away.
 */
function WidgetGrid({
  widgets,
  at,
  initial,
}: {
  widgets: Widget[];
  at: number;
  initial: Intro;
}) {
  const drag = useCardDrag({ widgets }, (moves) =>
    moveWidgets(moves.map(({ card, rank }) => ({ rank, widget: card })))
  );
  return (
    <DragDropProvider {...drag.props}>
      {/* Starts hidden every time, so a widget added later rises in; the
          widgets already here only do on the page's entrance. */}
      <motion.div
        animate="show"
        className="grid gap-3 empty:hidden sm:grid-cols-2 lg:grid-cols-3"
        custom={at}
        initial="hidden"
        variants={GRID}
      >
        <AnimatePresence initial={initial !== false}>
          {drag.groups.widgets.map((widget, index) => (
            <WidgetCard
              exit={LEAVE}
              index={index}
              key={widget._id}
              variants={RISE}
              widget={widget}
            />
          ))}
        </AnimatePresence>
      </motion.div>
    </DragDropProvider>
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
  /** Not there until they're in. */
  widgets?: Widget[];
  loaded: boolean;
  onNewProject: () => void;
}

export function HomePage({
  boards,
  projects,
  tables,
  widgets,
  loaded,
  onNewProject,
}: HomePageProps) {
  const me = useMe();
  const now = useNow();
  const intro = useIntro(loaded);
  const admin = me.role === "admin";
  const newProject = admin && (
    <Button onClick={onNewProject}>
      <PlusIcon />
      New project
    </Button>
  );

  const { personal, shared } = splitPersonal(projects, me._id);
  // The greeting, the widgets, then each section's heading and its cards, a step apart.
  const widgetsShift = widgets?.length ? STEP : 0;
  const personalAt = STEP + widgetsShift;
  const projectsAt = (personal ? STEP * 3 : STEP) + widgetsShift;
  const cardsAt = projectsAt + STEP;
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
      <CardGrid at={cardsAt} initial={intro}>
        {shared.map(card)}
      </CardGrid>
    );
  } else if (!loaded) {
    content = <CardsSkeleton />;
  } else if (admin) {
    content = (
      <Reveal at={cardsAt} initial={intro}>
        <Empty className="bg-muted/60 rounded-2xl py-10">
          <EmptyTitle>Start your first project</EmptyTitle>
          <EmptyDescription>
            Projects hold boards, CRM tables and docs. Only the people you
            assign to a project can see it.
          </EmptyDescription>
          {newProject}
        </Empty>
      </Reveal>
    );
  } else {
    content = (
      <Reveal at={cardsAt} initial={intro}>
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
      </Reveal>
    );
  }

  return (
    <>
      <TopBar crumbs={[{ label: "Home" }]} />
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10 px-4 pt-4 pb-10 sm:px-6">
        <Reveal at={0} initial={intro}>
          <div className="flex items-end justify-between gap-4">
            <div className="flex min-w-0 flex-col gap-1">
              <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                {TODAY.format(now)}
              </p>
              <h2 className="text-2xl font-semibold tracking-tight">
                {greeting(now.getHours())}, {me.name.split(" ")[0]}
              </h2>
              <p className="text-muted-foreground text-sm">
                {shared.length > 0
                  ? `You’re on ${plural(shared.length, "project")}.`
                  : "Welcome to the hub."}
              </p>
            </div>
            <AddWidget count={widgets?.length ?? 0} />
          </div>
        </Reveal>
        {widgets && <WidgetGrid at={STEP} initial={intro} widgets={widgets} />}
        {personal && (
          <Section at={personalAt} initial={intro} title="Personal">
            <CardGrid at={personalAt + STEP} initial={intro}>
              {card(personal)}
            </CardGrid>
          </Section>
        )}
        <Section
          action={shared.length > 0 && newProject}
          at={projectsAt}
          initial={intro}
          title="Projects"
        >
          {content}
        </Section>
      </main>
    </>
  );
}
