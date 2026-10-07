import { cn } from "cn";

import { UserAvatar } from "@/components/user-avatar";
import { isLight } from "@/lib/color";
import type { Color, HexColor } from "@/lib/palette";
import { isHexColor, SWATCH_COLORS } from "@/lib/palette";

const SIZES = {
  default: "size-5 rounded-md text-[0.65rem]",
  lg: "size-11 rounded-xl text-lg",
  md: "size-8 rounded-lg text-sm",
} as const;

/** A personal project shows its owner, round, so it never reads as a shared one. */
const PERSON_SIZES = {
  default: { className: "size-5", size: "xs" },
  lg: { className: "size-11", size: "lg" },
  md: { className: "size-8", size: "default" },
} as const;

export function ProjectAvatar({
  project,
  size = "default",
  className,
}: {
  project: { title: string; color: Color | HexColor; personalFor?: string };
  size?: keyof typeof SIZES;
  className?: string;
}) {
  if (project.personalFor) {
    const person = PERSON_SIZES[size];
    return (
      <UserAvatar
        aria-hidden
        className={cn(person.className, className)}
        size={person.size}
        userId={project.personalFor}
      />
    );
  }
  const initial = [...project.title.trim()][0]?.toUpperCase() ?? "?";
  const { color } = project;
  const custom = isHexColor(color);
  const light = custom ? isLight(color) : color === "yellow";
  return (
    <span
      aria-hidden
      className={cn(
        "image-outline flex shrink-0 items-center justify-center font-semibold text-white select-none",
        light && "text-black/75",
        !custom && SWATCH_COLORS[color],
        SIZES[size],
        className
      )}
      style={custom ? { backgroundColor: color } : undefined}
    >
      {initial}
    </span>
  );
}
