import "@kitlangton/rolling-number/styles.css";
import { api } from "@convex/_generated/api";
import { RollingNumber } from "@kitlangton/rolling-number/react";
import { cn } from "cn";
import { useQuery } from "convex/react";
import {
  CheckIcon,
  CircleDashedIcon,
  FlameIcon,
  NotebookPenIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "wouter";

import { Skeleton } from "@/components/ui/skeleton";
import { ON_SWATCH } from "@/features/habits/check-button";
import { logPath } from "@/features/log/log-context";
import { TopicBadge } from "@/features/log/topic-icon";
import type { WidgetKind } from "@/features/widgets/widget-kind";
import { WidgetBleed } from "@/features/widgets/widget-parts";
import { useLogDays, useLogOverview } from "@/hooks/use-log";
import { useToday } from "@/hooks/use-today";
import { useMe } from "@/hooks/use-users";
import type { LogDay, LogTopic } from "@/lib/log";
import { LOG_COLOR, linkedProject } from "@/lib/log";
import { checkTopic, unlogTopic } from "@/lib/log-actions";
import { CHIP_COLORS, SWATCH_COLORS } from "@/lib/palette";
import type { Project } from "@/lib/project";
import { canEdit, splitPersonal } from "@/lib/project";
import { plural } from "@/lib/utils";
import type { SettingsOf } from "@/lib/widgets";
import { LOG_DEFAULTS } from "@/lib/widgets";

type Settings = SettingsOf<"log">;

/** Rows of topics the card shows at once; more scroll. */
const SHOWN = 3;
const ROW_HEIGHT = 32;

const NO_PROJECTS: Project[] = [];
const NO_TOPICS: LogTopic[] = [];

/** The person's own project, its topics, and every project they can see, as they load. */
function useOwnLog(): {
  personal?: Project;
  topics?: LogTopic[];
  projects: Project[];
} {
  const me = useMe();
  const projects = useQuery(api.projects.list);
  const all = useQuery(api.log.topics);
  const personal = projects && splitPersonal(projects, me._id).personal;
  return {
    personal,
    projects: projects ?? NO_PROJECTS,
    topics:
      all &&
      (personal
        ? all.filter((topic) => topic.projectId === personal._id)
        : NO_TOPICS),
  };
}

function Chip({
  color,
  icon: Icon,
  children,
}: {
  color: string;
  icon: typeof FlameIcon;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1 rounded-full pr-2 pl-1.5 text-xs font-medium tabular-nums transition-colors duration-150 ease-out",
        color
      )}
    >
      <Icon aria-hidden className="size-3.5" />
      {children}
    </span>
  );
}

/** Today's topic, filled in its color once it's logged; a tap logs it or takes it back. */
function TopicToggle({
  topic,
  project,
  entry,
  today,
  editable,
}: {
  topic: LogTopic;
  project?: Project;
  entry?: LogDay;
  today: string;
  editable: boolean;
}) {
  const logged = entry !== undefined;
  return (
    <button
      aria-pressed={logged}
      className={cn(
        "focus-visible:ring-ring/50 inline-flex h-7 max-w-full items-center gap-1.5 rounded-full pr-2.5 pl-0.5 text-xs font-medium transition-[background-color,color,scale] duration-150 ease-out outline-none focus-visible:ring-3 active:scale-[0.96] disabled:pointer-events-none",
        logged
          ? cn(SWATCH_COLORS[topic.color], ON_SWATCH[topic.color])
          : "bg-foreground/5 hover:bg-foreground/10"
      )}
      disabled={!editable}
      onClick={() =>
        entry ? unlogTopic(topic, today, entry.note) : checkTopic(topic, today)
      }
      title={entry?.note || undefined}
      type="button"
    >
      {logged ? (
        <span className="flex size-6 shrink-0 items-center justify-center">
          <CheckIcon aria-hidden className="size-3.5" />
        </span>
      ) : (
        <TopicBadge
          className="size-6 rounded-full"
          project={project}
          size="sm"
          topic={topic}
        />
      )}
      <span className="truncate">{topic.title}</span>
    </button>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="text-muted-foreground flex h-full items-center justify-center px-4 text-center text-xs">
      {children}
    </p>
  );
}

function LogBody() {
  const today = useToday();
  const { personal, topics, projects } = useOwnLog();
  const days = useLogDays(personal, today, topics ?? NO_TOPICS);
  const overview = useLogOverview(personal, today);
  const ready = personal && topics && days.loaded;
  const entries = new Map(
    days.on(today).map((entry) => [entry.topicId as string, entry])
  );
  const count = entries.size;
  // What's still worked on, and anything archived that was logged today anyway.
  const shown = topics?.filter(
    (topic) => !topic.archived || entries.has(topic._id)
  );

  let list: ReactNode = (
    <div aria-busy className="flex flex-wrap gap-1.5 p-3">
      <Skeleton className="h-7 w-24 rounded-full" />
      <Skeleton className="h-7 w-20 rounded-full" />
      <Skeleton className="h-7 w-28 rounded-full" />
    </div>
  );
  if (ready && shown?.length === 0) {
    list = (
      <Empty>
        <Link
          className="hover:text-foreground underline-offset-4 transition-colors duration-150 hover:underline"
          draggable={false}
          href={logPath(personal)}
        >
          Start your log in {personal.title}
        </Link>
      </Empty>
    );
  } else if (ready && shown) {
    list = (
      <ul
        aria-label="Topics"
        className="flex h-full flex-wrap content-start gap-1.5 overflow-y-auto p-3"
      >
        {shown.map((topic) => (
          <li className="max-w-full" key={topic._id}>
            <TopicToggle
              editable={canEdit(personal)}
              entry={entries.get(topic._id)}
              project={linkedProject(topic, projects)}
              today={today}
              topic={topic}
            />
          </li>
        ))}
      </ul>
    );
  }

  let chip = <Skeleton className="h-6 w-20 rounded-full" />;
  if (ready && overview !== undefined) {
    const streak = overview?.streak ?? 0;
    chip =
      streak > 0 ? (
        <Chip color={CHIP_COLORS[LOG_COLOR]} icon={FlameIcon}>
          {streak}
          <span className="sr-only"> {plural(streak, "day")} in a row</span>
        </Chip>
      ) : (
        <Chip color={CHIP_COLORS.gray} icon={CircleDashedIcon}>
          Nothing yet
        </Chip>
      );
  }

  return (
    <>
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline gap-1.5 text-3xl font-semibold tracking-tight tabular-nums">
          {ready ? (
            <>
              <RollingNumber duration={600} value={count} />
              <span className="text-muted-foreground text-sm font-medium tracking-normal">
                {count === 1 ? "topic" : "topics"}
              </span>
            </>
          ) : (
            <Skeleton className="h-9 w-14 rounded-lg" />
          )}
        </div>
        <div className="flex h-6 min-w-0 items-center gap-2">
          {chip}
          {personal ? (
            <Link
              className="text-muted-foreground hover:text-foreground min-w-0 truncate text-xs transition-colors duration-150"
              draggable={false}
              href={logPath(personal)}
            >
              Today
            </Link>
          ) : (
            <span className="text-muted-foreground text-xs">Today</span>
          )}
        </div>
      </div>
      <WidgetBleed className="border-t">
        <div style={{ height: SHOWN * ROW_HEIGHT + 8 }}>{list}</div>
      </WidgetBleed>
    </>
  );
}

function LogSettings() {
  const { personal } = useOwnLog();
  return (
    <p className="text-muted-foreground text-xs">
      Shows what you worked on today. Topics, notes and past days are in{" "}
      {personal ? (
        <Link
          className="text-foreground underline-offset-4 hover:underline"
          href={logPath(personal)}
        >
          your log
        </Link>
      ) : (
        "your log"
      )}
      .
    </p>
  );
}

/** Today in the person's log, a topic logged with a tap right from the home. */
export const LOG: WidgetKind<Settings> = {
  Body: LogBody,
  Settings: LogSettings,
  color: LOG_COLOR,
  defaults: LOG_DEFAULTS,
  description: "Log what you worked on today",
  icon: NotebookPenIcon,
  name: "Worked on",
};
