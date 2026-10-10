import { cn } from "cn";
import { useId } from "react";

import { APP_NAME, useLogo } from "@/lib/brand";

/** Roughly how wide each letter of the name sets, in the mark's units. */
const LETTER_WIDTH = 12;
const MARK = 28;
const GAP = 8;

/** The default logo, also the installed app's icon. Made from assets/logo.png. */
const DEFAULT_LOGO = "/icons/icon-192.png";

/** The uploaded logo, or the default one, clipped to the mark's rounded square. */
function MarkShapes() {
  const logo = useLogo() ?? DEFAULT_LOGO;
  const clip = useId();
  return (
    <>
      <clipPath id={clip}>
        <rect height={MARK} rx="8" width={MARK} />
      </clipPath>
      <image
        clipPath={`url(#${clip})`}
        height={MARK}
        href={logo}
        preserveAspectRatio="xMidYMid meet"
        width={MARK}
      />
    </>
  );
}

/** The hub's mark alone: its logo, or the default one. */
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
