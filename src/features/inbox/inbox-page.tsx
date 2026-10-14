import { api } from "@convex/_generated/api";
import type { CardNotification, EntryNotification } from "@convex/inbox";
import {
  notificationQuote,
  notificationWords,
} from "@convex/shared/notifications";
import { cn } from "cn";
import { format } from "date-fns";
import type { LucideIcon } from "lucide-react";
import {
  ArchiveIcon,
  AtSignIcon,
  BellOffIcon,
  CalendarClockIcon,
  CalendarIcon,
  CheckCheckIcon,
  CircleCheckIcon,
  InboxIcon,
  MailIcon,
  MailOpenIcon,
  MessageSquareIcon,
  PencilIcon,
  UserMinusIcon,
  UserPlusIcon,
} from "lucide-react";
import { useEffect } from "react";
import { toast } from "sonner";
import { Link, useLocation, useSearchParams } from "wouter";

import { IconButton } from "@/components/icon-button";
import { MentionText } from "@/components/mention-text";
import { ProjectAvatar } from "@/components/project-avatar";
import { TopBar } from "@/components/top-bar";
import { Empty, EmptyDescription, EmptyTitle } from "@/components/ui/empty";
import { FluidTooltip } from "@/components/ui/fluid-tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { UserAvatar } from "@/components/user-avatar";
import { PRIORITY_STYLES, STATUS_STYLES } from "@/features/card/card-fields";
import { PageIcon } from "@/features/docs/page-icon";
import { FileIcon } from "@/features/drive/file-icon";
import {
  notificationPath,
  notificationState,
} from "@/features/inbox/notification-path";
import { NotificationsButton } from "@/features/inbox/notifications-button";
import type { Inbox, InboxGroup, InboxItem } from "@/hooks/use-inbox";
import { useMe, useUsers } from "@/hooks/use-users";
import { run } from "@/lib/actions";
import { convex } from "@/lib/convex";
import { pageTitle } from "@/lib/docs";
import { payDay, statusLabel } from "@/lib/finance";
import type { UserId } from "@/lib/model";
import { cardKey } from "@/lib/model";

/** Shares the top-level path with short board links, so INBOX is a reserved code. */
export const INBOX_PATH = "/inbox";

/** Opens the inbox at a notification, which leads on to what it's about: where pushes go. */
const OPEN_PARAM = "open";

/** "now", "5m", "3h", "2d", then the date. */
function shortAgo(at: number): string {
  const minutes = Math.floor((Date.now() - at) / 60_000);
  if (minutes < 1) {
    return "now";
  }
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h`;
  }
  const days = Math.floor(hours / 24);
  return days < 7 ? `${days}d` : format(new Date(at), "MMM d");
}

/** Today here, as `YYYY-MM-DD`, which reminders count from. */
function today(): string {
  return format(new Date(), "yyyy-MM-dd");
}

interface NewsIcon {
  icon: LucideIcon;
  className?: string;
}

/** A card's news: why they heard, or for a change, what changed that matters most to them. */
function cardIcon(item: CardNotification, me: UserId): NewsIcon {
  switch (item.reason) {
    case "comment": {
      return { icon: MessageSquareIcon };
    }
    case "due": {
      return { icon: CalendarClockIcon };
    }
    case "overdue": {
      return { className: "text-destructive", icon: CalendarClockIcon };
    }
    case "change": {
      break;
    }
    default: {
      return { icon: AtSignIcon };
    }
  }
  const changes = item.changes ?? [];
  const mine = changes.find(
    (change) =>
      change.kind === "assignees" &&
      change.from.includes(me) !== change.to.includes(me)
  );
  if (mine?.kind === "assignees") {
    return { icon: mine.to.includes(me) ? UserPlusIcon : UserMinusIcon };
  }
  const [first] = changes;
  switch (first?.kind) {
    case "status": {
      return STATUS_STYLES[first.to];
    }
    case "priority": {
      return first.to ? PRIORITY_STYLES[first.to] : { icon: PencilIcon };
    }
    case "due": {
      return { icon: CalendarIcon };
    }
    case "assignees": {
      return { icon: UserPlusIcon };
    }
    default: {
      return { icon: PencilIcon };
    }
  }
}

/** The icon on the avatar's corner: what kind of news it is. */
function newsIcon(item: InboxItem, me: UserId): NewsIcon {
  switch (item.kind) {
    case "page": {
      return { icon: AtSignIcon };
    }
    case "file": {
      return {
        icon: item.reason === "comment" ? MessageSquareIcon : AtSignIcon,
      };
    }
    case "project": {
      return { icon: UserPlusIcon };
    }
    case "entry": {
      return item.due < today()
        ? { className: "text-destructive", icon: CalendarClockIcon }
        : { icon: CalendarClockIcon };
    }
    default: {
      return cardIcon(item, me);
    }
  }
}

/** Who did it, with what kind of news it is on the corner; a reminder shows its own icon. */
function Who({ item, me }: { item: InboxItem; me: UserId }) {
  const { icon: Icon, className } = newsIcon(item, me);
  if (!item.actorId) {
    return (
      <span className="bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-full">
        <Icon aria-hidden className={cn("size-4", className)} />
      </span>
    );
  }
  return (
    <span className="relative shrink-0">
      <UserAvatar aria-hidden userId={item.actorId} />
      <span className="bg-popover ring-background text-foreground absolute -right-1 -bottom-1 flex size-4 items-center justify-center rounded-full ring-2">
        <Icon aria-hidden className={cn("size-2.5", className)} />
      </span>
    </span>
  );
}

/** What it's about: the card by its key and title, or the page, file or project by its icon and name. */
function Subject({ item, read }: { item: InboxItem; read: boolean }) {
  const title = cn("truncate", !read && "text-foreground font-medium");
  switch (item.kind) {
    case "file": {
      return (
        <span className="flex min-w-0 items-center gap-2">
          <FileIcon file={item.file} size="sm" />
          <span className={title}>{item.file.name}</span>
        </span>
      );
    }
    case "page": {
      return (
        <span className="flex min-w-0 items-center gap-2">
          <PageIcon className="text-muted-foreground" page={item.page} />
          <span className={title}>{pageTitle(item.page)}</span>
        </span>
      );
    }
    case "project": {
      return (
        <span className="flex min-w-0 items-center gap-2">
          <ProjectAvatar project={item.project} />
          <span className={title}>{item.project.title}</span>
        </span>
      );
    }
    case "entry": {
      return (
        <span className="flex min-w-0 items-baseline gap-2">
          <span className={title}>{item.entry.name}</span>
          <span className="text-muted-foreground truncate text-xs">
            {item.account.title}
          </span>
        </span>
      );
    }
    default: {
      return (
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
            {cardKey(item.board, item.card)}
          </span>
          <span className={title}>{item.card.title || "Untitled"}</span>
        </span>
      );
    }
  }
}

/** "Ana moved it to Done", "Ana mentioned you: …", or "Due tomorrow". */
function Said({ item, me }: { item: InboxItem; me: UserId }) {
  const users = useUsers();
  const name = (userId: string) => users.get(userId)?.name ?? "Someone";
  const words = notificationWords(item, me, name, today());
  const quote = notificationQuote(item);
  return (
    <span className="text-muted-foreground truncate text-sm">
      {item.actorId ? `${name(item.actorId)} ${words}` : words}
      {quote && (
        <>
          : <MentionText content={quote} plain />
        </>
      )}
    </span>
  );
}

/** Subscribes to the card, file or account's bills again, or stops. */
function follow(item: InboxItem, subscribed: boolean): Promise<unknown> | null {
  if (item.kind === "card") {
    return convex.mutation(api.subscriptions.setCard, {
      cardId: item.card._id,
      subscribed,
    });
  }
  if (item.kind === "file") {
    return convex.mutation(api.subscriptions.setFile, {
      fileId: item.file._id,
      subscribed,
    });
  }
  if (item.kind === "entry") {
    return convex.mutation(api.subscriptions.setAccount, {
      accountId: item.account._id,
      subscribed,
    });
  }
  return null;
}

/** What unsubscribing means for the news it's about. */
function unsubscribedText(item: InboxItem): string {
  return item.kind === "entry"
    ? `No more reminders of bills in ${item.account.title}.`
    : "You won’t hear about it unless someone mentions you.";
}

/** How wide the time is, so the buttons that show over it on hover fit. */
const TIME_WIDTHS = ["w-16", "w-16", "w-16", "w-24", "w-32"];

/**
 * Ticks the entry paid or received, today or on its own day once that's
 * past, which takes its reminders away; undone, it waits again.
 */
function markPaid(item: EntryNotification): void {
  const { entry } = item;
  const settle = (paidOn: string | null) =>
    run(
      convex.mutation(
        api.finance.updateEntry,
        { entryId: entry._id, paidOn },
        {
          optimisticUpdate: (store) => {
            const current = store.getQuery(api.inbox.list, {});
            if (current && paidOn) {
              store.setQuery(
                api.inbox.list,
                {},
                current.filter(
                  (other) =>
                    !(other.kind === "entry" && other.entry._id === entry._id)
                )
              );
            }
          },
        }
      )
    );
  settle(payDay(entry, today()));
  toast(`Marked ${statusLabel(entry.kind, true).toLowerCase()}`, {
    action: { label: "Undo", onClick: () => settle(null) },
    description: entry.name,
  });
}

function Row({
  group,
  inbox,
  me,
}: {
  group: InboxGroup;
  inbox: Inbox;
  me: UserId;
}) {
  const { latest, items, read } = group;
  const date = new Date(latest._creationTime);
  const canUnsubscribe =
    (latest.kind === "card" ||
      latest.kind === "file" ||
      latest.kind === "entry") &&
    latest.following;
  const payable = latest.kind === "entry" && latest.editable ? latest : null;
  // Read and archive always, then unsubscribe and paid where they fit.
  const buttons = 2 + Number(canUnsubscribe) + Number(payable !== null);

  const archive = () => {
    inbox.setArchived(items, true);
    toast("Archived", {
      action: { label: "Undo", onClick: () => inbox.setArchived(items, false) },
    });
  };

  const unsubscribe = () => {
    const done = follow(latest, false);
    if (!done) {
      return;
    }
    inbox.setArchived(items, true);
    run(done);
    toast("Unsubscribed", {
      action: {
        label: "Undo",
        onClick: () => {
          const undone = follow(latest, true);
          if (undone) {
            run(undone);
          }
          inbox.setArchived(items, false);
        },
      },
      description: unsubscribedText(latest),
    });
  };

  return (
    <li className="group/row relative">
      <Link
        className={cn(
          "hover:bg-foreground/5 focus-visible:ring-ring/50 flex items-center gap-3 rounded-xl py-2.5 pr-3 pl-2 transition-colors duration-150 outline-none focus-visible:ring-3",
          read && "text-muted-foreground"
        )}
        href={notificationPath(latest)}
        onClick={() => inbox.setRead(items, true)}
        state={notificationState(latest)}
      >
        <span
          aria-hidden
          className={cn(
            "size-1.5 shrink-0 rounded-full transition-colors duration-150",
            read ? "bg-transparent" : "bg-primary"
          )}
        />
        <Who item={latest} me={me} />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <Subject item={latest} read={read} />
          <Said item={latest} me={me} />
        </span>
        {!read && <span className="sr-only">Unread</span>}
        <time
          className={cn(
            "text-muted-foreground shrink-0 text-right text-xs tabular-nums group-focus-within/row:invisible group-hover/row:invisible pointer-coarse:invisible",
            TIME_WIDTHS[buttons]
          )}
          dateTime={date.toISOString()}
          title={format(date, "PPpp")}
        >
          {shortAgo(latest._creationTime)}
        </time>
      </Link>
      <div className="absolute top-1/2 right-2 flex -translate-y-1/2 items-center opacity-0 transition-opacity duration-150 group-focus-within/row:opacity-100 group-hover/row:opacity-100 pointer-coarse:opacity-100">
        <FluidTooltip.Group>
          <IconButton
            label={read ? "Mark as unread" : "Mark as read"}
            onClick={() => inbox.setRead(items, !read)}
          >
            {read ? <MailIcon /> : <MailOpenIcon />}
          </IconButton>
          {canUnsubscribe && (
            <IconButton
              label={
                latest.kind === "entry"
                  ? `Stop reminders for ${latest.account.title}`
                  : "Unsubscribe"
              }
              onClick={unsubscribe}
            >
              <BellOffIcon />
            </IconButton>
          )}
          {payable && (
            <IconButton
              label={`Mark ${statusLabel(payable.entry.kind, true).toLowerCase()}`}
              onClick={() => markPaid(payable)}
            >
              <CircleCheckIcon />
            </IconButton>
          )}
          <IconButton label="Archive" onClick={archive}>
            <ArchiveIcon />
          </IconButton>
        </FluidTooltip.Group>
      </div>
    </li>
  );
}

function InboxList({ inbox, me }: { inbox: Inbox; me: UserId }) {
  if (inbox.groups.length > 0) {
    return (
      <ol aria-label="Notifications" className="flex flex-col gap-0.5">
        {inbox.groups.map((group) => (
          <Row group={group} inbox={inbox} key={group.subject} me={me} />
        ))}
      </ol>
    );
  }
  if (!inbox.loaded) {
    return (
      <div aria-busy className="flex flex-col gap-2">
        <Skeleton className="h-14 rounded-xl" />
        <Skeleton className="h-14 rounded-xl" />
        <Skeleton className="h-14 rounded-xl" />
      </div>
    );
  }
  return (
    <Empty>
      <InboxIcon aria-hidden className="text-muted-foreground size-8" />
      <EmptyTitle>You’re all caught up</EmptyTitle>
      <EmptyDescription>
        Mentions, assignments, reminders and news about what you subscribe to
        show up here.
      </EmptyDescription>
    </Empty>
  );
}

/**
 * A push leads to `/inbox?open=<id>`: once the inbox loads, this reads the
 * notification and goes on to what it's about. One that's gone leaves the
 * inbox showing.
 */
function useOpenParam(inbox: Inbox): void {
  const [params] = useSearchParams();
  const [, navigate] = useLocation();
  const open = params.get(OPEN_PARAM);
  useEffect(() => {
    if (!(open && inbox.loaded)) {
      return;
    }
    const group = inbox.groups.find((candidate) =>
      candidate.items.some((item) => item._id === open)
    );
    if (!group) {
      navigate(INBOX_PATH, { replace: true });
      return;
    }
    inbox.setRead(group.items, true);
    navigate(notificationPath(group.latest), {
      replace: true,
      state: notificationState(group.latest),
    });
  }, [open, inbox, navigate]);
}

export function InboxPage({ inbox }: { inbox: Inbox }) {
  const me = useMe();
  useOpenParam(inbox);
  const unread = inbox.groups
    .filter((group) => !group.read)
    .flatMap((group) => group.items);
  return (
    <>
      <TopBar
        crumbs={[
          {
            icon: (
              <InboxIcon className="text-muted-foreground size-4 shrink-0" />
            ),
            label: "Inbox",
          },
        ]}
      >
        <FluidTooltip.Group>
          <NotificationsButton />
          {unread.length > 0 && (
            <IconButton
              label="Mark all as read"
              onClick={() => inbox.setRead(unread, true)}
            >
              <CheckCheckIcon />
            </IconButton>
          )}
        </FluidTooltip.Group>
      </TopBar>
      <main className="flex grow flex-col px-4 pt-2 pb-8 sm:px-6">
        <div className="mx-auto flex w-full max-w-3xl grow flex-col">
          <InboxList inbox={inbox} me={me._id} />
        </div>
      </main>
    </>
  );
}
