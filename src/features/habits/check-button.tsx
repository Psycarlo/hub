import { cn } from "cn";
import { CheckIcon, PlusIcon } from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { playCount } from "@/lib/habit-actions";
import type { Habit } from "@/lib/habits";
import { isDone, nextCount } from "@/lib/habits";
import type { Color, HexColor } from "@/lib/palette";
import { paint } from "@/lib/palette";

const SIZES = {
  lg: {
    button: "size-11 rounded-2xl",
    icon: "size-5",
    plus: "size-4",
    ring: 36,
  },
  md: {
    button: "size-9 rounded-xl",
    icon: "size-4",
    plus: "size-3.5",
    ring: 28,
  },
  sm: {
    button: "size-7 rounded-lg",
    icon: "size-3.5",
    plus: "size-3",
    ring: 22,
  },
} as const;

/** How far round the goal the day has come, as a ring that fills. */
function ProgressRing({
  share,
  size,
  color,
}: {
  share: number;
  size: number;
  color: Color | HexColor;
}) {
  const radius = (size - 3) / 2;
  const stroke = paint(color, "text");
  const circumference = 2 * Math.PI * radius;
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute -rotate-90"
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      width={size}
    >
      <circle
        className="stroke-foreground/10"
        cx={size / 2}
        cy={size / 2}
        fill="none"
        r={radius}
        strokeWidth={2}
      />
      <circle
        className={cn(
          "stroke-current transition-[stroke-dashoffset] duration-300 ease-out",
          stroke.className
        )}
        cx={size / 2}
        cy={size / 2}
        fill="none"
        r={radius}
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - share)}
        strokeLinecap="round"
        strokeWidth={2}
        style={stroke.style}
      />
    </svg>
  );
}

interface CheckButtonProps {
  habit: Habit;
  /** Times done on the day. */
  count: number;
  /** Sets the day's count; read-only without it. */
  onCount?: (count: number) => void;
  size?: keyof typeof SIZES;
  className?: string;
}

/**
 * Marks the habit done for a day. A habit done more than once a day fills a
 * ring with each tap; once done, a tap takes the last one back.
 */
export function CheckButton({
  habit,
  count,
  onCount,
  size = "md",
  className,
}: CheckButtonProps) {
  const done = isDone(count, habit.goal);
  const counted = habit.goal > 1;
  const { button, icon, plus, ring } = SIZES[size];
  const swatch = paint(habit.color, "onSwatch");
  let label = done ? `Undo ${habit.title}` : `Done ${habit.title}`;
  if (counted) {
    label = `${habit.title}: ${Math.min(count, habit.goal)} of ${habit.goal}`;
  }
  const element = (
    <button
      aria-label={label}
      aria-pressed={counted ? undefined : done}
      className={cn(
        "focus-visible:ring-ring/50 relative flex shrink-0 items-center justify-center transition-[background-color,color,scale] duration-150 ease-out outline-none after:absolute after:-inset-1 focus-visible:ring-3 active:scale-[0.92] disabled:cursor-default disabled:active:scale-100",
        button,
        done
          ? swatch.className
          : "bg-foreground/[0.06] text-muted-foreground enabled:hover:bg-foreground/10 enabled:hover:text-foreground",
        className
      )}
      disabled={!onCount}
      onClick={() => {
        const next = nextCount(count, habit.goal);
        playCount(habit, count, next);
        onCount?.(next);
      }}
      style={done ? swatch.style : undefined}
      type="button"
    >
      {counted && !done && (
        <ProgressRing
          color={habit.color}
          share={Math.min(count, habit.goal) / habit.goal}
          size={ring}
        />
      )}
      {counted && !done ? (
        <PlusIcon aria-hidden className={plus} strokeWidth={2.5} />
      ) : (
        <CheckIcon
          aria-hidden
          className={cn(
            icon,
            "transition-[scale] duration-200 ease-out",
            !done && "scale-90"
          )}
          strokeWidth={done ? 3 : 2.25}
        />
      )}
    </button>
  );
  if (!(counted && onCount)) {
    return element;
  }
  return (
    <Tooltip>
      <TooltipTrigger render={element} />
      <TooltipContent className="tabular-nums">
        {Math.min(count, habit.goal)} of {habit.goal}
      </TooltipContent>
    </Tooltip>
  );
}
