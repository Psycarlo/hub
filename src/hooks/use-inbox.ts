import { api } from "@convex/_generated/api";
import type { InboxItem } from "@convex/inbox";
import { useQuery } from "convex/react";
import { useEffect, useRef } from "react";

import { run } from "@/lib/actions";
import { convex } from "@/lib/convex";
import { playSound } from "@/lib/sounds";

export type { InboxItem } from "@convex/inbox";

/** A card, page, file or project's notifications, which the inbox shows as one row. */
export interface InboxGroup {
  /** What they're about, as `card:<id>` and the like. */
  subject: string;
  /** The newest, which the row shows. */
  latest: InboxItem;
  /** Newest first. */
  items: InboxItem[];
  /** Whether every one of them is read. */
  read: boolean;
}

export interface Inbox {
  items: InboxItem[];
  groups: InboxGroup[];
  /** Rows with something unread. */
  unread: number;
  loaded: boolean;
  setRead: (items: InboxItem[], read: boolean) => void;
  /** Archives them, or brings them back as they were. */
  setArchived: (items: InboxItem[], archived: boolean) => void;
}

const NONE: InboxItem[] = [];

function ids(items: InboxItem[]) {
  return items.map((item) => item._id);
}

/** What the notification is about, one key per card, page, file or project. */
export function subjectOf(item: InboxItem): string {
  switch (item.kind) {
    case "card": {
      return `card:${item.card._id}`;
    }
    case "page": {
      return `page:${item.page._id}`;
    }
    case "file": {
      return `file:${item.file._id}`;
    }
    default: {
      return `project:${item.project._id}`;
    }
  }
}

/** One group per subject, in the order of their newest notification. */
function groupsOf(items: InboxItem[]): InboxGroup[] {
  const groups = new Map<string, InboxGroup>();
  for (const item of items) {
    const subject = subjectOf(item);
    const group = groups.get(subject);
    if (group) {
      group.items.push(item);
      group.read &&= item.read;
    } else {
      groups.set(subject, {
        items: [item],
        latest: item,
        read: item.read,
        subject,
      });
    }
  }
  return [...groups.values()];
}

/** Marks notifications read or unread, at once and then on the server. */
function setRead(changed: InboxItem[], read: boolean): void {
  const targets = changed.filter((item) => item.read !== read);
  if (targets.length === 0) {
    return;
  }
  const wanted = new Set(ids(targets));
  run(
    convex.mutation(
      api.inbox.setRead,
      { ids: [...wanted], read },
      {
        optimisticUpdate: (store) => {
          const current = store.getQuery(api.inbox.list, {});
          if (current) {
            store.setQuery(
              api.inbox.list,
              {},
              current.map((item) =>
                wanted.has(item._id) ? { ...item, read } : item
              )
            );
          }
        },
      }
    )
  );
}

/**
 * Takes notifications out of the inbox, at once and then on the server, or
 * puts them back read or unread as they were when they went.
 */
function setArchived(changed: InboxItem[], archived: boolean): void {
  if (changed.length === 0) {
    return;
  }
  const touched = new Set(ids(changed));
  run(
    convex.mutation(
      api.inbox.setArchived,
      {
        archived,
        ids: [...touched],
        unread: ids(changed.filter((item) => !item.read)),
      },
      {
        optimisticUpdate: (store) => {
          const current = store.getQuery(api.inbox.list, {});
          if (!current) {
            return;
          }
          const rest = current.filter((item) => !touched.has(item._id));
          store.setQuery(
            api.inbox.list,
            {},
            archived
              ? rest
              : [...rest, ...changed].toSorted(
                  (a, b) => b._creationTime - a._creationTime
                )
          );
        },
      }
    )
  );
}

/** The signed-in person's notifications, newest first, and grouped by what they're about. */
export function useInbox(): Inbox {
  const items = useQuery(api.inbox.list);
  const list = items ?? NONE;
  const groups = groupsOf(list);
  return {
    groups,
    items: list,
    loaded: items !== undefined,
    setArchived,
    setRead,
    unread: groups.filter((group) => !group.read).length,
  };
}

/** Pings when news arrives while the app is open; not for what's already there. */
export function useArrivalPing({ items, loaded }: Inbox): void {
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!loaded) {
      return;
    }
    const before = seen.current;
    if (before && items.some((item) => !(item.read || before.has(item._id)))) {
      playSound("ping");
    }
    seen.current = new Set(ids(items));
  }, [items, loaded]);
}
