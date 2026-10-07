import { cn } from "cn";
import type { ReactNode } from "react";
import { Fragment } from "react";

import { AvatarGroup, AvatarGroupCount } from "@/components/ui/avatar";
import { UserAvatar } from "@/components/user-avatar";
import { LABEL_COLORS } from "@/features/card/card-fields";
import { useUser } from "@/hooks/use-users";
import type { Label } from "@/lib/model";

const STACKED = 3;

export function Muted({ children }: { children: ReactNode }) {
  return <span className="text-muted-foreground">{children}</span>;
}

export function LabelDot({ label }: { label: Label }) {
  return (
    <span
      aria-hidden
      className={cn("size-2.5 rounded-full bg-current", LABEL_COLORS[label])}
    />
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
