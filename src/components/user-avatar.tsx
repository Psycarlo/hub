import type { ComponentProps } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useUser } from "@/hooks/use-users";

function hash(value: string): number {
  let result = 0;
  for (const char of value) {
    result = (result * 31 + (char.codePointAt(0) ?? 0)) % 1_000_003;
  }
  return result;
}

// A stable two-tone gradient per person, so people without a photo stay recognizable.
function gradient(userId: string): string {
  const seed = hash(userId);
  const from = seed % 360;
  const to = (from + 40 + (seed % 100)) % 360;
  return `linear-gradient(135deg, oklch(0.8 0.12 ${from}), oklch(0.6 0.16 ${to}))`;
}

function initial(name: string): string {
  return [...name.trim()][0]?.toUpperCase() ?? "";
}

/** The initial's size per avatar size; the smallest avatars show only color. */
const LETTER = {
  default: "text-xs",
  lg: "text-base",
  sm: "text-[0.625rem]",
  xs: "hidden",
} as const;

type UserAvatarProps = ComponentProps<typeof Avatar> & { userId: string };

export function UserAvatar({
  userId,
  size = "default",
  ...props
}: UserAvatarProps) {
  const { name, image } = useUser(userId);
  return (
    <Avatar size={size} {...props}>
      {image && <AvatarImage alt={name} src={image} />}
      <AvatarFallback
        className="font-medium text-white/95"
        style={{ backgroundImage: gradient(userId) }}
      >
        <span aria-hidden className={LETTER[size]}>
          {initial(name)}
        </span>
        <span className="sr-only">{name}</span>
      </AvatarFallback>
    </Avatar>
  );
}
