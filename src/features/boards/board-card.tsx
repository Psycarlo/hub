import type { BoardProgress } from "@convex/boards";
import { cn } from "cn";
import { Link } from "wouter";

import { AvatarGroup, AvatarGroupCount } from "@/components/ui/avatar";
import { FluidTooltip } from "@/components/ui/fluid-tooltip";
import { UserAvatar } from "@/components/user-avatar";
import type { Board, Status } from "@/lib/model";
import { sprintRemaining, statusLabel } from "@/lib/model";
import { SWATCH_COLORS } from "@/lib/palette";
import { plural } from "@/lib/utils";

const VISIBLE_MEMBERS = 5;

export const CARD_SURFACE =
  "bg-card shadow-surface hover:shadow-raised focus-visible:ring-ring/50 flex min-h-36 flex-col gap-2 rounded-2xl p-5 transition-[box-shadow,scale] duration-150 ease-out outline-none focus-visible:ring-3 active:scale-[0.99]";

export function MemberAvatars({
  members,
  className,
}: {
  members: string[];
  className?: string;
}) {
  const hidden = members.length - VISIBLE_MEMBERS;
  return (
    <AvatarGroup className={className}>
      {members.slice(0, VISIBLE_MEMBERS).map((member) => (
        <UserAvatar key={member} size="sm" userId={member} />
      ))}
      {hidden > 0 && <AvatarGroupCount>+{hidden}</AvatarGroupCount>}
    </AvatarGroup>
  );
}

type SprintProgress = NonNullable<BoardProgress["sprint"]>;

const NOT_STARTED = "bg-foreground/12";

/**
 * Finished work first, so the bar fills from the left as the sprint goes.
 * Canceled cards and duplicates were never going to be done, so stay out.
 */
const BAR_PARTS: { status: Status; className: string }[] = [
  { className: SWATCH_COLORS.blue, status: "done" },
  { className: SWATCH_COLORS.green, status: "review" },
  { className: SWATCH_COLORS.yellow, status: "progress" },
  { className: NOT_STARTED, status: "todo" },
  { className: NOT_STARTED, status: "backlog" },
  { className: NOT_STARTED, status: "triage" },
];

/** The sprint's cards as one bar split by status. */
function SprintBar({ sprint }: { sprint: SprintProgress }) {
  const parts = BAR_PARTS.filter(({ status }) => sprint[status] > 0);
  if (parts.length === 0) {
    return <div className="bg-foreground/8 h-1.5 rounded-full" />;
  }
  return (
    <div className="flex h-1.5 gap-0.5 overflow-hidden rounded-full">
      <FluidTooltip.Group>
        {parts.map(({ status, className }) => (
          <FluidTooltip.Root key={status}>
            <FluidTooltip.Trigger>
              <span
                className={cn(
                  "h-full first:rounded-l-full last:rounded-r-full",
                  className
                )}
                style={{ flexGrow: sprint[status] }}
              />
            </FluidTooltip.Trigger>
            <FluidTooltip.Content>
              {statusLabel(status)}{" "}
              <span className="tabular-nums">{sprint[status]}</span>
            </FluidTooltip.Content>
          </FluidTooltip.Root>
        ))}
      </FluidTooltip.Group>
    </div>
  );
}

/** One line on where the board stands: the sprint under way, or what's open. */
function progressLine(progress: BoardProgress): string {
  const { sprint, open } = progress;
  if (!sprint) {
    return open === 0 ? "Nothing open" : plural(open, "open card");
  }
  const total = BAR_PARTS.reduce((sum, { status }) => sum + sprint[status], 0);
  const remaining = sprint.end ? ` · ${sprintRemaining(sprint.end)}` : "";
  return total === 0
    ? `${sprint.title}${remaining}`
    : `${sprint.title} · ${sprint.done}/${total} done${remaining}`;
}

export function BoardCard({
  board,
  href,
  members,
  progress,
}: {
  board: Board;
  href: string;
  /** The people of the board's project. */
  members: string[];
  /** Where its cards stand, once loaded. */
  progress?: BoardProgress;
}) {
  return (
    <Link className={CARD_SURFACE} href={href}>
      <div className="flex items-start justify-between gap-3">
        <h3 className="min-w-0 leading-snug font-medium">{board.title}</h3>
        <span className="bg-muted text-muted-foreground shrink-0 rounded-md px-1.5 py-0.5 font-mono text-xs">
          {board.code}
        </span>
      </div>
      {board.description && (
        <p className="text-muted-foreground line-clamp-2 text-sm">
          {board.description}
        </p>
      )}
      <div className="mt-auto flex flex-col gap-3 pt-2">
        {progress?.sprint && <SprintBar sprint={progress.sprint} />}
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground min-w-0 truncate text-xs tabular-nums">
            {progress && progressLine(progress)}
          </span>
          <MemberAvatars className="shrink-0" members={members} />
        </div>
      </div>
    </Link>
  );
}
