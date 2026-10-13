import { cn } from "cn";
import { format, parseISO } from "date-fns";
import { PlusIcon, ScaleIcon } from "lucide-react";
import type { CSSProperties, FormEvent, ReactNode } from "react";
import { useState } from "react";
import { Link } from "wouter";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { gymPath } from "@/features/gym/gym-context";
import { GymSetupNote } from "@/features/widgets/gym-widget";
import { Sparkline } from "@/features/widgets/sparkline";
import type { WidgetKind } from "@/features/widgets/widget-kind";
import { WidgetBleed } from "@/features/widgets/widget-parts";
import { useBodyWeights, useOwnGym } from "@/hooks/use-gym";
import { useToday } from "@/hooks/use-today";
import type { BodyWeight, Gym } from "@/lib/gym";
import {
  BODY_COLOR,
  MAX_BODY_WEIGHT,
  MIN_BODY_WEIGHT,
  addDays,
  formatChange,
  formatLoad,
  fromLoad,
  parseAmount,
  toLoad,
  weightChange,
  weightUnit,
} from "@/lib/gym";
import { logWeight } from "@/lib/gym-actions";
import { dayLabel } from "@/lib/log";
import { CHIP_COLORS, HEX_COLORS } from "@/lib/palette";
import type { Project } from "@/lib/project";
import { canEdit } from "@/lib/project";
import type { SettingsOf } from "@/lib/widgets";
import { BODY_WEIGHT_DEFAULTS } from "@/lib/widgets";

type Settings = SettingsOf<"bodyWeight">;

/** Days of weighings the line covers. */
const DAYS = 90;

function Note({ children }: { children: ReactNode }) {
  return (
    <p className="text-muted-foreground flex h-full items-center justify-center px-4 text-center text-xs">
      {children}
    </p>
  );
}

/** Today's weight, typed in a popover right from the home. */
function QuickLog({
  personal,
  gym,
  latest,
}: {
  personal: Project;
  gym: Gym;
  latest?: BodyWeight;
}) {
  const today = useToday();
  const [open, setOpen] = useState(false);
  const [weight, setWeight] = useState("");
  const value = parseAmount(weight);
  const kg = value === undefined ? undefined : fromLoad(value, gym.units);
  const valid =
    kg !== undefined && kg >= MIN_BODY_WEIGHT && kg <= MAX_BODY_WEIGHT;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (valid && kg !== undefined) {
      logWeight(personal._id, today, kg);
      setWeight("");
      setOpen(false);
    }
  };
  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger
        render={
          <Button
            aria-label="Log today’s weight"
            className="ml-auto"
            size="icon-sm"
            variant="secondary"
          />
        }
      >
        <PlusIcon />
      </PopoverTrigger>
      <PopoverContent align="end" aria-label="Today’s weight" className="w-56">
        <form className="flex flex-col gap-2" onSubmit={submit}>
          <span className="text-muted-foreground text-xs">Today’s weight</span>
          <div className="flex gap-2">
            <div className="relative min-w-0 flex-1">
              <Input
                autoComplete="off"
                autoFocus
                className="pr-9"
                inputMode="decimal"
                onChange={(event) => setWeight(event.target.value)}
                placeholder={latest ? formatLoad(latest.weight, gym.units) : ""}
                value={weight}
              />
              <span className="text-muted-foreground pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-sm">
                {weightUnit(gym.units)}
              </span>
            </div>
            <Button disabled={!valid} type="submit">
              Log
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}

/** The move from the first weighing to the last; undefined with fewer than two. */
function moveOf(weights: readonly BodyWeight[], gym: Gym): number | undefined {
  const [first] = weights;
  const latest = weights.at(-1);
  return latest && first && latest !== first
    ? weightChange(latest.weight, first.weight, gym.units)
    : undefined;
}

/** The weight, its move, and its line, a point picked out as it's pointed at. */
function WeightView({
  personal,
  gym,
  weights,
}: {
  personal: Project;
  gym: Gym;
  weights: readonly BodyWeight[];
}) {
  const today = useToday();
  const [active, setActive] = useState<number>();
  const latest = weights.at(-1);
  const points = weights.map((item) => ({
    t: parseISO(item.date).getTime(),
    value: toLoad(item.weight, gym.units),
  }));
  const shown = active === undefined ? undefined : points[active];
  const move = moveOf(weights, gym);
  let when = "Log your first weighing";
  if (shown) {
    when = format(shown.t, "MMM d");
  } else if (latest) {
    when = `${dayLabel(latest.date, today)}${move === undefined ? "" : ` · ${DAYS} days`}`;
  }
  return (
    <>
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline gap-1.5 text-3xl font-semibold tracking-tight tabular-nums">
          {latest ? (
            <>
              {shown ? shown.value : formatLoad(latest.weight, gym.units)}
              <span className="text-muted-foreground text-sm font-medium tracking-normal">
                {weightUnit(gym.units)}
              </span>
            </>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
          {canEdit(personal) && (
            <QuickLog gym={gym} latest={latest} personal={personal} />
          )}
        </div>
        <div className="flex h-6 min-w-0 items-center gap-2 text-xs">
          {move !== undefined && (
            <span
              className={cn(
                "inline-flex h-6 shrink-0 items-center rounded-full px-2 font-medium tabular-nums",
                CHIP_COLORS[BODY_COLOR]
              )}
            >
              {formatChange(move, gym.units)}
            </span>
          )}
          <Link
            className="text-muted-foreground hover:text-foreground truncate transition-colors duration-150"
            draggable={false}
            href={gymPath(personal, "body")}
          >
            {when}
          </Link>
        </div>
      </div>
      <WidgetBleed>
        {points.length >= 2 ? (
          <div
            // The line in body weight's color rather than the hub's.
            style={{ "--primary": HEX_COLORS[BODY_COLOR] } as CSSProperties}
          >
            <Sparkline
              active={active}
              describe={(point) =>
                `${format(point.t, "MMM d")}: ${point.value} ${weightUnit(gym.units)}`
              }
              label="Body weight"
              onActiveChange={setActive}
              points={points}
            />
          </div>
        ) : (
          <div className="border-t" style={{ height: 76 }}>
            <Note>
              <ScaleIcon aria-hidden className="mr-1.5 size-3.5" />
              Two weighings start the line.
            </Note>
          </div>
        )}
      </WidgetBleed>
    </>
  );
}

function BodyWeightBody() {
  const today = useToday();
  const { personal, gym, loaded } = useOwnGym();
  const { weights, loaded: weightsLoaded } = useBodyWeights(
    gym ? personal : undefined,
    addDays(today, -DAYS)
  );
  if (loaded && personal && !gym) {
    return <GymSetupNote height={120} personal={personal} />;
  }
  if (!(personal && gym && weightsLoaded)) {
    return (
      <div aria-busy className="flex flex-col gap-2">
        <Skeleton className="h-9 w-28 rounded-lg" />
        <Skeleton className="h-6 w-24 rounded-full" />
      </div>
    );
  }
  return <WeightView gym={gym} personal={personal} weights={weights} />;
}

function BodyWeightSettings() {
  const { personal } = useOwnGym();
  return (
    <p className="text-muted-foreground text-xs">
      Follows your body weight over {DAYS} days. Every weighing and your goal
      are in{" "}
      {personal ? (
        <Link
          className="text-foreground underline-offset-4 hover:underline"
          href={gymPath(personal, "body")}
        >
          your gym
        </Link>
      ) : (
        "your gym"
      )}
      .
    </p>
  );
}

/** Body weight from the home: where it is, its line, and today's in a tap. */
export const BODY_WEIGHT: WidgetKind<Settings> = {
  Body: BodyWeightBody,
  Settings: BodyWeightSettings,
  color: BODY_COLOR,
  defaults: BODY_WEIGHT_DEFAULTS,
  description: "Your body weight and where it’s going",
  icon: ScaleIcon,
  name: "Weight",
};
