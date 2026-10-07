import { api } from "@convex/_generated/api";
import type { InboxItem } from "@convex/inbox";
import { useQuery } from "convex/react";

import { run } from "@/lib/actions";
import { convex } from "@/lib/convex";

export type { InboxItem } from "@convex/inbox";

export interface Inbox {
  items: InboxItem[];
  unread: number;
  loaded: boolean;
  setRead: (items: InboxItem[], read: boolean) => void;
  archive: (items: InboxItem[]) => void;
}

const NONE: InboxItem[] = [];

function ids(items: InboxItem[]) {
  return items.map((item) => item._id);
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

/** Takes notifications out of the inbox, at once and then on the server. */
function archive(archived: InboxItem[]): void {
  const gone = new Set(ids(archived));
  run(
    convex.mutation(
      api.inbox.archive,
      { ids: [...gone] },
      {
        optimisticUpdate: (store) => {
          const current = store.getQuery(api.inbox.list, {});
          if (current) {
            store.setQuery(
              api.inbox.list,
              {},
              current.filter((item) => !gone.has(item._id))
            );
          }
        },
      }
    )
  );
}

/** Mentions of the signed-in person in card comments, newest first. */
export function useInbox(): Inbox {
  const items = useQuery(api.inbox.list);
  const list = items ?? NONE;
  return {
    archive,
    items: list,
    loaded: items !== undefined,
    setRead,
    unread: list.filter((item) => !item.read).length,
  };
}
