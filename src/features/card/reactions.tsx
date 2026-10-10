import type { Id } from "@convex/_generated/dataModel";
import { cn } from "cn";
import { SmilePlusIcon } from "lucide-react";
import type { ComponentProps } from "react";

import { EmojiPicker } from "@/components/emoji-picker";
import { IconButton } from "@/components/icon-button";
import { FluidTooltip } from "@/components/ui/fluid-tooltip";
import { useBoard } from "@/features/board/board-context";
import type { Reaction } from "@/hooks/use-reactions";
import { useReactions } from "@/hooks/use-reactions";
import type { User } from "@/hooks/use-users";
import { useUsers } from "@/hooks/use-users";
import { setReaction } from "@/lib/actions";
import type { Card, UserId } from "@/lib/model";

const NAMES = new Intl.ListFormat("en", { style: "long", type: "conjunction" });

const PILL =
  "flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium tabular-nums transition-[background-color,box-shadow,scale,opacity] duration-150 ease-out outline-none focus-visible:ring-3 focus-visible:ring-ring/50 starting:scale-90 starting:opacity-0";

/** Who reacted, you first. */
function who(reaction: Reaction, me: UserId, users: Map<string, User>) {
  const others = reaction.users
    .filter((user) => user !== me)
    .map((user) => users.get(user)?.name ?? "Someone");
  return NAMES.format(
    reaction.users.includes(me) ? ["You", ...others] : others
  );
}

function ReactionPill({
  card,
  reaction,
  users,
}: {
  card: Card;
  reaction: Reaction;
  users: Map<string, User>;
}) {
  const { canEdit, me } = useBoard();
  const mine = reaction.users.includes(me);
  const names = who(reaction, me, users);
  return (
    <FluidTooltip.Root>
      <FluidTooltip.Trigger keepOpenOnClick>
        <button
          aria-disabled={!canEdit}
          aria-label={`${names} reacted with ${reaction.emoji}`}
          aria-pressed={mine}
          className={cn(
            PILL,
            mine
              ? "bg-primary/10 text-primary ring-primary/30 ring-1 ring-inset"
              : "bg-foreground/5",
            canEdit
              ? [
                  "active:scale-[0.96]",
                  mine ? "hover:bg-primary/15" : "hover:bg-foreground/10",
                ]
              : "cursor-default"
          )}
          onClick={() => {
            if (canEdit) {
              setReaction(card, me, {
                commentId: reaction.commentId,
                emoji: reaction.emoji,
                reacted: !mine,
              });
            }
          }}
          type="button"
        >
          <span aria-hidden className="text-sm leading-none">
            {reaction.emoji}
          </span>
          <span aria-hidden>{reaction.users.length}</span>
        </button>
      </FluidTooltip.Trigger>
      <FluidTooltip.Content>{names}</FluidTooltip.Content>
    </FluidTooltip.Root>
  );
}

/**
 * The reactions to a card, or to one of its comments, as pills that add or
 * take back yours. Goes inside a FluidTooltip.Group.
 */
export function Reactions({
  card,
  commentId,
  className,
}: {
  card: Card;
  commentId?: Id<"comments">;
  className?: string;
}) {
  const users = useUsers();
  const reactions = useReactions(card).filter(
    (reaction) => reaction.commentId === commentId
  );
  if (reactions.length === 0) {
    return null;
  }
  return (
    <ul
      aria-label="Reactions"
      className={cn("flex flex-wrap items-center gap-1", className)}
    >
      {reactions.map((reaction) => (
        <li key={reaction.emoji}>
          <ReactionPill card={card} reaction={reaction} users={users} />
        </li>
      ))}
    </ul>
  );
}

/** A smiley that picks an emoji to react to a card, or one of its comments, with. */
export function AddReaction({
  card,
  commentId,
  ...props
}: {
  card: Card;
  commentId?: Id<"comments">;
} & Pick<ComponentProps<typeof IconButton>, "className" | "size">) {
  const { me } = useBoard();
  return (
    <EmojiPicker
      onPick={(emoji) =>
        setReaction(card, me, { commentId, emoji, reacted: true })
      }
      trigger={
        <IconButton label="Add reaction" type="button" {...props}>
          <SmilePlusIcon />
        </IconButton>
      }
    />
  );
}
