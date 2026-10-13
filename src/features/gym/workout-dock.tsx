import { cn } from "cn";
import { CheckIcon, ChevronRightIcon, DumbbellIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";

import { Corner } from "@/components/corner";
import { Button } from "@/components/ui/button";
import { workoutPath } from "@/features/gym/gym-context";
import { LiveDot } from "@/features/gym/gym-parts";
import { useActiveWorkout, useOwnGym, useSecond } from "@/hooks/use-gym";
import type { Workout } from "@/lib/gym";
import { MAX_REST, formatClock, workoutSeconds } from "@/lib/gym";
import { setRest } from "@/lib/gym-actions";
import { playSound, ringAlarm } from "@/lib/sounds";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;
/** What −/+ take off or add to a rest, in seconds. */
const NUDGE = 15;
/** A rest that ran out shows as over this long, in ms, then tucks itself away. */
const OVER_SHOWN = 60_000;
/**
 * A rest found over by more than this, in ms, rings no more, like on coming
 * back to the hub long after. Background tabs tick slowly, so it's generous.
 */
const RING_WINDOW = 60_000;

/**
 * Rings once as the rest runs out, ticking down its last three seconds. The
 * ring is timed to the rest's end itself, so a tab in the background, whose
 * ticks browsers slow down, still rings on time.
 */
function useRestAlarm(workout: Workout | undefined, now: number) {
  const rung = useRef<number | null>(null);
  const ticked = useRef<string | null>(null);
  const endsAt = workout?.rest?.endsAt;
  useEffect(() => {
    if (endsAt === undefined) {
      return;
    }
    const ring = () => {
      if (rung.current !== endsAt && Date.now() - endsAt < RING_WINDOW) {
        rung.current = endsAt;
        ringAlarm();
      }
    };
    const timer = setTimeout(ring, Math.max(0, endsAt - Date.now()));
    return () => clearTimeout(timer);
  }, [endsAt]);
  useEffect(() => {
    if (endsAt === undefined) {
      return;
    }
    const second = Math.ceil((endsAt - now) / 1000);
    const tick = `${endsAt}:${second}`;
    if (second >= 1 && second <= 3 && ticked.current !== tick) {
      ticked.current = tick;
      playSound("tick");
    }
  }, [endsAt, now]);
}

/** How much of the rest is left, as a ring that empties. */
function RestRing({ share, over }: { share: number; over: boolean }) {
  const radius = 15;
  const length = 2 * Math.PI * radius;
  return (
    <svg
      aria-hidden
      className="absolute inset-0 -rotate-90"
      viewBox="0 0 36 36"
    >
      <circle
        className="stroke-foreground/10"
        cx="18"
        cy="18"
        fill="none"
        r={radius}
        strokeWidth="3"
      />
      <circle
        className={cn(
          "transition-[stroke-dashoffset,stroke] duration-1000 ease-linear",
          over ? "stroke-green-500" : "stroke-primary"
        )}
        cx="18"
        cy="18"
        fill="none"
        r={radius}
        strokeDasharray={length}
        strokeDashoffset={over ? 0 : length * (1 - share)}
        strokeLinecap="round"
        strokeWidth="3"
      />
    </svg>
  );
}

/** A rest under way: when it ends against now, and whether it's over. */
interface RestState {
  rest: NonNullable<Workout["rest"]>;
  /** Ms left; below zero once it's over. */
  left: number;
  over: boolean;
}

/** The rest's ring with its seconds, or the workout's mark while there's none. */
function DockMark({ resting }: { resting?: RestState }) {
  if (!resting) {
    return (
      <span className="bg-primary/12 text-primary dark:bg-primary/16 flex size-11 shrink-0 items-center justify-center rounded-xl">
        <DumbbellIcon aria-hidden className="size-5" />
      </span>
    );
  }
  const { left, over, rest } = resting;
  return (
    <span className="relative flex size-11 shrink-0 items-center justify-center">
      <RestRing
        over={over}
        share={rest.seconds > 0 ? left / (rest.seconds * 1000) : 0}
      />
      {over ? (
        <CheckIcon
          aria-hidden
          className="size-4 text-green-500"
          strokeWidth={3}
        />
      ) : (
        <span className="text-[11px] font-semibold tabular-nums">
          {Math.ceil(left / 1000)}
        </span>
      )}
    </span>
  );
}

/** What the card says: the rest or the workout, and the workout's time when away from it. */
function DockText({
  workout,
  resting,
  onPage,
  now,
}: {
  workout: Workout;
  resting?: RestState;
  onPage: boolean;
  now: number;
}) {
  let line: ReactNode = (
    <>
      <LiveDot className="size-1.5" />
      <span className="truncate tabular-nums">
        {formatClock(workoutSeconds(workout, now))}
      </span>
    </>
  );
  if (resting && onPage) {
    line = resting.over ? "Time for your next set" : "Breathe. Next set soon";
  } else if (resting) {
    line = (
      <span className="truncate tabular-nums">
        {workout.title} · {formatClock(workoutSeconds(workout, now))}
      </span>
    );
  }
  let title = <span className="truncate">{workout.title}</span>;
  if (resting) {
    title = (
      <span aria-live="polite" className="tabular-nums">
        {resting.over
          ? "Rest’s over"
          : `Rest ${formatClock(resting.left / 1000)}`}
      </span>
    );
  }
  return (
    <>
      <span className="flex items-center gap-2 text-sm font-medium">
        {title}
      </span>
      <span className="text-muted-foreground flex items-center gap-1.5 truncate text-xs">
        {line}
      </span>
    </>
  );
}

/** Stretches, shortens, skips or clears the rest. */
function RestControls({
  workout,
  resting,
  now,
}: {
  workout: Workout;
  resting: RestState;
  now: number;
}) {
  const { left, over, rest } = resting;
  const nudge = (by: number) => {
    const remaining = Math.max(0, left / 1000) + by;
    if (remaining <= 0) {
      setRest(workout, null);
      return;
    }
    const seconds = Math.min(MAX_REST, Math.round(remaining));
    setRest(workout, {
      endsAt: now + seconds * 1000,
      seconds: Math.max(rest.seconds, seconds),
    });
  };
  return (
    <div className="flex shrink-0 items-center gap-1">
      {!over && (
        <>
          <Button
            aria-label={`${NUDGE} seconds less`}
            className="tabular-nums"
            onClick={() => nudge(-NUDGE)}
            size="sm"
            variant="ghost"
          >
            −{NUDGE}
          </Button>
          <Button
            aria-label={`${NUDGE} seconds more`}
            className="tabular-nums"
            onClick={() => nudge(NUDGE)}
            size="sm"
            variant="ghost"
          >
            +{NUDGE}
          </Button>
        </>
      )}
      <Button
        onClick={() => setRest(workout, null)}
        size="sm"
        variant="secondary"
      >
        {over ? "Done" : "Skip"}
      </Button>
    </div>
  );
}

/** The rest under way, unless there's none or it's long over. */
function restState(
  workout: Workout | undefined,
  now: number
): { resting?: RestState; stale: boolean } {
  const rest = workout?.rest;
  if (!rest) {
    return { stale: false };
  }
  const left = rest.endsAt - now;
  return left < -OVER_SHOWN
    ? { stale: true }
    : { resting: { left, over: left <= 0, rest }, stale: false };
}

/**
 * The workout under way, from anywhere in the hub: its time, and the rest
 * between sets with a way to stretch, shorten or skip it. On the workout's
 * own page, only the rest shows. The rest rings as it runs out, wherever
 * the person is in the hub.
 */
export function WorkoutDock() {
  const { personal, gym } = useOwnGym();
  const workout = useActiveWorkout(gym ? personal : undefined) ?? undefined;
  const [location] = useLocation();
  const now = useSecond(workout !== undefined);
  useRestAlarm(workout, now);
  const { resting, stale } = restState(workout, now);

  // A rest long over is cleared, so it doesn't greet the next visit.
  useEffect(() => {
    if (workout && stale) {
      setRest(workout, null);
    }
  }, [workout, stale]);

  const href = personal && workout ? workoutPath(personal, workout) : "";
  const onPage = location === href;
  const visible = workout !== undefined && (resting !== undefined || !onPage);

  return (
    <Corner>
      <AnimatePresence>
        {visible && workout && (
          <motion.section
            animate={{ filter: "blur(0px)", opacity: 1, scale: 1, y: 0 }}
            aria-label={resting ? "Rest" : "Workout under way"}
            className="bg-popover text-popover-foreground shadow-raised pointer-events-auto order-2 flex w-92 max-w-full origin-bottom-right items-center gap-3 rounded-2xl p-2.5"
            exit={{
              filter: "blur(4px)",
              opacity: 0,
              scale: 0.96,
              transition: { duration: 0.15 },
              y: 8,
            }}
            initial={{ filter: "blur(4px)", opacity: 0, scale: 0.96, y: 16 }}
            layout
            transition={{ duration: 0.3, ease: EASE_OUT }}
          >
            <DockMark resting={resting} />
            <Link
              className="focus-visible:ring-ring/50 flex min-w-0 flex-1 flex-col rounded-lg outline-none focus-visible:ring-3"
              href={href}
            >
              <DockText
                now={now}
                onPage={onPage}
                resting={resting}
                workout={workout}
              />
            </Link>
            {resting ? (
              <RestControls now={now} resting={resting} workout={workout} />
            ) : (
              <ChevronRightIcon
                aria-hidden
                className="text-muted-foreground mr-1 size-4 shrink-0"
              />
            )}
          </motion.section>
        )}
      </AnimatePresence>
    </Corner>
  );
}
