import { cn } from "cn";
import { parseISO } from "date-fns";
import { ScaleIcon, XIcon } from "lucide-react";
import type { FormEvent } from "react";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Change, PANEL, Panel } from "@/features/gym/gym-parts";
import { TrendChart } from "@/features/gym/trend-chart";
import { useBodyWeights } from "@/hooks/use-gym";
import type { BodyWeight, Gym } from "@/lib/gym";
import {
  BODY_COLOR,
  MAX_BODY_WEIGHT,
  MIN_BODY_WEIGHT,
  addDays,
  formatChange,
  formatLoad,
  formatWeight,
  fromLoad,
  parseAmount,
  toLoad,
  weightChange,
  weightUnit,
} from "@/lib/gym";
import { logWeight, removeWeight } from "@/lib/gym-actions";
import { dayLabel } from "@/lib/log";
import { HEX_COLORS } from "@/lib/palette";
import type { Project } from "@/lib/project";
import { canEdit } from "@/lib/project";

const RANGES = [
  { days: 30, label: "1M", value: "1m" },
  { days: 90, label: "3M", value: "3m" },
  { days: 365, label: "1Y", value: "1y" },
  { days: undefined, label: "All", value: "all" },
] as const;

type Range = (typeof RANGES)[number]["value"];

/** Days the moving average takes in. */
const AVERAGE_DAYS = 7;
/** Weighings listed before asking for more. */
const LIST_PAGE = 10;
/** Where "All" reads from: before anyone logged anything here. */
const ALL_TIME = "2000-01-01";

/** Each weighing with the average of the week up to it, which evens out a day's swings. */
function withAverage(weights: readonly BodyWeight[], gym: Gym) {
  return weights.map((item, index) => {
    const from = addDays(item.date, -(AVERAGE_DAYS - 1));
    const window: number[] = [];
    for (let at = index; at >= 0; at -= 1) {
      const other = weights[at];
      if (!other || other.date < from) {
        break;
      }
      window.push(other.weight);
    }
    const average =
      window.reduce((sum, weight) => sum + weight, 0) / window.length;
    return {
      t: parseISO(item.date).getTime(),
      trend: toLoad(average, gym.units),
      value: toLoad(item.weight, gym.units),
    };
  });
}

/** The change in the gym's unit from the last weighing on or before `days` ago. */
function changeOver(
  weights: readonly BodyWeight[],
  days: number,
  gym: Gym
): number | undefined {
  const latest = weights.at(-1);
  if (!latest) {
    return undefined;
  }
  const since = addDays(latest.date, -days);
  const before = weights.findLast((item) => item.date <= since);
  return before && weightChange(latest.weight, before.weight, gym.units);
}

/** Today's weight, or another day's, in the gym's unit. */
function LogForm({
  project,
  gym,
  latest,
  today,
}: {
  project: Project;
  gym: Gym;
  latest?: BodyWeight;
  today: string;
}) {
  const id = useId();
  const [weight, setWeight] = useState("");
  const [date, setDate] = useState(today);
  const [saving, setSaving] = useState(false);
  const value = parseAmount(weight);
  const kg = value === undefined ? undefined : fromLoad(value, gym.units);
  const valid =
    kg !== undefined &&
    kg >= MIN_BODY_WEIGHT &&
    kg <= MAX_BODY_WEIGHT &&
    date <= today;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!(valid && kg !== undefined)) {
      return;
    }
    setSaving(true);
    const done = await logWeight(project._id, date, kg);
    setSaving(false);
    if (done !== undefined) {
      setWeight("");
      setDate(today);
    }
  };
  return (
    <form className="flex flex-wrap items-end gap-2" onSubmit={submit}>
      <div className="flex min-w-32 flex-1 flex-col gap-1.5">
        <label
          className="text-muted-foreground text-xs"
          htmlFor={`${id}-weight`}
        >
          Weight
        </label>
        <div className="relative">
          <Input
            autoComplete="off"
            className="pr-10 text-base"
            id={`${id}-weight`}
            inputMode="decimal"
            onChange={(event) => setWeight(event.target.value)}
            placeholder={latest ? formatLoad(latest.weight, gym.units) : "78.5"}
            value={weight}
          />
          <span className="text-muted-foreground pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm">
            {weightUnit(gym.units)}
          </span>
        </div>
      </div>
      <div className="flex w-40 flex-col gap-1.5">
        <label className="text-muted-foreground text-xs" htmlFor={`${id}-date`}>
          Day
        </label>
        <Input
          id={`${id}-date`}
          max={today}
          onChange={(event) => setDate(event.target.value || today)}
          type="date"
          value={date}
        />
      </div>
      <Button disabled={!valid || saving} type="submit">
        {saving && <Spinner />}
        Log
      </Button>
    </form>
  );
}

/** Body weight: where it is, how it's moving, and every weighing. */
export function BodyTab({
  project,
  gym,
  today,
}: {
  project: Project;
  gym: Gym;
  today: string;
}) {
  const [range, setRange] = useState<Range>("3m");
  const [listed, setListed] = useState(LIST_PAGE);
  const days = RANGES.find((item) => item.value === range)?.days;
  const from = days === undefined ? ALL_TIME : addDays(today, -days);
  // The changes and the average reach a little further back than the range.
  const { weights, loaded } = useBodyWeights(
    project,
    days === undefined ? ALL_TIME : addDays(from, -AVERAGE_DAYS)
  );
  const editable = canEdit(project);
  const latest = weights.at(-1);
  const inRange = weights.filter((item) => item.date >= from);
  const week = changeOver(weights, 7, gym);
  const month = changeOver(weights, 30, gym);
  const goal = gym.goalWeight;
  const toGo =
    goal !== undefined && latest
      ? weightChange(latest.weight, goal, gym.units)
      : undefined;
  // Up or down is only good or bad on the way to a goal.
  const moved = (by: number) =>
    toGo === undefined ? (
      <span className="tabular-nums">{formatChange(by, gym.units)}</span>
    ) : (
      <Change by={by} lowerIsBetter={toGo > 0}>
        {formatChange(by, gym.units)}
      </Change>
    );
  const points = withAverage(weights, gym).filter(
    (point) => point.t >= parseISO(from).getTime()
  );
  const newest = inRange.toReversed();

  if (!loaded) {
    return (
      <div aria-busy className="flex flex-col gap-6">
        <Skeleton className="h-40 rounded-2xl" />
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <section
        aria-label="Body weight"
        className={cn(PANEL, "flex flex-col gap-5 p-4 sm:p-5")}
      >
        <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
          <div className="flex flex-col gap-1">
            <span className="text-muted-foreground text-xs">
              {latest ? dayLabel(latest.date, today) : "Body weight"}
            </span>
            <span className="text-4xl font-semibold tracking-tight tabular-nums">
              {latest ? formatWeight(latest.weight, gym.units) : "—"}
            </span>
          </div>
          {week !== undefined && (
            <div className="flex flex-col gap-1">
              <span className="text-muted-foreground text-xs">7 days</span>
              <span className="text-lg font-medium">{moved(week)}</span>
            </div>
          )}
          {month !== undefined && (
            <div className="flex flex-col gap-1">
              <span className="text-muted-foreground text-xs">30 days</span>
              <span className="text-lg font-medium">{moved(month)}</span>
            </div>
          )}
          {goal !== undefined && (
            <div className="flex flex-col gap-1">
              <span className="text-muted-foreground text-xs">
                Goal {formatWeight(goal, gym.units)}
              </span>
              <span className="text-lg font-medium tabular-nums">
                {toGo === undefined || Math.abs(toGo) < 0.1
                  ? "Reached"
                  : `${Math.abs(toGo)} ${weightUnit(gym.units)} to go`}
              </span>
            </div>
          )}
        </div>
        {editable && (
          <LogForm gym={gym} latest={latest} project={project} today={today} />
        )}
      </section>

      <Panel
        action={
          <Tabs onValueChange={(next: Range) => setRange(next)} value={range}>
            <TabsList>
              {RANGES.map((item) => (
                <TabsTrigger
                  className="px-2.5 text-xs"
                  key={item.value}
                  value={item.value}
                >
                  {item.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        }
        description={`With the ${AVERAGE_DAYS}-day average, which evens out a day’s swings`}
        title="Trend"
      >
        {points.length >= 2 ? (
          <TrendChart
            ariaLabel="Body weight over time"
            color={HEX_COLORS[BODY_COLOR]}
            formatValue={(value) =>
              `${Math.round(value * 10) / 10} ${weightUnit(gym.units)}`
            }
            points={points}
            trendLabel={`${AVERAGE_DAYS}-day average`}
          />
        ) : (
          <div className="text-muted-foreground flex flex-col items-center gap-2 py-10 text-center text-sm">
            <ScaleIcon aria-hidden className="size-6" strokeWidth={1.5} />
            {weights.length === 0
              ? "Log your weight a couple of times to see its line."
              : "One more weighing and the line starts."}
          </div>
        )}
      </Panel>

      {newest.length > 0 && (
        <section aria-labelledby="weighings" className="flex flex-col gap-3">
          <h2
            className="text-muted-foreground px-1 text-xs font-medium"
            id="weighings"
          >
            Weighings
          </h2>
          <ol className={cn(PANEL, "divide-y overflow-hidden")}>
            {newest.slice(0, listed).map((item, index) => {
              const before = newest[index + 1];
              const by =
                before && weightChange(item.weight, before.weight, gym.units);
              return (
                <li
                  className="group flex h-12 items-center gap-3 px-4"
                  key={item._id}
                >
                  <span className="text-muted-foreground w-28 shrink-0 text-xs font-medium">
                    {dayLabel(item.date, today)}
                  </span>
                  <span className="flex-1 text-sm font-medium tabular-nums">
                    {formatWeight(item.weight, gym.units)}
                  </span>
                  {by !== undefined && by !== 0 && (
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {formatChange(by, gym.units)}
                    </span>
                  )}
                  {editable && (
                    <Button
                      aria-label={`Delete ${dayLabel(item.date, today)}’s weighing`}
                      className="text-muted-foreground opacity-0 transition-opacity duration-150 ease-out group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
                      onClick={() => removeWeight(item)}
                      size="icon-sm"
                      variant="ghost"
                    >
                      <XIcon />
                    </Button>
                  )}
                </li>
              );
            })}
          </ol>
          {listed < newest.length && (
            <Button
              className="self-center"
              onClick={() => setListed(listed + LIST_PAGE)}
              variant="ghost"
            >
              Show more
            </Button>
          )}
        </section>
      )}
    </div>
  );
}
