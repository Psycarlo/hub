import { cn } from "cn";
import {
  ExternalLinkIcon,
  NotebookPenIcon,
  PlusIcon,
  Settings2Icon,
} from "lucide-react";
import type { CSSProperties, KeyboardEvent } from "react";
import { useRef, useState } from "react";
import { Link, useSearchParams } from "wouter";

import { IconButton } from "@/components/icon-button";
import { ProjectAvatar } from "@/components/project-avatar";
import { TopBar } from "@/components/top-bar";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { StreakChip } from "@/features/habits/habit-card";
import {
  DAY_SQUARE,
  DayGrid,
  TODAY_RING,
  gridStart,
} from "@/features/habits/heatmap";
import { DayComposer } from "@/features/log/day-composer";
import { TopicDialog } from "@/features/log/topic-dialog";
import { TopicBadge } from "@/features/log/topic-icon";
import type { LogDays } from "@/hooks/use-log";
import { useLogDays, useLogOverview } from "@/hooks/use-log";
import { useToday } from "@/hooks/use-today";
import { useMe } from "@/hooks/use-users";
import type { LogTopic } from "@/lib/log";
import { LOG_COLOR, addDays, dayLabel, isDay, linkedProject } from "@/lib/log";
import type { Color } from "@/lib/palette";
import { SWATCH_COLORS } from "@/lib/palette";
import type { Project } from "@/lib/project";
import { canEdit, canManage, projectPath } from "@/lib/project";
import { plural } from "@/lib/utils";

/** Weeks the year's grid reaches back, to the same week a year ago. */
const YEAR_WEEKS = 53;
/** Days of the history shown at a time. */
const HISTORY_PAGE = 14;

/** How deep a day shows: more topics worked on, the deeper. */
function depth(count: number): number {
  return Math.min(1, 0.3 + (count - 1) * 0.25);
}

/** One day's square, in the log's color or the topic's when it's one topic's days. */
function YearDay({
  date,
  count,
  color,
  today,
  selected,
  style,
  onPick,
}: {
  date: string;
  count: number;
  color: Color;
  today: string;
  selected: boolean;
  style: CSSProperties;
  onPick: (date: string) => void;
}) {
  if (date > today) {
    return <span aria-hidden className={DAY_SQUARE} style={style} />;
  }
  return (
    <button
      aria-label={`${dayLabel(date, today)}: ${count > 0 ? plural(count, "topic") : "nothing logged"}`}
      aria-pressed={selected}
      className={cn(
        DAY_SQUARE,
        "focus-visible:ring-ring cursor-pointer outline-none focus-visible:ring-2",
        count > 0 ? SWATCH_COLORS[color] : "bg-foreground/[0.06]",
        date === today && TODAY_RING,
        selected && "ring-foreground ring-2"
      )}
      data-date={date}
      onClick={() => onPick(date)}
      style={count > 0 ? { ...style, opacity: depth(count) } : style}
      tabIndex={selected ? 0 : -1}
      type="button"
    />
  );
}

/** Arrow keys walk the year: a day up or down, a week either side. */
const STEPS: Record<string, number> = {
  ArrowDown: 1,
  ArrowLeft: -7,
  ArrowRight: 7,
  ArrowUp: -1,
};

function YearGrid({
  days,
  topic,
  today,
  selected,
  onPick,
}: {
  days: LogDays;
  topic?: LogTopic;
  today: string;
  selected: string;
  onPick: (date: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const count = (date: string) =>
    days.on(date).filter((entry) => !topic || entry.topicId === topic._id)
      .length;
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = STEPS[event.key];
    if (step === undefined) {
      return;
    }
    const next = addDays(selected, step);
    const button = ref.current?.querySelector<HTMLButtonElement>(
      `[data-date="${next}"]`
    );
    if (button) {
      event.preventDefault();
      onPick(next);
      button.focus();
    }
  };
  return (
    // Keys are handled once for every day inside, each a button of its own.
    // oxlint-disable-next-line jsx-a11y/no-static-element-interactions
    <div onKeyDown={onKeyDown} ref={ref}>
      <DayGrid
        interactive
        labeled
        maxWeeks={YEAR_WEEKS}
        minCell={9}
        renderDay={(date, style) => (
          <YearDay
            color={topic?.color ?? LOG_COLOR}
            count={count(date)}
            date={date}
            onPick={onPick}
            selected={date === selected}
            style={style}
            today={today}
          />
        )}
        today={today}
      />
    </div>
  );
}

/** Every topic, or one: a filter for the year and the history. */
function TopicFilter({
  topics,
  projects,
  selected,
  onSelect,
}: {
  topics: readonly LogTopic[];
  projects: readonly Project[];
  selected?: LogTopic;
  /** A topic's id, or null for every topic. */
  onSelect: (topicId: string | null) => void;
}) {
  const pill =
    "focus-visible:ring-ring/50 inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full text-sm transition-[background-color,color,scale] duration-150 ease-out outline-none focus-visible:ring-3 active:scale-[0.96] aria-pressed:bg-foreground aria-pressed:text-background";
  return (
    <div
      aria-label="Topics"
      className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6 [&::-webkit-scrollbar]:hidden"
      role="toolbar"
    >
      <button
        aria-pressed={!selected}
        className={cn(pill, "bg-foreground/5 hover:bg-foreground/10 px-3")}
        onClick={() => onSelect(null)}
        type="button"
      >
        All
      </button>
      {topics.map((topic) => (
        <button
          aria-pressed={selected?._id === topic._id}
          className={cn(
            pill,
            "bg-foreground/5 hover:bg-foreground/10 max-w-56 pr-3 pl-1",
            topic.archived && "text-muted-foreground"
          )}
          key={topic._id}
          onClick={() =>
            onSelect(selected?._id === topic._id ? null : topic._id)
          }
          type="button"
        >
          <TopicBadge
            className="size-6 rounded-full"
            project={linkedProject(topic, projects)}
            size="sm"
            topic={topic}
          />
          <span className="truncate">{topic.title}</span>
        </button>
      ))}
    </div>
  );
}

/** Days logged, newest first, each opening in the composer. */
function History({
  days,
  dates,
  topics,
  projects,
  today,
  selected,
  more,
  onPick,
  onMore,
}: {
  days: LogDays;
  dates: readonly string[];
  topics: readonly LogTopic[];
  projects: readonly Project[];
  today: string;
  selected: string;
  more: boolean;
  onPick: (date: string) => void;
  onMore: () => void;
}) {
  const byId = new Map(topics.map((topic) => [topic._id as string, topic]));
  if (dates.length === 0) {
    return null;
  }
  return (
    <section aria-labelledby="log-history" className="flex flex-col gap-3">
      <h2
        className="text-muted-foreground px-1 text-xs font-medium"
        id="log-history"
      >
        History
      </h2>
      <ol className="bg-card shadow-surface divide-y overflow-hidden rounded-2xl">
        {dates.map((date) => (
          <li className="flex gap-4 px-4 py-3 sm:px-5" key={date}>
            <button
              className={cn(
                "text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 w-24 shrink-0 self-start rounded-md pt-1 text-left text-xs font-medium tabular-nums transition-colors duration-150 ease-out outline-none focus-visible:ring-3 sm:w-28",
                date === selected && "text-foreground"
              )}
              onClick={() => onPick(date)}
              type="button"
            >
              {dayLabel(date, today)}
            </button>
            <ul className="flex min-w-0 flex-1 flex-col gap-1.5">
              {days.on(date).map((entry) => {
                const topic = byId.get(entry.topicId);
                return (
                  topic && (
                    <li
                      className="flex min-w-0 items-center gap-2 text-sm"
                      key={entry.topicId}
                    >
                      <TopicBadge
                        project={linkedProject(topic, projects)}
                        size="sm"
                        topic={topic}
                      />
                      <span className="shrink-0 font-medium">
                        {topic.title}
                      </span>
                      {entry.note && (
                        <span className="text-muted-foreground min-w-0 truncate">
                          {entry.note}
                        </span>
                      )}
                    </li>
                  )
                );
              })}
            </ul>
          </li>
        ))}
      </ol>
      {more && (
        <Button className="self-center" onClick={onMore} variant="ghost">
          Show more
        </Button>
      )}
    </section>
  );
}

/** The year at a glance, of every topic or one, with that topic's settings. */
function YearCard({
  topic,
  project,
  days,
  inYear,
  streak,
  selected,
  today,
  onPick,
  onSettings,
}: {
  topic?: LogTopic;
  /** The project the topic stands for, while it can be seen. */
  project?: Project;
  days: LogDays;
  /** Days logged in the last year. */
  inYear: number;
  /** Days in a row; undefined while it loads. */
  streak?: number;
  selected: string;
  today: string;
  onPick: (date: string) => void;
  /** Opens the topic's settings, for whoever may change it. */
  onSettings?: () => void;
}) {
  let summary = days.loaded
    ? `${plural(inYear, "day")} in the last year`
    : "Loading…";
  if (topic?.archived) {
    summary += " · Archived";
  }
  return (
    <section
      aria-label="Year"
      className="bg-card shadow-surface flex flex-col gap-4 rounded-2xl p-4 sm:p-5"
    >
      <header className="flex items-center gap-3">
        {topic && <TopicBadge project={project} size="md" topic={topic} />}
        <div className="flex min-w-0 flex-1 flex-col">
          <h2 className="truncate font-medium">
            {topic ? topic.title : "Your year"}
          </h2>
          <p className="text-muted-foreground truncate text-xs">{summary}</p>
        </div>
        {project && (
          <IconButton
            label={`Open ${project.title}`}
            nativeButton={false}
            render={<Link href={projectPath(project)} />}
          >
            <ExternalLinkIcon />
          </IconButton>
        )}
        {onSettings && (
          <IconButton label="Topic settings" onClick={onSettings}>
            <Settings2Icon />
          </IconButton>
        )}
        {!topic && <StreakChip color={LOG_COLOR} days={streak} />}
      </header>
      <YearGrid
        days={days}
        onPick={onPick}
        selected={selected}
        today={today}
        topic={topic}
      />
    </section>
  );
}

/** A log with no topics yet, and the way to add the first. */
function NoTopics({
  editable,
  onNew,
}: {
  editable: boolean;
  onNew: () => void;
}) {
  return (
    <Empty>
      <NotebookPenIcon
        aria-hidden
        className="text-muted-foreground size-8"
        strokeWidth={1.5}
      />
      <EmptyTitle>Nothing logged yet</EmptyTitle>
      <EmptyDescription>
        {editable
          ? "Add what you work on, a project of the hub or anything else, then log it with a tap each day."
          : "What’s worked on shows up here, day by day."}
      </EmptyDescription>
      {editable && (
        <Button onClick={onNew}>
          <PlusIcon />
          Add what you work on
        </Button>
      )}
    </Empty>
  );
}

/** A day from the link, when it's one that's been. */
function parseDayParam(value: string | null, today: string): string {
  return value && isDay(value) && value <= today ? value : today;
}

/** Whether the person may change the topic: whoever made it, or manages the project. */
function canChange(project: Project, topic: LogTopic, userId: string): boolean {
  return canEdit(project) && (canManage(project) || topic.createdBy === userId);
}

/** The day and topic the link opens, and a way to open others. */
function useLogParams(topics: readonly LogTopic[], today: string) {
  const [params, setParams] = useSearchParams();
  const day = parseDayParam(params.get("day"), today);
  const topic = topics.find((item) => item._id === params.get("topic"));
  /** Opens a day, or a topic's days alone; null goes back to every topic. */
  const go = (changes: { day?: string; topic?: string | null }) => {
    const nextDay = changes.day ?? day;
    const nextTopic = changes.topic === undefined ? topic?._id : changes.topic;
    const next: Record<string, string> = {};
    if (nextDay !== today) {
      next.day = nextDay;
    }
    if (nextTopic) {
      next.topic = nextTopic;
    }
    setParams(next, { replace: true });
  };
  return { day, go, topic };
}

/** A personal project's log: the year at a glance, a day to fill in, and the days before. */
export function LogPage({
  project,
  projects,
  topics,
  loaded,
}: {
  project: Project;
  /** The projects the person can see, for topics standing for one. */
  projects: readonly Project[];
  /** The log's topics. */
  topics: LogTopic[];
  loaded: boolean;
}) {
  const me = useMe();
  const today = useToday();
  const { day, topic, go } = useLogParams(topics, today);
  const [dialog, setDialog] = useState<"new" | "settings">();
  const [shown, setShown] = useState(HISTORY_PAGE);
  // A year back at first, further as the history is read.
  const [years, setYears] = useState(1);
  const yearStart = gridStart(today, YEAR_WEEKS);
  const reach = addDays(yearStart, -364 * (years - 1));
  const days = useLogDays(project, day < reach ? day : reach, topics);
  const overview = useLogOverview(project, today);
  const editable = canEdit(project);
  const manageable = topic !== undefined && canChange(project, topic, me._id);
  const linked = topic && linkedProject(topic, projects);

  const dated = topic
    ? days.dates.filter((date) =>
        days.on(date).some((entry) => entry.topicId === topic._id)
      )
    : days.dates;
  const inYear = dated.filter((date) => date >= yearStart).length;
  // Older days are loaded on asking, while there are some.
  const older = overview?.first ? overview.first < reach : false;
  const more = shown < dated.length || older;
  const showMore = () => {
    if (shown + HISTORY_PAGE > dated.length && older) {
      setYears((current) => current + 1);
    }
    setShown((current) => current + HISTORY_PAGE);
  };

  let body = (
    <div aria-busy className="flex flex-col gap-6">
      <Skeleton className="h-48 rounded-2xl" />
      <Skeleton className="h-40 rounded-2xl" />
    </div>
  );
  if (loaded && topics.length === 0) {
    body = <NoTopics editable={editable} onNew={() => setDialog("new")} />;
  } else if (loaded) {
    body = (
      <>
        <YearCard
          days={days}
          inYear={inYear}
          onPick={(date) => go({ day: date })}
          onSettings={manageable ? () => setDialog("settings") : undefined}
          project={linked}
          selected={day}
          streak={overview === null ? 0 : overview?.streak}
          today={today}
          topic={topic}
        />
        <TopicFilter
          onSelect={(next) => go({ topic: next })}
          projects={projects}
          selected={topic}
          topics={topics}
        />
        <DayComposer
          date={day}
          days={days}
          editable={editable}
          onDateChange={(date) => go({ day: date })}
          onNewTopic={editable ? () => setDialog("new") : undefined}
          projects={projects}
          today={today}
          topics={topics}
        />
        <History
          dates={dated.slice(0, shown)}
          days={days}
          more={more}
          onMore={showMore}
          onPick={(date) => {
            go({ day: date });
            window.scrollTo({ behavior: "smooth", top: 0 });
          }}
          projects={projects}
          selected={day}
          today={today}
          topics={topic ? [topic] : topics}
        />
      </>
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
              <NotebookPenIcon className="text-muted-foreground size-4 shrink-0" />
            ),
            label: "Log",
          },
        ]}
      >
        {editable && topics.length > 0 && (
          <Button onClick={() => setDialog("new")} size="sm" variant="outline">
            <PlusIcon />
            New topic
          </Button>
        )}
      </TopBar>
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 pt-4 pb-10 sm:px-6">
        {body}
      </main>
      <TopicDialog
        onOpenChange={(open) => setDialog(open ? "new" : undefined)}
        open={dialog === "new"}
        project={project}
        topics={topics}
      />
      {topic && (
        <TopicDialog
          onOpenChange={(open) => setDialog(open ? "settings" : undefined)}
          open={dialog === "settings"}
          project={project}
          topic={topic}
          topics={topics}
        />
      )}
    </>
  );
}
