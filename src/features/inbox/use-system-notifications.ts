import { notificationMessage } from "@convex/shared/notifications";
import { format } from "date-fns";
import { useEffect, useEffectEvent, useRef } from "react";

import { notificationPath } from "@/features/inbox/notification-path";
import type { Inbox } from "@/hooks/use-inbox";
import { subjectOf } from "@/hooks/use-inbox";
import { useUsers } from "@/hooks/use-users";
import { pushesHere, showNotification, useNotifyState } from "@/lib/notify";

/** At most this many show at once, when a lot arrives together. */
const MAX_AT_ONCE = 3;

/** Keeps the installed app's icon showing how many rows are unread. */
export function useAppBadge(unread: number): void {
  useEffect(() => {
    if (!("setAppBadge" in navigator)) {
      return;
    }
    const update = async () => {
      try {
        await (unread > 0
          ? navigator.setAppBadge(unread)
          : navigator.clearAppBadge());
      } catch {
        // Badges are a nicety; some browsers refuse them outside installed apps.
      }
    };
    update();
  }, [unread]);
}

/**
 * Shows news as system notifications while the hub is open but out of
 * sight, on devices nothing is pushed to. What was there on opening the hub
 * counts as seen.
 */
export function useSystemNotifications(inbox: Inbox, userId: string): void {
  const state = useNotifyState(userId);
  const users = useUsers();
  const seen = useRef<Set<string> | null>(null);
  const { items, loaded } = inbox;
  const unread = items
    .filter((item) => !item.read)
    .map((item) => item._id)
    .join(",");

  const show = useEffectEvent((ids: string[]) => {
    const known = seen.current;
    seen.current = new Set([...(known ?? []), ...ids]);
    const away = document.visibilityState === "hidden" || !document.hasFocus();
    if (!known || state !== "on" || pushesHere(userId) || !away) {
      return;
    }
    const name = (id: string) => users.get(id)?.name ?? "Someone";
    const today = format(new Date(), "yyyy-MM-dd");
    const fresh = items.filter(
      (item) => ids.includes(item._id) && !known.has(item._id)
    );
    for (const item of fresh.slice(0, MAX_AT_ONCE)) {
      showNotification({
        ...notificationMessage(item, userId, name, today),
        path: notificationPath(item),
        tag: subjectOf(item),
      });
    }
  });

  useEffect(() => {
    if (loaded) {
      show(unread ? unread.split(",") : []);
    }
  }, [unread, loaded]);
}
