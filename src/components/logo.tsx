import { cn } from "cn";

import { APP_NAME } from "@/lib/brand";

/** Roughly how wide each letter of the name sets, in the mark's units. */
const LETTER_WIDTH = 12;
const MARK = 28;
const GAP = 8;

/** Spokes joining at the middle, on the primary color. */
function MarkShapes() {
  return (
    <>
      <rect className="fill-primary" height={MARK} rx="8" width={MARK} />
      <path
        className="stroke-primary-foreground"
        d="M14 14 8.5 8.5M14 14l5.5-5.5M14 14v6.5"
        fill="none"
        strokeLinecap="round"
        strokeWidth="2.2"
      />
      <g className="fill-primary-foreground">
        <circle cx="14" cy="14" r="3.2" />
        <circle cx="8" cy="8" r="2.2" />
        <circle cx="20" cy="8" r="2.2" />
        <circle cx="14" cy="21.5" r="2.2" />
      </g>
    </>
  );
}

/** The hub's mark alone. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      className={cn("shrink-0", className)}
      viewBox={`0 0 ${MARK} ${MARK}`}
    >
      <MarkShapes />
    </svg>
  );
}

/** The mark and the hub's name, sized by the height given in `className`. */
export function Logo({ className }: { className?: string }) {
  const width = MARK + GAP + Math.ceil(APP_NAME.length * LETTER_WIDTH);
  return (
    <svg
      aria-hidden
      className={cn("w-auto shrink-0", className)}
      viewBox={`0 0 ${width} ${MARK}`}
    >
      <MarkShapes />
      <text
        className="fill-foreground font-sans"
        dominantBaseline="central"
        fontSize="18"
        fontWeight="600"
        letterSpacing="-0.3"
        x={MARK + GAP}
        y={MARK / 2 + 0.5}
      >
        {APP_NAME}
      </text>
    </svg>
  );
}
