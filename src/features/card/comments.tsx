import { api } from "@convex/_generated/api";
import { cn } from "cn";
import { useQuery } from "convex/react";
import { format, formatDistanceToNowStrict } from "date-fns";
import { Trash2Icon } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useId, useRef, useState } from "react";

import { IconButton } from "@/components/icon-button";
import { MentionText } from "@/components/mention-text";
import { MentionTextarea } from "@/components/mention-textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/user-avatar";
import { useBoard } from "@/features/board/board-context";
import type { Comment } from "@/hooks/use-comments";
import { useComments } from "@/hooks/use-comments";
import { useUser } from "@/hooks/use-users";
import { addComment, deleteComment, run } from "@/lib/actions";
import { convex } from "@/lib/convex";
import type { Mention } from "@/lib/mentions";
import { encodeMentions } from "@/lib/mentions";
import type { Card } from "@/lib/model";

function ago(date: Date): string {
  return Date.now() - date.getTime() < 60_000
    ? "Just now"
    : formatDistanceToNowStrict(date, { addSuffix: true });
}

function DeleteComment({ comment }: { comment: Comment }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <IconButton
        className="ml-auto opacity-0 transition-opacity duration-150 group-hover/comment:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
        label="Delete comment"
        onClick={() => setOpen(true)}
        size="icon-xs"
      >
        <Trash2Icon />
      </IconButton>
      <AlertDialog onOpenChange={setOpen} open={open}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete comment?</AlertDialogTitle>
            <AlertDialogDescription>
              This can’t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteComment(comment._id)}
              variant="destructive"
            >
              Delete comment
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function CommentItem({ comment, own }: { comment: Comment; own: boolean }) {
  const { name } = useUser(comment.authorId);
  const date = new Date(comment._creationTime);
  return (
    <li className="group/comment flex gap-3">
      <UserAvatar
        aria-hidden
        className="mt-0.5"
        size="sm"
        userId={comment.authorId}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex h-6 items-center gap-2">
          <span className="truncate font-medium">{name}</span>
          <time
            className="text-muted-foreground shrink-0 text-xs"
            dateTime={date.toISOString()}
            title={format(date, "PPpp")}
          >
            {ago(date)}
          </time>
          {own && <DeleteComment comment={comment} />}
        </div>
        <p className="wrap-break-word whitespace-pre-wrap">
          <MentionText content={comment.content} />
        </p>
      </div>
    </li>
  );
}

function Composer({ card }: { card: Card }) {
  const { me, people } = useBoard();
  const [text, setText] = useState("");
  // Who was picked from the list, read only when sending.
  const picked = useRef<Mention[]>([]);

  const send = async () => {
    const content = encodeMentions(text.trim(), picked.current);
    if (!content) {
      return;
    }
    setText("");
    picked.current = [];
    if ((await addComment(card, content)) === undefined) {
      // Not saved: the text comes back, to try again.
      setText(text);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    send();
  };

  return (
    <form className="flex flex-col gap-2" onSubmit={submit}>
      <MentionTextarea
        aria-label="Comment"
        className="min-h-16"
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            send();
          }
        }}
        onMention={(mention) => {
          picked.current = [...picked.current, mention];
        }}
        onValueChange={setText}
        // Anyone on the project, viewers too, can be pointed at the card.
        people={people.filter((person) => person !== me)}
        placeholder="Add a comment… Type @ to mention someone."
        value={text}
      />
      {text.trim() && (
        <Button className="self-end" size="sm" type="submit">
          Comment
        </Button>
      )}
    </form>
  );
}

/** Seeing the card counts as reading the mentions of you in it. */
function useReadMentions(card: Card) {
  const inbox = useQuery(api.inbox.list);
  const unread = inbox?.some(
    (item) => item.card._id === card._id && !item.read
  );
  useEffect(() => {
    if (unread) {
      run(convex.mutation(api.inbox.readCard, { cardId: card._id }));
    }
  }, [unread, card._id]);
}

export function Comments({
  card,
  className,
}: {
  card: Card;
  className?: string;
}) {
  const id = useId();
  const { canEdit, me } = useBoard();
  const comments = useComments(card);
  useReadMentions(card);

  if (!canEdit && comments.length === 0) {
    return null;
  }

  return (
    <section
      aria-labelledby={id}
      className={cn("flex flex-col gap-4", className)}
    >
      <h3 className="flex items-center gap-2 font-medium" id={id}>
        Comments
        {comments.length > 0 && (
          <span className="text-muted-foreground tabular-nums">
            {comments.length}
          </span>
        )}
      </h3>
      {comments.length > 0 && (
        <ol className="flex flex-col gap-4">
          {comments.map((comment) => (
            <CommentItem
              comment={comment}
              key={comment._id}
              own={comment.authorId === me}
            />
          ))}
        </ol>
      )}
      {canEdit && <Composer card={card} />}
    </section>
  );
}
