import { cn } from "cn";
import { format, parseISO } from "date-fns";
import type { LucideIcon } from "lucide-react";
import {
  CalendarIcon,
  IterationCwIcon,
  PaperclipIcon,
  PencilIcon,
  TagIcon,
  TextAlignStartIcon,
  UserMinusIcon,
  UserPlusIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { Fragment, useId } from "react";

import { UserAvatar } from "@/components/user-avatar";
import { useBoard } from "@/features/board/board-context";
import { PRIORITY_STYLES, STATUS_STYLES } from "@/features/card/card-fields";
import { LabelChip, When } from "@/features/card/card-parts";
import {
  CommentThread,
  Composer,
  useReadMentions,
} from "@/features/card/comments";
import type { CardEvent } from "@/hooks/use-card-history";
import { useCardHistory } from "@/hooks/use-card-history";
import type { Comment } from "@/hooks/use-comments";
import { useComments } from "@/hooks/use-comments";
import { useUser } from "@/hooks/use-users";
import type { BoardContent, BoardLabel, Card } from "@/lib/model";
import { BURST_MS, priorityLabel, statusLabel } from "@/lib/model";
import { plural } from "@/lib/utils";

/** Files named one by one; past this many, they're counted instead. */
const NAMED_FILES = 3;

type Change = CardEvent["change"];
type ChangeOf<Kind extends Change["kind"]> = Extract<Change, { kind: Kind }>;

/** Someone's burst of changes, told as one, perhaps starting with the card's creation. */
interface Burst {
  actorId: string;
  /** When the last of them was made. */
  at: number;
  created: boolean;
  events: CardEvent[];
}

type Entry =
  | ({ kind: "burst" } & Burst)
  | { kind: "thread"; at: number; comment: Comment; replies: Comment[] };

/** What a change says happened, after the name of who made it. */
interface Told {
  marker: ReactNode;
  text: ReactNode;
}

function Value({ children }: { children: ReactNode }) {
  return <span className="text-foreground font-medium">{children}</span>;
}

function Name({ userId }: { userId: string }) {
  const { name } = useUser(userId);
  return <Value>{name}</Value>;
}

/** "A", "A and B", or "A, B and C". */
function joined(items: ReactNode[]): ReactNode {
  // The items never reorder, so their index is a stable key.
  return items.map((item, index) => (
    // oxlint-disable-next-line react/no-array-index-key
    <Fragment key={index}>
      {index > 0 && (index === items.length - 1 ? " and " : ", ")}
      {item}
    </Fragment>
  ));
}

function day(due: string): string {
  return format(parseISO(due), "MMM d, yyyy");
}

/** Covers the timeline's line where an entry sits on it. */
function Marker({ children }: { children: ReactNode }) {
  return (
    <span className="bg-popover relative z-10 flex size-6 shrink-0 items-center justify-center">
      {children}
    </span>
  );
}

function MarkerIcon({
  icon: Icon,
  className,
}: {
  icon: LucideIcon;
  className?: string;
}) {
  return (
    <Icon
      aria-hidden
      className={cn("text-muted-foreground size-4", className)}
    />
  );
}

function Row({
  at,
  marker,
  children,
}: {
  at: number;
  marker: ReactNode;
  children: ReactNode;
}) {
  return (
    <li className="flex items-start gap-3">
      <Marker>{marker}</Marker>
      <p className="text-muted-foreground min-w-0 flex-1 py-0.5 text-sm wrap-break-word">
        {children}
      </p>
      <When at={at} className="py-1" />
    </li>
  );
}

function priorityChange({ from, to }: ChangeOf<"priority">): Told {
  const marker = to ? (
    <MarkerIcon {...PRIORITY_STYLES[to]} />
  ) : (
    from && <MarkerIcon icon={PRIORITY_STYLES[from].icon} />
  );
  if (!to) {
    return { marker, text: "removed the priority" };
  }
  if (!from) {
    return {
      marker,
      text: (
        <>
          set the priority to <Value>{priorityLabel(to)}</Value>
        </>
      ),
    };
  }
  return {
    marker,
    text: (
      <>
        changed the priority from <Value>{priorityLabel(from)}</Value> to{" "}
        <Value>{priorityLabel(to)}</Value>
      </>
    ),
  };
}

function dueChange({ from, to }: ChangeOf<"due">): Told {
  const marker = <MarkerIcon icon={CalendarIcon} />;
  if (!to) {
    return { marker, text: "removed the due date" };
  }
  if (!from) {
    return {
      marker,
      text: (
        <>
          set the due date to <Value>{day(to)}</Value>
        </>
      ),
    };
  }
  return {
    marker,
    text: (
      <>
        changed the due date from <Value>{day(from)}</Value> to{" "}
        <Value>{day(to)}</Value>
      </>
    ),
  };
}

function assigneesChange(
  { from, to }: ChangeOf<"assignees">,
  actorId: string
): Told {
  const added = to.filter((userId) => !from.includes(userId));
  const removed = from.filter((userId) => !to.includes(userId));
  const person = (userId: string) =>
    userId === actorId ? "themselves" : <Name userId={userId} />;
  const parts = [
    added.length > 0 && <>assigned {joined(added.map(person))}</>,
    removed.length > 0 && <>unassigned {joined(removed.map(person))}</>,
  ].filter(Boolean);
  return {
    marker: (
      <MarkerIcon icon={added.length > 0 ? UserPlusIcon : UserMinusIcon} />
    ),
    text: joined(parts),
  };
}

function labelsChange(
  { from, to }: ChangeOf<"labels">,
  labels: BoardLabel[]
): Told {
  const had = new Set(from.map(({ id }) => id));
  const has = new Set(to.map(({ id }) => id));
  const added = to.filter(({ id }) => !had.has(id));
  const removed = from.filter(({ id }) => !has.has(id));
  // As the label is named now, or as it was before being deleted.
  const chip = (label: BoardLabel) => (
    <Value>
      <LabelChip label={labels.find(({ id }) => id === label.id) ?? label} />
    </Value>
  );
  const parts = [
    added.length > 0 && (
      <>
        added {added.length === 1 ? "label" : "labels"}{" "}
        {joined(added.map(chip))}
      </>
    ),
    removed.length > 0 && (
      <>
        removed {removed.length === 1 ? "label" : "labels"}{" "}
        {joined(removed.map(chip))}
      </>
    ),
  ].filter(Boolean);
  return { marker: <MarkerIcon icon={TagIcon} />, text: joined(parts) };
}

function sprintChange(
  { from, to }: ChangeOf<"sprint">,
  sprints: BoardContent["sprints"]
): Told {
  // As the sprint is named now, or as it was before being deleted.
  const title = (sprint: NonNullable<typeof to>) => (
    <Value>
      {sprints.find(({ _id }) => _id === sprint.id)?.title ?? sprint.title}
    </Value>
  );
  const marker = <MarkerIcon icon={IterationCwIcon} />;
  if (!to) {
    return { marker, text: <>removed it from {from && title(from)}</> };
  }
  if (!from) {
    return { marker, text: <>added it to {title(to)}</> };
  }
  return {
    marker,
    text: (
      <>
        moved it from {title(from)} to {title(to)}
      </>
    ),
  };
}

function fileName(name: string) {
  return <Value>{name}</Value>;
}

function filesChange({ names, removed }: ChangeOf<"attachments">): Told {
  const files =
    names.length > NAMED_FILES ? (
      <Value>{plural(names.length, "file")}</Value>
    ) : (
      joined(names.map(fileName))
    );
  return {
    marker: <MarkerIcon icon={PaperclipIcon} />,
    text: (
      <>
        {removed ? "deleted" : "attached"} {files}
      </>
    ),
  };
}

function describe(
  change: Change,
  actorId: string,
  content: BoardContent
): Told {
  switch (change.kind) {
    case "title": {
      return {
        marker: <MarkerIcon icon={PencilIcon} />,
        text: (
          <>
            changed the title to <Value>{change.to}</Value>
          </>
        ),
      };
    }
    case "description": {
      return {
        marker: <MarkerIcon icon={TextAlignStartIcon} />,
        text: "updated the description",
      };
    }
    case "status": {
      return {
        marker: <MarkerIcon {...STATUS_STYLES[change.to]} />,
        text: (
          <>
            moved it from <Value>{statusLabel(change.from)}</Value> to{" "}
            <Value>{statusLabel(change.to)}</Value>
          </>
        ),
      };
    }
    case "priority": {
      return priorityChange(change);
    }
    case "due": {
      return dueChange(change);
    }
    case "assignees": {
      return assigneesChange(change, actorId);
    }
    case "labels": {
      return labelsChange(change, content.labels);
    }
    case "sprint": {
      return sprintChange(change, content.sprints);
    }
    default: {
      return filesChange(change);
    }
  }
}

/** A lone change shows its own marker; a burst of them, who made it. */
function BurstEntry({ actorId, at, created, events }: Burst) {
  const { content } = useBoard();
  const told = events.map((event) =>
    describe(event.change, event.actorId, content)
  );
  const [only] = told;
  const marker =
    !created && told.length === 1 && only ? (
      only.marker
    ) : (
      <UserAvatar aria-hidden size="xs" userId={actorId} />
    );
  return (
    <Row at={at} marker={marker}>
      <Name userId={actorId} />{" "}
      {joined([
        ...(created ? ["created the card"] : []),
        ...told.map(({ text }) => text),
      ])}
    </Row>
  );
}

/**
 * The card's creation, changes and comments, oldest first. Someone's burst of
 * changes is one entry, as the server folds them in `recordChange`.
 */
function entriesOf(
  card: Card,
  history: CardEvent[],
  comments: Comment[]
): Entry[] {
  const replies = new Map<string, Comment[]>();
  for (const comment of comments) {
    if (comment.parentId) {
      const thread = replies.get(comment.parentId);
      if (thread) {
        thread.push(comment);
      } else {
        replies.set(comment.parentId, [comment]);
      }
    }
  }
  const moments: Entry[] = [
    {
      actorId: card.createdBy,
      at: card._creationTime,
      created: true,
      events: [],
      kind: "burst",
    },
    ...history.map((event): Entry => ({
      actorId: event.actorId,
      at: event.at,
      created: false,
      events: [event],
      kind: "burst",
    })),
    ...comments
      .filter((comment) => !comment.parentId)
      .map((comment): Entry => ({
        at: comment._creationTime,
        comment,
        kind: "thread",
        replies: replies.get(comment._id) ?? [],
      })),
  ];
  const entries: Entry[] = [];
  for (const moment of moments.toSorted((a, b) => a.at - b.at)) {
    const last = entries.at(-1);
    if (
      moment.kind === "burst" &&
      last?.kind === "burst" &&
      last.actorId === moment.actorId &&
      moment.at - last.at <= BURST_MS
    ) {
      last.at = moment.at;
      last.events.push(...moment.events);
    } else {
      entries.push(moment);
    }
  }
  return entries;
}

/** What's happened to the card, with its comments, and where to add one. */
export function CardActivity({
  card,
  className,
}: {
  card: Card;
  className?: string;
}) {
  const id = useId();
  const { canEdit } = useBoard();
  const comments = useComments(card);
  const history = useCardHistory(card);
  useReadMentions(card);
  const entries = entriesOf(card, history, comments);

  return (
    <section
      aria-labelledby={id}
      className={cn("flex flex-col gap-4", className)}
    >
      <h3 className="font-medium" id={id}>
        Activity
      </h3>
      <ol className="before:bg-border relative flex flex-col gap-4 before:absolute before:top-3 before:bottom-3 before:left-3 before:w-px">
        {entries.map((entry) =>
          entry.kind === "burst" ? (
            <BurstEntry
              {...entry}
              key={entry.created ? "created" : entry.events[0]?._id}
            />
          ) : (
            // Sits over the timeline's line, like the markers.
            <li className="relative z-10" key={entry.comment._id}>
              <CommentThread
                card={card}
                comment={entry.comment}
                replies={entry.replies}
              />
            </li>
          )
        )}
      </ol>
      {canEdit && <Composer card={card} />}
    </section>
  );
}
