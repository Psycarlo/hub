import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { joinWords } from "@convex/shared/notifications";
import { cn } from "cn";
import type { OptimisticLocalStore } from "convex/browser";
import { useQuery } from "convex/react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AvatarStack } from "@/features/card/card-parts";
import { useMe, useUsers } from "@/hooks/use-users";
import { run } from "@/lib/actions";
import { convex } from "@/lib/convex";

interface Following {
  subscribed: boolean;
  people: Id<"users">[];
}

type Target = { cardId: Id<"cards"> } | { fileId: Id<"driveFiles"> };

/** The following as it is once the person subscribes or stops. */
function followingAfter(
  current: Following,
  me: Id<"users">,
  subscribed: boolean
): Following {
  const others = current.people.filter((userId) => userId !== me);
  return { people: subscribed ? [...others, me] : others, subscribed };
}

/** Shows the change in the activity and the inbox before the server confirms it. */
function optimistic(
  target: Target,
  me: Id<"users">,
  subscribed: boolean
): (store: OptimisticLocalStore) => void {
  return (store) => {
    if ("cardId" in target) {
      const current = store.getQuery(api.subscriptions.card, target);
      if (current) {
        store.setQuery(
          api.subscriptions.card,
          target,
          followingAfter(current, me, subscribed)
        );
      }
    } else {
      const current = store.getQuery(api.subscriptions.file, target);
      if (current) {
        store.setQuery(
          api.subscriptions.file,
          target,
          followingAfter(current, me, subscribed)
        );
      }
    }
    const inbox = store.getQuery(api.inbox.list, {});
    if (inbox) {
      store.setQuery(
        api.inbox.list,
        {},
        inbox.map((item) =>
          (item.kind === "card" &&
            "cardId" in target &&
            item.card._id === target.cardId) ||
          (item.kind === "file" &&
            "fileId" in target &&
            item.file._id === target.fileId)
            ? { ...item, following: subscribed }
            : item
        )
      );
    }
  };
}

function setSubscribed(target: Target, me: Id<"users">, subscribed: boolean) {
  const optimisticUpdate = optimistic(target, me, subscribed);
  run(
    "cardId" in target
      ? convex.mutation(
          api.subscriptions.setCard,
          { cardId: target.cardId, subscribed },
          { optimisticUpdate }
        )
      : convex.mutation(
          api.subscriptions.setFile,
          { fileId: target.fileId, subscribed },
          { optimisticUpdate }
        )
  );
}

/** Who's subscribed, as a stack of avatars that names them on hover. */
function Subscribers({
  people,
  surface,
}: {
  people: Id<"users">[];
  surface: "card" | "popover";
}) {
  const users = useUsers();
  if (people.length === 0) {
    return null;
  }
  const names = joinWords(
    people.map((userId) => users.get(userId)?.name ?? "Someone")
  );
  return (
    <Tooltip>
      <TooltipTrigger render={<span className="flex" />}>
        <AvatarStack people={people} surface={surface} />
        <span className="sr-only">Subscribed: {names}</span>
      </TooltipTrigger>
      <TooltipContent>Subscribed: {names}</TooltipContent>
    </Tooltip>
  );
}

function SubscribeControl({
  following,
  target,
  surface,
  className,
}: {
  following: Following | null | undefined;
  target: Target;
  surface: "card" | "popover";
  className?: string;
}) {
  const me = useMe();
  if (!following) {
    return null;
  }
  const { subscribed, people } = following;
  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <Button
        aria-pressed={subscribed}
        className="text-muted-foreground"
        onClick={() => setSubscribed(target, me._id, !subscribed)}
        size="xs"
        variant="ghost"
      >
        {subscribed ? "Unsubscribe" : "Subscribe"}
      </Button>
      <Subscribers people={people} surface={surface} />
    </div>
  );
}

/** Subscribes to the card's news or stops, Linear-style, beside who else follows it. */
export function CardSubscribe({
  cardId,
  className,
}: {
  cardId: Id<"cards">;
  className?: string;
}) {
  const following = useQuery(api.subscriptions.card, { cardId });
  return (
    <SubscribeControl
      className={className}
      following={following}
      surface="card"
      target={{ cardId }}
    />
  );
}

/** Subscribes to the file's comments or stops, beside who else follows it. */
export function FileSubscribe({
  fileId,
  className,
}: {
  fileId: Id<"driveFiles">;
  className?: string;
}) {
  const following = useQuery(api.subscriptions.file, { fileId });
  return (
    <SubscribeControl
      className={className}
      following={following}
      surface="popover"
      target={{ fileId }}
    />
  );
}
