import { cn } from "cn";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  PlusIcon,
  XIcon,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { KeyboardEvent } from "react";
import { useRef, useState } from "react";
import { Link } from "wouter";

import { IconButton } from "@/components/icon-button";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TopicBadge } from "@/features/log/topic-icon";
import type { LogDays } from "@/hooks/use-log";
import type { LogDay, LogTopic } from "@/lib/log";
import {
  MAX_LOG_NOTE,
  MAX_TOPICS,
  addDays,
  dayLabel,
  fullDay,
  linkedProject,
} from "@/lib/log";
import { checkTopic, logTopic, unlogTopic } from "@/lib/log-actions";
import type { Project } from "@/lib/project";
import { projectPath } from "@/lib/project";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

/** A line on what was done, plain text until hovered, saved as it's left. */
function NoteInput({
  topic,
  date,
  note,
}: {
  topic: LogTopic;
  date: string;
  note: string;
}) {
  const [draft, setDraft] = useState<string>();
  // Escape leaves the note as it was, though leaving the field saves it.
  const cancelled = useRef(false);
  const commit = () => {
    if (!cancelled.current && draft !== undefined && draft.trim() !== note) {
      logTopic(topic, date, draft.trim());
    }
    cancelled.current = false;
    setDraft(undefined);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.currentTarget.blur();
    } else if (event.key === "Escape" && draft !== undefined) {
      event.stopPropagation();
      cancelled.current = true;
      event.currentTarget.blur();
    }
  };
  return (
    <input
      aria-label={`Note on ${topic.title}`}
      autoComplete="off"
      className="placeholder:text-muted-foreground/70 hover:bg-foreground/5 focus-visible:bg-foreground/5 h-8 w-full min-w-0 rounded-lg px-2 text-sm transition-[background-color] duration-150 ease-out outline-none"
      maxLength={MAX_LOG_NOTE}
      onBlur={commit}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={onKeyDown}
      placeholder="Add a note"
      value={draft ?? note}
    />
  );
}

/** A topic logged on the day: its name, its note, and a way to take it back. */
function Entry({
  topic,
  project,
  entry,
  editable,
}: {
  topic: LogTopic;
  project?: Project;
  entry: LogDay;
  editable: boolean;
}) {
  const title = <span className="truncate">{topic.title}</span>;
  return (
    <motion.li
      animate={{ opacity: 1, y: 0 }}
      className="group flex h-10 items-center gap-2"
      exit={{ opacity: 0, transition: { duration: 0.1 } }}
      initial={{ opacity: 0, y: -4 }}
      layout="position"
      transition={{ duration: 0.2, ease: EASE_OUT }}
    >
      <TopicBadge project={project} size="sm" topic={topic} />
      <span className="flex max-w-[45%] shrink-0 text-sm font-medium">
        {project ? (
          <Link
            className="hover:text-primary flex min-w-0 underline-offset-4 transition-colors duration-150 ease-out hover:underline"
            href={projectPath(project)}
          >
            {title}
          </Link>
        ) : (
          title
        )}
      </span>
      <span className="min-w-0 flex-1">
        {editable ? (
          <NoteInput date={entry.date} note={entry.note} topic={topic} />
        ) : (
          entry.note && (
            <span className="text-muted-foreground block truncate px-2 text-sm">
              {entry.note}
            </span>
          )
        )}
      </span>
      {editable && (
        <IconButton
          className="text-muted-foreground opacity-0 transition-opacity duration-150 ease-out group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
          label={`Remove ${topic.title}`}
          onClick={() => unlogTopic(topic, entry.date, entry.note)}
        >
          <XIcon />
        </IconButton>
      )}
    </motion.li>
  );
}

/** A topic not logged on the day yet, logged with a tap. */
function TopicChip({
  topic,
  project,
  onLog,
}: {
  topic: LogTopic;
  project?: Project;
  onLog: () => void;
}) {
  return (
    <button
      className="bg-card hover:bg-foreground/5 focus-visible:ring-ring/50 inline-flex h-8 max-w-56 items-center gap-1.5 rounded-full border pr-3 pl-1 text-sm transition-[background-color,scale] duration-150 ease-out outline-none focus-visible:ring-3 active:scale-[0.96]"
      onClick={onLog}
      type="button"
    >
      <TopicBadge
        className="size-6 rounded-full"
        project={project}
        size="sm"
        topic={topic}
      />
      <span className="truncate">{topic.title}</span>
    </button>
  );
}

/** Topics to offer, the ones worked on most lately first, then the rest as they were made. */
function byRecentUse(topics: readonly LogTopic[], days: LogDays): LogTopic[] {
  const last = new Map<string, number>();
  for (const [index, date] of days.dates.entries()) {
    for (const entry of days.on(date)) {
      if (!last.has(entry.topicId)) {
        last.set(entry.topicId, index);
      }
    }
  }
  return topics.toSorted(
    (a, b) =>
      (last.get(a._id) ?? Number.POSITIVE_INFINITY) -
      (last.get(b._id) ?? Number.POSITIVE_INFINITY)
  );
}

interface DayComposerProps {
  /** Every topic of the log, archived ones included. */
  topics: readonly LogTopic[];
  /** The projects the person can see, for topics standing for one. */
  projects: readonly Project[];
  days: LogDays;
  date: string;
  today: string;
  editable: boolean;
  /** Steps through the days; without it, the composer stays on `date`. */
  onDateChange?: (date: string) => void;
  onNewTopic?: () => void;
  className?: string;
}

/**
 * One day of the log: what was worked on, each with a line on it, and the
 * other topics to log with a tap.
 */
export function DayComposer({
  topics,
  projects,
  days,
  date,
  today,
  editable,
  onDateChange,
  onNewTopic,
  className,
}: DayComposerProps) {
  const entries = days.on(date);
  const logged = new Set(entries.map((entry) => entry.topicId));
  const byId = new Map(topics.map((topic) => [topic._id as string, topic]));
  const offered = byRecentUse(
    topics.filter((topic) => !(topic.archived || logged.has(topic._id))),
    days
  );
  const label = dayLabel(date, today);
  const relative = label === "Today" || label === "Yesterday";

  let body = (
    <div aria-busy className="flex flex-col gap-3">
      <Skeleton className="h-8 w-2/3 rounded-lg" />
      <div className="flex gap-1.5">
        <Skeleton className="h-8 w-28 rounded-full" />
        <Skeleton className="h-8 w-24 rounded-full" />
      </div>
    </div>
  );
  if (days.loaded) {
    body = (
      <>
        {entries.length > 0 ? (
          <ul aria-label={`Worked on ${label.toLowerCase()}`} className="-mx-1">
            <AnimatePresence initial={false}>
              {entries.map((entry) => {
                const topic = byId.get(entry.topicId);
                return (
                  topic && (
                    <Entry
                      editable={editable}
                      entry={entry}
                      key={entry.topicId}
                      project={linkedProject(topic, projects)}
                      topic={topic}
                    />
                  )
                );
              })}
            </AnimatePresence>
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">
            {editable
              ? `What did you work on${date === today ? " today" : ""}?`
              : "Nothing logged."}
          </p>
        )}
        {editable && (offered.length > 0 || onNewTopic) && (
          <div
            className={cn(
              "flex flex-wrap gap-1.5",
              entries.length > 0 && "border-t pt-4"
            )}
          >
            {offered.map((topic) => (
              <TopicChip
                key={topic._id}
                onLog={() => checkTopic(topic, date)}
                project={linkedProject(topic, projects)}
                topic={topic}
              />
            ))}
            {onNewTopic && topics.length < MAX_TOPICS && (
              <button
                className="text-muted-foreground hover:bg-foreground/5 hover:text-foreground focus-visible:ring-ring/50 inline-flex h-8 items-center gap-1 rounded-full border border-dashed pr-3 pl-2 text-sm transition-[background-color,color,scale] duration-150 ease-out outline-none focus-visible:ring-3 active:scale-[0.96]"
                onClick={onNewTopic}
                type="button"
              >
                <PlusIcon aria-hidden className="size-4" />
                {topics.length === 0 ? "Add what you work on" : "New topic"}
              </button>
            )}
          </div>
        )}
      </>
    );
  }

  return (
    <section
      aria-label={label}
      className={cn(
        "bg-card shadow-surface flex flex-col gap-4 rounded-2xl p-4 sm:p-5",
        className
      )}
    >
      <header className="flex items-center gap-2">
        <div className="flex min-w-0 flex-1 flex-col">
          <h2 className="truncate font-medium">{label}</h2>
          {relative && (
            <p className="text-muted-foreground truncate text-xs">
              {fullDay(date)}
            </p>
          )}
        </div>
        {onDateChange && (
          <div className="flex items-center gap-0.5">
            {date !== today && (
              <Button
                onClick={() => onDateChange(today)}
                size="sm"
                variant="ghost"
              >
                Today
              </Button>
            )}
            <IconButton
              label="Previous day"
              onClick={() => onDateChange(addDays(date, -1))}
            >
              <ChevronLeftIcon />
            </IconButton>
            <IconButton
              disabled={date >= today}
              label="Next day"
              onClick={() => onDateChange(addDays(date, 1))}
            >
              <ChevronRightIcon />
            </IconButton>
          </div>
        )}
      </header>
      {body}
    </section>
  );
}
