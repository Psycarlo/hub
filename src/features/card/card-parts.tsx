import { cn } from "cn";
import type { ReactNode } from "react";
import { Fragment } from "react";

import { AvatarGroup, AvatarGroupCount } from "@/components/ui/avatar";
import { UserAvatar } from "@/components/user-avatar";
import { useUser } from "@/hooks/use-users";
import type { BoardLabel } from "@/lib/model";
import type { Color } from "@/lib/palette";
import { SWATCH_COLORS } from "@/lib/palette";

const STACKED = 3;

export function Muted({ children }: { children: ReactNode }) {
  return <span className="text-muted-foreground">{children}</span>;
}

export function LabelDot({
  color,
  className,
}: {
  color: Color;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "size-2 shrink-0 rounded-full",
        SWATCH_COLORS[color],
        className
      )}
    />
  );
}

/** A label as a pill: its color, then its name. */
export function LabelChip({ label }: { label: BoardLabel }) {
  return (
    <span className="border-border inline-flex h-5 max-w-36 min-w-0 items-center gap-1.5 rounded-full border px-1.5 text-xs">
      <LabelDot color={label.color} />
      <span className="truncate">{label.name}</span>
    </span>
  );
}

function PersonName({ userId }: { userId: string }) {
  return useUser(userId).name;
}

export function Person({ userId }: { userId: string }) {
  return (
    <>
      <UserAvatar aria-hidden size="xs" userId={userId} />
      <span className="truncate">
        <PersonName userId={userId} />
      </span>
    </>
  );
}

/** Stacked avatars of the first few people, then a count. */
export function AvatarStack({
  people,
  surface = "card",
  className,
}: {
  people: string[];
  /** What the stack sits on, so the rings between avatars match it. */
  surface?: "card" | "popover";
  className?: string;
}) {
  const hidden = people.length - STACKED;
  const onPopover = surface === "popover";
  return (
    <AvatarGroup
      className={cn(
        "-space-x-1",
        onPopover && "*:data-[slot=avatar]:ring-popover",
        className
      )}
    >
      {people.slice(0, STACKED).map((userId) => (
        <UserAvatar key={userId} size="xs" userId={userId} />
      ))}
      {hidden > 0 && (
        <AvatarGroupCount
          className={cn("size-5 text-[0.625rem]", onPopover && "ring-popover")}
        >
          +{hidden}
        </AvatarGroupCount>
      )}
    </AvatarGroup>
  );
}

/** Assignees as a value: one person by name, several as avatars and names. */
export function People({ people }: { people: string[] }) {
  const [only] = people;
  if (!only) {
    return <Muted>Unassigned</Muted>;
  }
  if (people.length === 1) {
    return <Person userId={only} />;
  }
  return (
    <>
      <AvatarStack className="shrink-0" people={people} surface="popover" />
      <span className="truncate">
        {people.map((userId, index) => (
          <Fragment key={userId}>
            {index > 0 && ", "}
            <PersonName userId={userId} />
          </Fragment>
        ))}
      </span>
    </>
  );
}
