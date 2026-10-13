import { cn } from "cn";
import type { LucideIcon } from "lucide-react";
import {
  DumbbellIcon,
  PersonStandingIcon,
  RouteIcon,
  TimerIcon,
  TrophyIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import type { Exercise, ExerciseKind, Region } from "@/lib/gym";
import { REGIONS, regionsOf } from "@/lib/gym";
import type { Color } from "@/lib/palette";
import { CHIP_COLORS } from "@/lib/palette";

export const KIND_ICONS: Record<ExerciseKind, LucideIcon> = {
  distance: RouteIcon,
  reps: PersonStandingIcon,
  time: TimerIcon,
  weight: DumbbellIcon,
};

/** Each part of the body in a color of its own, so lists of exercises scan by it. */
export const REGION_COLORS: Record<Region, Color> = {
  arms: "yellow",
  back: "blue",
  chest: "red",
  core: "teal",
  legs: "purple",
  shoulders: "orange",
};

/** The exercise's color: its first region's, gray for one without muscles, like a run. */
export function exerciseColor(exercise: Pick<Exercise, "muscles">): Color {
  const [region] = regionsOf(exercise);
  return region ? REGION_COLORS[region] : "gray";
}

const BADGE_SIZES = {
  md: { badge: "size-9 rounded-xl", icon: "size-4" },
  sm: { badge: "size-7 rounded-lg", icon: "size-3.5" },
  xs: { badge: "size-5 rounded-md", icon: "size-3" },
};

/** The exercise's kind as an icon, on the color of where it trains. */
export function ExerciseBadge({
  exercise,
  size = "sm",
  className,
}: {
  exercise: Pick<Exercise, "kind" | "muscles">;
  size?: keyof typeof BADGE_SIZES;
  className?: string;
}) {
  const Icon = KIND_ICONS[exercise.kind];
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center",
        BADGE_SIZES[size].badge,
        CHIP_COLORS[exerciseColor(exercise)],
        className
      )}
    >
      <Icon className={BADGE_SIZES[size].icon} />
    </span>
  );
}

/** A surface the gym's sections sit on. */
export const PANEL = "bg-card shadow-surface rounded-2xl";

/** A panel with a heading, a line under it and anything beside it. */
export function Panel({
  title,
  description,
  action,
  className,
  children,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className={cn(PANEL, "flex flex-col gap-4 p-4 sm:p-5", className)}
    >
      <header className="flex min-h-8 items-center gap-3">
        <div className="flex min-w-0 flex-1 flex-col">
          <h2 className="truncate font-medium">{title}</h2>
          {description && (
            <p className="text-muted-foreground truncate text-xs">
              {description}
            </p>
          )}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

/** One number with what it is, and maybe how it moved. */
export function Stat({
  label,
  value,
  note,
  className,
}: {
  label: string;
  value: ReactNode;
  /** Under the number, like a change since last week. */
  note?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      <span className="text-muted-foreground truncate text-xs">{label}</span>
      <span className="truncate text-2xl font-semibold tracking-tight tabular-nums">
        {value}
      </span>
      {note && <span className="truncate text-xs">{note}</span>}
    </div>
  );
}

/** How a number moved, green for up and red for down; quiet when it held. */
export function Change({
  by,
  children,
  lowerIsBetter = false,
}: {
  by: number;
  children: ReactNode;
  lowerIsBetter?: boolean;
}) {
  const good = lowerIsBetter ? by < 0 : by > 0;
  return (
    <span
      className={cn(
        "tabular-nums",
        by === 0 && "text-muted-foreground",
        by !== 0 &&
          (good
            ? "text-green-600 dark:text-green-400"
            : "text-red-600 dark:text-red-400")
      )}
    >
      {children}
    </span>
  );
}

/** Records beaten, as a gold chip. */
export function TrophyChip({
  count,
  className,
}: {
  count: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1 rounded-full pr-2 pl-1.5 text-xs font-medium tabular-nums",
        CHIP_COLORS.yellow,
        className
      )}
    >
      <TrophyIcon aria-hidden className="size-3.5" />
      {count}
      <span className="sr-only"> {count === 1 ? "record" : "records"}</span>
    </span>
  );
}

/** A dot that breathes, for something under way; white on a colored button. */
export function LiveDot({
  light = false,
  className,
}: {
  light?: boolean;
  className?: string;
}) {
  return (
    <span aria-hidden className={cn("relative flex size-2", className)}>
      <span
        className={cn(
          "absolute inset-0 rounded-full motion-safe:animate-ping motion-reduce:scale-150 motion-reduce:opacity-40",
          light ? "bg-white/60" : "bg-primary/60"
        )}
      />
      <span
        className={cn(
          "relative size-full rounded-full",
          light ? "bg-white" : "bg-primary"
        )}
      />
    </span>
  );
}

/** The filter for exercises with no muscles, like runs. */
const OTHER = "other";

/** A part of the body to show exercises of, "other" for those without muscles, or null for all. */
export type RegionFilterValue = Region | typeof OTHER | null;

export function inRegion(
  exercise: Pick<Exercise, "muscles">,
  filter: RegionFilterValue
): boolean {
  if (filter === null) {
    return true;
  }
  const regions = regionsOf(exercise);
  return filter === OTHER ? regions.length === 0 : regions.includes(filter);
}

/** Parts of the body as a row of pills, one picked at most. */
export function RegionFilter({
  value,
  exercises,
  className,
  onChange,
}: {
  value: RegionFilterValue;
  /** The exercises filtered, to offer "Other" only when some have no muscles. */
  exercises: readonly Pick<Exercise, "muscles">[];
  className?: string;
  onChange: (value: RegionFilterValue) => void;
}) {
  const pill =
    "focus-visible:ring-ring/50 h-8 shrink-0 rounded-full px-3 text-sm transition-[background-color,color,scale] duration-150 ease-out outline-none focus-visible:ring-3 active:scale-[0.96] aria-pressed:bg-foreground aria-pressed:text-background bg-foreground/5 hover:bg-foreground/10";
  const options: { id: Exclude<RegionFilterValue, null>; label: string }[] = [
    ...REGIONS,
    ...(exercises.some((exercise) => regionsOf(exercise).length === 0)
      ? [{ id: OTHER, label: "Other" } as const]
      : []),
  ];
  return (
    <div
      aria-label="Part of the body"
      className={cn(
        "flex gap-1.5 overflow-x-auto [&::-webkit-scrollbar]:hidden",
        className
      )}
      role="toolbar"
    >
      <button
        aria-pressed={value === null}
        className={pill}
        onClick={() => onChange(null)}
        type="button"
      >
        All
      </button>
      {options.map((option) => (
        <button
          aria-pressed={value === option.id}
          className={pill}
          key={option.id}
          onClick={() => onChange(value === option.id ? null : option.id)}
          type="button"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
