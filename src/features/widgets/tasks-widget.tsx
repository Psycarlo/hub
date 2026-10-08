import "@kitlangton/rolling-number/styles.css";
import { api } from "@convex/_generated/api";
import type { AssignedCard } from "@convex/cards";
import { RollingNumber } from "@kitlangton/rolling-number/react";
import { cn } from "cn";
import { useQuery } from "convex/react";
import { format, parseISO } from "date-fns";
import {
  CalendarCheckIcon,
  CalendarClockIcon,
  CalendarXIcon,
  ListTodoIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { useSyncExternalStore } from "react";
import { Link } from "wouter";

import { Skeleton } from "@/components/ui/skeleton";
import { cardPath } from "@/features/board/board-context";
import { STATUS_STYLES } from "@/features/card/card-fields";
import type { WidgetKind } from "@/features/widgets/widget-kind";
import { SettingTabs, WidgetBleed } from "@/features/widgets/widget-parts";
import type { Priority } from "@/lib/model";
import { cardKey, PRIORITIES, statusKind, statusLabel } from "@/lib/model";
import { CHIP_COLORS } from "@/lib/palette";
import type { SettingsOf, TaskScope, TaskSort } from "@/lib/widgets";
import { MY_TASKS_DEFAULTS, TASK_SCOPES, TASK_SORTS } from "@/lib/widgets";

type Settings = SettingsOf<"myTasks">;

/** Tasks the list shows; the count above it says how many there are in all. */
const SHOWN = 3;
const ROW_HEIGHT = 32;
const MINUTE = 60_000;

interface Scope {
  /** Its name among the scopes to pick from. */
  tab: string;
  /** What the count is of, like "Assigned to you". */
  label: string;
  /** What the list says with nothing in it. */
  empty: string;
  holds: (task: AssignedCard) => boolean;
}

const SCOPES: Record<TaskScope, Scope> = {
  open: {
    empty: "Nothing assigned to you",
    holds: () => true,
    label: "Assigned to you",
    tab: "All open",
  },
  started: {
    empty: "Nothing under way",
    holds: (task) => statusKind(task.status) === "started",
    label: "Under way",
    tab: "Under way",
  },
};

const PRIORITY_ORDER = new Map<Priority | undefined, number>(
  PRIORITIES.map(({ id }, index) => [id, index] as const)
);

/** Most pressing first, then those without a priority. */
function byPriority(a: AssignedCard, b: AssignedCard): number {
  const none = PRIORITIES.length;
  return (
    (PRIORITY_ORDER.get(a.priority) ?? none) -
    (PRIORITY_ORDER.get(b.priority) ?? none)
  );
}

/** Soonest due first, then those without a due date. */
function byDue(a: AssignedCard, b: AssignedCard): number {
  if (a.due === b.due) {
    return 0;
  }
  if (a.due === undefined || b.due === undefined) {
    return a.due === undefined ? 1 : -1;
  }
  return a.due < b.due ? -1 : 1;
}

function byUpdated(a: AssignedCard, b: AssignedCard): number {
  return b.updatedAt - a.updatedAt;
}

interface Sort {
  /** Its name among the sorts to pick from. */
  tab: string;
  compare: (a: AssignedCard, b: AssignedCard) => number;
}

const SORTS: Record<TaskSort, Sort> = {
  due: {
    compare: (a, b) => byDue(a, b) || byPriority(a, b) || byUpdated(a, b),
    tab: "Due date",
  },
  priority: {
    compare: (a, b) => byPriority(a, b) || byDue(a, b) || byUpdated(a, b),
    tab: "Priority",
  },
  updated: { compare: byUpdated, tab: "Updated" },
};

function subscribeMinute(onChange: () => void): () => void {
  const timer = setInterval(onChange, MINUTE);
  return () => clearInterval(timer);
}

/** Today as `YYYY-MM-DD`, like due dates, turning over with the page left open. */
function useToday(): string {
  return useSyncExternalStore(subscribeMinute, () =>
    format(new Date(), "yyyy-MM-dd")
  );
}

const OVERDUE = { color: CHIP_COLORS.red, icon: CalendarXIcon };
const DUE_TODAY = { color: CHIP_COLORS.yellow, icon: CalendarClockIcon };
const CLEAR = { color: CHIP_COLORS.green, icon: CalendarCheckIcon };

/** How the tasks stand against their due dates, the most pressing news first. */
function dueState(tasks: AssignedCard[], today: string) {
  const overdue = tasks.filter((task) => task.due && task.due < today).length;
  if (overdue > 0) {
    return { ...OVERDUE, text: `${overdue} overdue` };
  }
  const dueToday = tasks.filter((task) => task.due === today).length;
  if (dueToday > 0) {
    return { ...DUE_TODAY, text: `${dueToday} due today` };
  }
  return { ...CLEAR, text: tasks.length > 0 ? "On track" : "All clear" };
}

function DueChip({ tasks, today }: { tasks: AssignedCard[]; today: string }) {
  const { color, icon: Icon, text } = dueState(tasks, today);
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1 rounded-full pr-2 pl-1.5 text-xs font-medium tabular-nums transition-colors duration-150 ease-out",
        color
      )}
    >
      <Icon aria-hidden className="size-3.5" />
      {text}
    </span>
  );
}

/** One task, opening its card. */
function TaskRow({ task, today }: { task: AssignedCard; today: string }) {
  const { icon: Icon, className } = STATUS_STYLES[task.status];
  const overdue = task.due !== undefined && task.due < today;
  return (
    <li>
      <Link
        className="hover:bg-foreground/5 focus-visible:bg-foreground/5 focus-visible:ring-ring/50 flex items-center gap-3 rounded-xl px-4 text-sm transition-colors duration-150 ease-out outline-none focus-visible:ring-2 focus-visible:ring-inset"
        draggable={false}
        href={cardPath({ slug: task.slug }, { code: task.code }, task)}
        style={{ height: ROW_HEIGHT }}
      >
        <Icon aria-hidden className={cn("size-4 shrink-0", className)} />
        <span className="sr-only">{statusLabel(task.status)}:</span>
        <span
          className={cn(
            "min-w-0 flex-1 truncate",
            !task.title && "text-muted-foreground"
          )}
        >
          {task.title || "Untitled"}
        </span>
        {task.due && (
          <span
            className={cn(
              "shrink-0 text-xs tabular-nums",
              overdue ? "text-destructive" : "text-muted-foreground"
            )}
          >
            <span className="sr-only">{overdue ? "Overdue" : "Due"}</span>
            <time dateTime={task.due}>
              {format(parseISO(task.due), "MMM d")}
            </time>
          </span>
        )}
        <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
          {cardKey(task, task)}
        </span>
      </Link>
    </li>
  );
}

function RowSkeleton() {
  return (
    <div
      className="flex items-center gap-3 px-4"
      style={{ height: ROW_HEIGHT }}
    >
      <Skeleton className="size-4 rounded-full" />
      <Skeleton className="h-3 flex-1 rounded-full" />
    </div>
  );
}

function MyTasks({ settings }: { settings: Settings }) {
  const assigned = useQuery(api.cards.assigned);
  const today = useToday();
  const scope = SCOPES[settings.scope];
  const tasks = assigned
    ?.filter(scope.holds)
    .toSorted(SORTS[settings.sort].compare);

  let list: ReactNode = (
    <div aria-busy>
      {Array.from({ length: SHOWN }, (_, index) => (
        <RowSkeleton key={index} />
      ))}
    </div>
  );
  if (tasks?.length === 0) {
    list = (
      <p className="text-muted-foreground flex h-full items-center justify-center text-xs">
        {scope.empty}
      </p>
    );
  } else if (tasks) {
    list = (
      <ul>
        {tasks.slice(0, SHOWN).map((task) => (
          <TaskRow key={task._id} task={task} today={today} />
        ))}
      </ul>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-2">
        <div className="text-3xl font-semibold tracking-tight tabular-nums">
          {tasks ? (
            <>
              <RollingNumber duration={600} value={tasks.length} />
              <span className="sr-only"> tasks</span>
            </>
          ) : (
            <Skeleton className="h-9 w-14 rounded-lg" />
          )}
        </div>
        <div className="flex h-6 items-center gap-2">
          {tasks ? (
            <DueChip tasks={tasks} today={today} />
          ) : (
            <Skeleton className="h-6 w-20 rounded-full" />
          )}
          <span className="text-muted-foreground min-w-0 truncate text-xs">
            {scope.label}
          </span>
        </div>
      </div>
      <WidgetBleed className="border-t p-1">
        <div style={{ height: SHOWN * ROW_HEIGHT }}>{list}</div>
      </WidgetBleed>
    </>
  );
}

const SCOPE_OPTIONS = TASK_SCOPES.map((value) => ({
  label: SCOPES[value].tab,
  value,
}));
const SORT_OPTIONS = TASK_SORTS.map((value) => ({
  label: SORTS[value].tab,
  value,
}));

function TaskSettings({
  settings,
  onChange,
}: {
  settings: Settings;
  onChange: (settings: Settings) => void;
}) {
  return (
    <>
      <SettingTabs
        label="Show"
        onChange={(scope) => onChange({ ...settings, scope })}
        options={SCOPE_OPTIONS}
        value={settings.scope}
      />
      <SettingTabs
        label="Sort by"
        onChange={(sort) => onChange({ ...settings, sort })}
        options={SORT_OPTIONS}
        value={settings.sort}
      />
    </>
  );
}

/** The cards assigned to the person, across every board, most pressing first. */
export const MY_TASKS: WidgetKind<Settings> = {
  Body: MyTasks,
  Settings: TaskSettings,
  color: "blue",
  defaults: MY_TASKS_DEFAULTS,
  description: "Cards assigned to you",
  icon: ListTodoIcon,
  name: "My tasks",
};
