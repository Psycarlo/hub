import { cn } from "cn";

import { UserAvatar } from "@/components/user-avatar";
import type { Color } from "@/lib/palette";
import { SWATCH_COLORS } from "@/lib/palette";

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
  project: { title: string; color: Color; personalFor?: string };
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
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center font-semibold text-white select-none",
        project.color === "yellow" && "text-black/75",
        SWATCH_COLORS[project.color],
        SIZES[size],
        className
      )}
    >
      {initial}
    </span>
  );
}
