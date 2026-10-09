import { cn } from "cn";
import {
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  startOfWeek,
} from "date-fns";
import { PlusIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { LabelDot } from "@/features/card/card-parts";
import { Amount, PaidToggle } from "@/features/finance/finance-parts";
import type { Account, Category, Entry } from "@/lib/finance";
import { categoryOf, isOverdue, monthOf, monthStart } from "@/lib/finance";

/** Entries a day shows on a wide screen before the rest fold into "more". */
const SHOWN = 3;
/** Dots a day shows on a narrow screen. */
const DOTS = 4;
const WEEK = { weekStartsOn: 1 } as const;

/** A day's entries in a dot of their category's color, hollow when they have none. */
function Dot({ category }: { category?: Category }) {
  return category ? (
    <LabelDot className="size-1.5" color={category.color} />
  ) : (
    <span
      aria-hidden
      className="border-muted-foreground/60 size-1.5 shrink-0 rounded-full border"
    />
  );
}

interface DayProps {
  account: Account;
  categories: readonly Category[];
  today: string;
  editable: boolean;
  onOpen?: (entry: Entry) => void;
  onAdd?: (date: string) => void;
}

/** One entry on the calendar: its category, name and signed amount. */
function EntryPill({
  entry,
  account,
  categories,
  today,
  onOpen,
}: DayProps & { entry: Entry }) {
  const category = categoryOf(categories, entry.category);
  const className = cn(
    "focus-visible:ring-ring/50 flex h-6 w-full min-w-0 items-center gap-1.5 rounded-md px-1.5 text-left text-xs transition-colors duration-150 ease-out outline-none focus-visible:ring-2",
    entry.paid
      ? "bg-foreground/[0.045] hover:bg-foreground/[0.08]"
      : "hover:bg-foreground/[0.04] border border-dashed",
    isOverdue(entry, today) ? "border-destructive/50" : "border-foreground/15"
  );
  const content = (
    <>
      <Dot category={category} />
      <span
        className={cn(
          "min-w-0 flex-1 truncate",
          !entry.paid && "text-muted-foreground"
        )}
      >
        {entry.name}
      </span>
      <Amount
        className="shrink-0 font-medium"
        currency={account.currency}
        entry={entry}
        compact
      />
    </>
  );
  return onOpen ? (
    <button className={className} onClick={() => onOpen(entry)} type="button">
      {content}
    </button>
  ) : (
    <span className={className}>{content}</span>
  );
}

/** Everything on one day, with a way to add to it. */
function DayList({
  date,
  entries,
  account,
  categories,
  today,
  editable,
  onOpen,
  onAdd,
}: DayProps & { date: Date; entries: Entry[] }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="px-1 text-sm font-medium">
        {format(date, "EEEE, MMMM d")}
      </h3>
      {entries.length > 0 ? (
        <ul className="flex flex-col gap-0.5">
          {entries.map((entry) => (
            <li className="flex items-center gap-2" key={entry._id}>
              <span className="flex w-6 shrink-0 justify-center">
                <PaidToggle editable={editable} entry={entry} />
              </span>
              <EntryPill
                account={account}
                categories={categories}
                editable={editable}
                entry={entry}
                onOpen={onOpen}
                today={today}
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground px-1 text-sm">Nothing this day.</p>
      )}
      {onAdd && (
        <Button
          className="self-start"
          onClick={() => onAdd(format(date, "yyyy-MM-dd"))}
          size="sm"
          variant="ghost"
        >
          <PlusIcon />
          Add on this day
        </Button>
      )}
    </div>
  );
}

function Day({
  date,
  entries,
  inMonth,
  last,
  ...props
}: DayProps & {
  date: Date;
  entries: Entry[];
  inMonth: boolean;
  /** In the calendar's last row, which has no line beneath. */
  last: boolean;
}) {
  const { today, categories, onAdd } = props;
  const key = format(date, "yyyy-MM-dd");
  const isToday = key === today;
  const shown = entries.slice(0, SHOWN);
  const more = entries.length - shown.length;
  const list = <DayList date={date} entries={entries} {...props} />;
  return (
    <div
      className={cn(
        "group/day border-border/70 relative flex min-h-16 min-w-0 flex-col gap-1 border-r border-b p-1 sm:min-h-28 sm:p-1.5 [&:nth-child(7n)]:border-r-0",
        last && "border-b-0",
        !inMonth && "bg-foreground/[0.02]"
      )}
    >
      <div className="flex items-center justify-between">
        <span
          className={cn(
            "flex size-6 items-center justify-center rounded-full text-xs tabular-nums",
            isToday && "bg-primary text-primary-foreground font-semibold",
            !(isToday || inMonth) && "text-muted-foreground/50"
          )}
        >
          {date.getDate()}
        </span>
        {inMonth && onAdd && (
          <button
            aria-label={`Add on ${format(date, "MMMM d")}`}
            className="text-muted-foreground hover:bg-foreground/5 hover:text-foreground focus-visible:ring-ring/50 flex size-6 items-center justify-center rounded-full opacity-0 transition-[opacity,background-color,color] duration-150 ease-out outline-none group-hover/day:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 max-sm:hidden"
            onClick={() => onAdd(key)}
            type="button"
          >
            <PlusIcon className="size-3.5" />
          </button>
        )}
      </div>
      {inMonth && (
        <>
          <ul className="flex min-w-0 flex-col gap-0.5 max-sm:hidden">
            {shown.map((entry) => (
              <li className="flex min-w-0" key={entry._id}>
                <EntryPill entry={entry} {...props} />
              </li>
            ))}
          </ul>
          {more > 0 && (
            <Popover>
              <PopoverTrigger className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 self-start rounded-md px-1.5 text-xs font-medium transition-colors duration-150 outline-none focus-visible:ring-2 max-sm:hidden">
                {more} more
              </PopoverTrigger>
              <PopoverContent align="start" className="w-72 p-2">
                {list}
              </PopoverContent>
            </Popover>
          )}
          {entries.length > 0 && (
            <div aria-hidden className="flex flex-wrap gap-0.5 px-1 sm:hidden">
              {entries.slice(0, DOTS).map((entry) => (
                <Dot
                  category={categoryOf(categories, entry.category)}
                  key={entry._id}
                />
              ))}
            </div>
          )}
          {/* A narrow day is too small to tap entries in: the whole day opens them. */}
          <Popover>
            <PopoverTrigger
              aria-label={`${format(date, "MMMM d")}, ${entries.length} entries`}
              className="focus-visible:ring-ring/50 absolute inset-0 outline-none focus-visible:ring-2 focus-visible:ring-inset sm:hidden"
            />
            <PopoverContent align="center" className="w-72 p-2">
              {list}
            </PopoverContent>
          </Popover>
        </>
      )}
    </div>
  );
}

interface EntriesCalendarProps extends DayProps {
  month: string;
  /** In the order they fall in the month. */
  entries: Entry[];
}

/** The month as weeks of days, Monday first, each with what falls on it. */
export function EntriesCalendar({
  month,
  entries,
  ...props
}: EntriesCalendarProps) {
  const first = monthStart(month);
  const days = eachDayOfInterval({
    end: endOfWeek(endOfMonth(first), WEEK),
    start: startOfWeek(first, WEEK),
  });
  const byDay = Map.groupBy(entries, (entry) => entry.date);
  const lastRow = days.length - 7;
  return (
    <div className="bg-card shadow-surface overflow-hidden rounded-2xl">
      <div aria-hidden className="border-border/70 grid grid-cols-7 border-b">
        {days.slice(0, 7).map((day) => (
          <span
            className="text-muted-foreground py-2 text-center text-xs font-medium"
            key={day.getDay()}
          >
            <span className="max-sm:hidden">{format(day, "EEE")}</span>
            <span className="sm:hidden">{format(day, "EEEEE")}</span>
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day, index) => {
          const key = format(day, "yyyy-MM-dd");
          return (
            <Day
              date={day}
              entries={byDay.get(key) ?? []}
              inMonth={monthOf(key) === month}
              key={key}
              last={index >= lastRow}
              {...props}
            />
          );
        })}
      </div>
    </div>
  );
}
