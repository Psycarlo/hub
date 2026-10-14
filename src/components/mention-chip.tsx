import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { Seen } from "@convex/presence";
import { cn } from "cn";
import { useQuery } from "convex/react";
import { format, formatDistanceStrict } from "date-fns";
import { use, useState } from "react";
import { Link } from "wouter";

import { ProjectAvatar } from "@/components/project-avatar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { avatarGradient, UserAvatar } from "@/components/user-avatar";
import { useNow } from "@/hooks/use-now";
import { MeContext, useUser } from "@/hooks/use-users";
import { projectPath } from "@/lib/project";

/** Shared projects shown before the rest fold into a count. */
const MAX_PROJECTS = 6;

const DOT: Record<Seen["state"], string> = {
  away: "bg-amber-400",
  offline: "bg-muted-foreground/40",
  online: "bg-green-500",
};

const LABEL: Record<Seen["state"], string> = {
  away: "Away",
  offline: "Offline",
  online: "Online",
};

/** A soft wash of their photo's colors, or their placeholder's, behind the card's top. */
function Glow({ userId, image }: { userId: string; image?: string }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden mask-[linear-gradient(to_bottom,#000,transparent)]"
    >
      {image ? (
        <img
          alt=""
          className="size-full scale-150 object-cover opacity-60 blur-2xl saturate-150 dark:opacity-40"
          src={image}
        />
      ) : (
        <div
          className="size-full scale-150 opacity-40 blur-2xl dark:opacity-30"
          style={{ backgroundImage: avatarGradient(userId) }}
        />
      )}
    </div>
  );
}

/** "Online", "Away", or when they were last here. */
function Presence({ seen }: { seen: Seen | undefined }) {
  const now = useNow();
  if (!seen) {
    return <p aria-hidden className="h-4" />;
  }
  const { state, lastSeen } = seen;
  return (
    <p className="text-muted-foreground flex h-4 items-center gap-2">
      <span className="flex size-5 shrink-0 items-center justify-center">
        <span className={cn("size-2 rounded-full", DOT[state])} />
      </span>
      {state === "offline" && lastSeen ? (
        <time
          dateTime={new Date(lastSeen).toISOString()}
          title={format(lastSeen, "PPpp")}
        >
          Seen{" "}
          {now - lastSeen < 60_000
            ? "just now"
            : formatDistanceStrict(lastSeen, now, { addSuffix: true })}
        </time>
      ) : (
        LABEL[state]
      )}
    </p>
  );
}

/** The projects they're on that you can see, each a way into it. */
function Projects({ userId, onOpen }: { userId: string; onOpen: () => void }) {
  const projects = useQuery(api.projects.list);
  const shared = (projects ?? []).filter(
    (project) =>
      project.personalFor === userId ||
      project.members.some((member) => member.userId === userId)
  );
  if (shared.length === 0) {
    return null;
  }
  const rest = shared.length - MAX_PROJECTS;
  return (
    <ul aria-label="Projects" className="flex flex-wrap gap-1">
      {shared.slice(0, MAX_PROJECTS).map((project) => (
        <li key={project._id}>
          <Link
            className="hover:bg-foreground/5 focus-visible:ring-ring/50 flex max-w-36 items-center gap-1.5 rounded-md py-0.5 pr-1.5 transition-colors duration-150 outline-none focus-visible:ring-3"
            href={projectPath(project)}
            onClick={onOpen}
          >
            <ProjectAvatar project={project} />
            <span className="truncate">{project.title}</span>
          </Link>
        </li>
      ))}
      {rest > 0 && (
        <li className="text-muted-foreground px-1 py-0.5 tabular-nums">
          +{rest}
        </li>
      )}
    </ul>
  );
}

/** Who they are, whether they're here, and the projects you share. */
function ProfileCard({
  userId,
  onOpen,
}: {
  userId: string;
  onOpen: () => void;
}) {
  const { name, image, user } = useUser(userId);
  const me = use(MeContext);
  const seen = useQuery(api.presence.seen, {
    userId: userId as Id<"users">,
  });
  const here = seen && seen.state !== "offline";
  return (
    <>
      <div className="relative">
        <Glow image={image} userId={userId} />
        <div className="relative flex items-center gap-3 p-3 pt-5">
          <span className="relative shrink-0">
            <UserAvatar className="size-12" size="lg" userId={userId} />
            {here && (
              <span
                aria-hidden
                className={cn(
                  "ring-popover absolute right-0 bottom-0 size-3 rounded-full ring-[3px]",
                  DOT[seen.state]
                )}
              />
            )}
          </span>
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-medium">
              {name}
              {me?._id === userId && (
                <span className="text-muted-foreground"> (you)</span>
              )}
            </span>
            {user?.email && (
              <span className="text-muted-foreground truncate text-xs">
                {user.email}
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-2 border-t p-3 text-xs">
        <Presence seen={seen} />
        <Projects onOpen={onOpen} userId={userId} />
      </div>
    </>
  );
}

/**
 * Someone mentioned, by name, with their card on hover or tap. Mentions of
 * you stand out. Inside a link, where a card can't open, `plain` keeps it a
 * name alone.
 */
export function MentionChip({
  userId,
  plain = false,
}: {
  userId: string;
  plain?: boolean;
}) {
  const { name } = useUser(userId);
  const me = use(MeContext);
  const [open, setOpen] = useState(false);
  const className = cn(
    "rounded-md px-1 font-medium",
    me?._id === userId ? "bg-primary text-primary-foreground" : "bg-primary/15"
  );
  if (plain) {
    return <span className={className}>@{name}</span>;
  }
  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger
        className={cn(
          className,
          "focus-visible:ring-ring/50 cursor-default outline-none focus-visible:ring-3"
        )}
        nativeButton={false}
        openOnHover
        render={<span />}
      >
        @{name}
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-72 overflow-hidden p-0"
        side="top"
      >
        <ProfileCard onOpen={() => setOpen(false)} userId={userId} />
      </PopoverContent>
    </Popover>
  );
}
