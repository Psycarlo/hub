import { api } from "@convex/_generated/api";
import { cn } from "cn";
import { useQuery } from "convex/react";
import { ArrowUpIcon, Trash2Icon } from "lucide-react";
import type { ClipboardEvent, FormEvent, KeyboardEvent } from "react";
import { useEffect, useState } from "react";

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
import { FluidTooltip } from "@/components/ui/fluid-tooltip";
import { Spinner } from "@/components/ui/spinner";
import { UserAvatar } from "@/components/user-avatar";
import { useBoard } from "@/features/board/board-context";
import {
  AttachButton,
  DraftChips,
  FILE_PILL,
  FileTypeIcon,
  isImageType,
} from "@/features/card/card-files";
import { When } from "@/features/card/card-parts";
import { AddReaction, Reactions } from "@/features/card/reactions";
import { useDraftFiles } from "@/features/card/use-draft-files";
import { DROP_TARGET, useFileDrop } from "@/features/card/use-file-drop";
import type { Comment } from "@/hooks/use-comments";
import { useStoredDraft } from "@/hooks/use-stored-draft";
import { useUser } from "@/hooks/use-users";
import { addComment, deleteComment, run } from "@/lib/actions";
import { convex } from "@/lib/convex";
import type { Mention } from "@/lib/mentions";
import { encodeMentions } from "@/lib/mentions";
import type { Card } from "@/lib/model";
import { MAX_COMMENT_FILES } from "@/lib/model";
import { formatBytes } from "@/lib/utils";

const APPLE = /Mac|iPhone|iPad/u.test(navigator.userAgent);

/** A text field without a box of its own, sitting in one that has it. */
const BARE =
  "rounded-none border-0 bg-transparent focus-visible:ring-0 dark:bg-transparent";

type CommentFile = Comment["attachments"][number];

function DeleteComment({ comment }: { comment: Comment }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <IconButton
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
              {comment.attachments.length > 0
                ? "Its files go with it. This can’t be undone."
                : "This can’t be undone."}
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

function FileChip({ file }: { file: CommentFile }) {
  return (
    <a
      className={cn(
        FILE_PILL,
        "hover:bg-foreground/10 focus-visible:ring-ring/50 max-w-64 px-2.5 transition-colors duration-150 outline-none focus-visible:ring-3"
      )}
      href={file.url}
      rel="noreferrer"
      target="_blank"
      title={file.name}
    >
      <FileTypeIcon
        className="text-muted-foreground size-3.5 shrink-0"
        type={file.type}
      />
      <span className="truncate">{file.name}</span>
      <span className="text-muted-foreground shrink-0 font-normal">
        {formatBytes(file.size)}
      </span>
    </a>
  );
}

function CommentImage({ file }: { file: CommentFile }) {
  // Some images, like HEIC photos, won't show in every browser.
  const [broken, setBroken] = useState(false);
  if (broken) {
    return <FileChip file={file} />;
  }
  return (
    <a
      className="focus-visible:ring-ring/50 block rounded-lg outline-none focus-visible:ring-3"
      href={file.url}
      rel="noreferrer"
      target="_blank"
      title={file.name}
    >
      <img
        alt={file.name}
        className="image-outline bg-foreground/5 h-28 max-w-60 min-w-16 rounded-lg object-cover"
        loading="lazy"
        onError={() => setBroken(true)}
        src={file.url}
      />
    </a>
  );
}

/** A comment's files: images as previews, anything else as a pill. */
function CommentFiles({ files }: { files: CommentFile[] }) {
  const images = files.filter((file) => isImageType(file.type));
  const others = files.filter((file) => !isImageType(file.type));
  return (
    <>
      {images.length > 0 && (
        <ul aria-label="Images" className="flex flex-wrap items-start gap-2">
          {images.map((file) => (
            <li key={file._id}>
              <CommentImage file={file} />
            </li>
          ))}
        </ul>
      )}
      {others.length > 0 && (
        <ul aria-label="Files" className="flex flex-wrap gap-1.5">
          {others.map((file) => (
            <li className="min-w-0" key={file._id}>
              <FileChip file={file} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function CommentBody({ card, comment }: { card: Card; comment: Comment }) {
  const { canEdit, me } = useBoard();
  const { name } = useUser(comment.authorId);
  if (comment.deleted) {
    return (
      <p className="text-muted-foreground p-3 text-sm">
        This comment was deleted.
      </p>
    );
  }
  return (
    <div className="group/comment flex flex-col gap-2 p-3">
      <div className="flex h-6 items-center gap-2">
        <UserAvatar aria-hidden size="sm" userId={comment.authorId} />
        <span className="truncate text-sm font-medium">{name}</span>
        <When at={comment._creationTime} />
        {canEdit && (
          // Shown on hover, and kept while the emoji picker is open.
          <div className="ml-auto flex items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover/comment:opacity-100 focus-within:opacity-100 has-data-popup-open:opacity-100 pointer-coarse:opacity-100">
            <AddReaction card={card} commentId={comment._id} size="icon-xs" />
            {comment.authorId === me && <DeleteComment comment={comment} />}
          </div>
        )}
      </div>
      {comment.content && (
        <p className="text-sm wrap-break-word whitespace-pre-wrap">
          <MentionText content={comment.content} />
        </p>
      )}
      <CommentFiles files={comment.attachments} />
      <FluidTooltip.Group>
        <Reactions card={card} commentId={comment._id} />
      </FluidTooltip.Group>
    </div>
  );
}

function SendButton({ ready, sending }: { ready: boolean; sending: boolean }) {
  return (
    <IconButton
      disabled={!ready}
      label="Send"
      // Clicking it leaves focus, and the caret, in the field.
      onMouseDown={(event) => event.preventDefault()}
      tooltip={
        <span className="flex items-center gap-2">
          Send
          <span className="text-background/60">
            {APPLE ? "⌘↵" : "Ctrl+Enter"}
          </span>
        </span>
      }
      type="submit"
      variant={ready || sending ? "default" : "secondary"}
    >
      {sending ? <Spinner /> : <ArrowUpIcon />}
    </IconButton>
  );
}

/** A comment being written, and who was picked from the list to mention in it. */
interface CommentDraft {
  text: string;
  picked: Mention[];
}

const BLANK: CommentDraft = { picked: [], text: "" };

function isBlank(draft: CommentDraft): boolean {
  return draft.text.trim() === "";
}

/**
 * Where a comment is written, or a reply to `parent`. Files can be attached
 * with the paperclip, dropped on it or pasted into it. The text is kept as a
 * draft until it's sent; the files aren't.
 */
export function Composer({ card, parent }: { card: Card; parent?: Comment }) {
  const { me, people } = useBoard();
  const { draft, change, discard } = useStoredDraft(
    `comment:${me}:${card._id}${parent ? `:${parent._id}` : ""}`,
    BLANK,
    isBlank
  );
  const { text } = draft;
  const [sending, setSending] = useState(false);
  const drafts = useDraftFiles(
    MAX_COMMENT_FILES,
    `A comment can carry up to ${MAX_COMMENT_FILES} files.`
  );
  const drop = useFileDrop(drafts.add);
  const uploading = drafts.files.some((file) => !file.upload);
  const ready =
    !(sending || uploading) && (text.trim() !== "" || drafts.files.length > 0);

  const send = async () => {
    if (!ready) {
      return;
    }
    const { files } = drafts;
    setSending(true);
    const sent = await addComment(card, {
      content: encodeMentions(text.trim(), draft.picked),
      files: files.flatMap((file) => file.upload ?? []),
      parentId: parent?._id,
    });
    setSending(false);
    // Not sent: the text and files stay, to try again.
    if (sent !== undefined) {
      discard();
      drafts.sent(files.map((file) => file.id));
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    send();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      send();
    } else if (event.key === "Escape" && (text || drafts.files.length > 0)) {
      // Escape leaves the draft, instead of closing the card and losing it.
      event.stopPropagation();
      event.currentTarget.blur();
    }
  };

  const onPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = [...event.clipboardData.files];
    // Office apps copy a picture of the text along with it; that pastes as text.
    if (files.length > 0 && !event.clipboardData.types.includes("text/plain")) {
      event.preventDefault();
      drafts.add(files);
    }
  };

  const field = (
    <MentionTextarea
      aria-label={parent ? "Reply" : "Comment"}
      className={cn(
        BARE,
        parent ? "min-h-8 flex-1 px-0 py-1.5" : "min-h-14 px-3 pt-3 pb-1"
      )}
      onKeyDown={onKeyDown}
      onMention={(mention) => change({ picked: [...draft.picked, mention] })}
      onPaste={onPaste}
      onValueChange={(next) => change({ text: next })}
      // Anyone on the project, viewers too, can be pointed at the card.
      people={people.filter((person) => person !== me)}
      placeholder={
        parent
          ? "Leave a reply…"
          : "Leave a comment… Type @ to mention someone."
      }
      readOnly={sending}
      rows={1}
      value={text}
    />
  );
  const chips = (
    <DraftChips
      className={parent ? "pl-9" : "px-3 pt-1"}
      files={drafts.files}
      label="Files to send"
      locked={sending}
      onRemove={(id) => drafts.remove(id)}
    />
  );
  const actions = (
    <div className="flex shrink-0 items-center gap-1">
      <FluidTooltip.Group>
        <AttachButton onFiles={(files) => drafts.add(files)} />
        <SendButton ready={ready} sending={sending} />
      </FluidTooltip.Group>
    </div>
  );
  const form =
    "flex flex-col transition-[background-color,box-shadow] duration-150 ease-out";

  if (parent) {
    return (
      <form
        className={cn(
          form,
          "gap-2 rounded-b-xl border-t p-2",
          drop.over && DROP_TARGET
        )}
        onSubmit={submit}
        {...drop.handlers}
      >
        <div className="flex items-end gap-2">
          <UserAvatar
            aria-hidden
            className="mt-1 ml-1 self-start"
            size="sm"
            userId={me}
          />
          {field}
          {actions}
        </div>
        {chips}
      </form>
    );
  }
  return (
    <form
      // The tint and ring take the place of its surface while files are over it.
      className={cn(
        form,
        "rounded-xl",
        drop.over ? DROP_TARGET : "bg-card shadow-surface"
      )}
      onSubmit={submit}
      {...drop.handlers}
    >
      {field}
      {chips}
      <div className="flex justify-end p-2">{actions}</div>
    </form>
  );
}

/** A comment with its replies, and a field to reply. */
export function CommentThread({
  card,
  comment,
  replies,
}: {
  card: Card;
  comment: Comment;
  replies: Comment[];
}) {
  const { canEdit } = useBoard();
  return (
    <article className="bg-card shadow-surface rounded-xl">
      <CommentBody card={card} comment={comment} />
      {replies.length > 0 && (
        <ol aria-label="Replies">
          {replies.map((reply) => (
            <li className="border-t" key={reply._id}>
              <CommentBody card={card} comment={reply} />
            </li>
          ))}
        </ol>
      )}
      {canEdit && <Composer card={card} parent={comment} />}
    </article>
  );
}

/** Seeing the card counts as reading the mentions of you in it. */
export function useReadMentions(card: Card) {
  const inbox = useQuery(api.inbox.list);
  const unread = inbox?.some(
    (item) =>
      item.kind === "comment" && item.card._id === card._id && !item.read
  );
  useEffect(() => {
    if (unread) {
      run(convex.mutation(api.inbox.readCard, { cardId: card._id }));
    }
  }, [unread, card._id]);
}
