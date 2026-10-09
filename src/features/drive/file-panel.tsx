import { api } from "@convex/_generated/api";
import type { DriveChange } from "@convex/lib/validators";
import { cn } from "cn";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { format } from "date-fns";
import { ArrowUpIcon, Trash2Icon } from "lucide-react";
import type { KeyboardEvent, ReactNode } from "react";
import { useState } from "react";

import { IconButton } from "@/components/icon-button";
import { MentionText } from "@/components/mention-text";
import { MentionTextarea } from "@/components/mention-textarea";
import { Spinner } from "@/components/ui/spinner";
import { UserAvatar } from "@/components/user-avatar";
import { When } from "@/features/card/card-parts";
import { useDrive } from "@/features/drive/drive-state";
import { FolderIcon } from "@/features/drive/file-icon";
import { useUser } from "@/hooks/use-users";
import type { DriveFile } from "@/lib/drive";
import { fileKind, formatDuration, KIND_LABELS } from "@/lib/drive";
import { addFileComment, deleteFileComment } from "@/lib/drive-actions";
import type { Mention } from "@/lib/mentions";
import { encodeMentions } from "@/lib/mentions";
import { formatBytes } from "@/lib/utils";

const APPLE = /Mac|iPhone|iPad/u.test(navigator.userAgent);

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-4 py-1.5 text-sm">
      <dt className="text-muted-foreground shrink-0">{label}</dt>
      <dd className="flex min-w-0 items-center gap-1.5 truncate text-right">
        {children}
      </dd>
    </div>
  );
}

function PersonName({ userId }: { userId: string }) {
  return useUser(userId).name;
}

function Details({ file }: { file: DriveFile }) {
  const { tree } = useDrive();
  const folder = file.folderId ? tree.byId.get(file.folderId) : undefined;
  return (
    <dl className="flex flex-col divide-y">
      <Detail label="Kind">{KIND_LABELS[fileKind(file)]}</Detail>
      <Detail label="Size">
        <span className="tabular-nums">{formatBytes(file.size)}</span>
      </Detail>
      {file.width && file.height && (
        <Detail label="Dimensions">
          <span className="tabular-nums">
            {file.width} × {file.height}
          </span>
        </Detail>
      )}
      {file.duration && (
        <Detail label="Length">
          <span className="tabular-nums">{formatDuration(file.duration)}</span>
        </Detail>
      )}
      <Detail label="Where">
        <FolderIcon folder={folder} size="sm" />
        <span className="truncate">{folder?.name ?? "Drive"}</span>
      </Detail>
      <Detail label="Added by">
        <UserAvatar aria-hidden size="xs" userId={file.uploadedBy} />
        <span className="truncate">
          <PersonName userId={file.uploadedBy} />
        </span>
      </Detail>
      <Detail label="Added">
        <span title={format(file._creationTime, "PPpp")}>
          {format(file._creationTime, "PP")}
        </span>
      </Detail>
    </dl>
  );
}

function folderName(name: string | undefined): string {
  return name ? `“${name}”` : "the top of the Drive";
}

function changeText(change: DriveChange): string {
  switch (change.kind) {
    case "uploaded": {
      return "uploaded this";
    }
    case "renamed": {
      return `renamed it from “${change.from}”`;
    }
    case "moved": {
      return `moved it from ${folderName(change.from)} to ${folderName(change.to)}`;
    }
    case "trashed": {
      return "moved it to the trash";
    }
    default: {
      return "restored it from the trash";
    }
  }
}

type Activity = FunctionReturnType<typeof api.drive.activity>[number];

function Event({ entry }: { entry: Extract<Activity, { kind: "event" }> }) {
  return (
    <li className="text-muted-foreground flex items-start gap-2.5 text-sm">
      <UserAvatar
        aria-hidden
        className="mt-px"
        size="xs"
        userId={entry.actorId}
      />
      <p className="min-w-0 flex-1">
        <span className="text-foreground font-medium">
          <PersonName userId={entry.actorId} />
        </span>{" "}
        {changeText(entry.change)} · <When at={entry._creationTime} />
      </p>
    </li>
  );
}

function Comment({ entry }: { entry: Extract<Activity, { kind: "comment" }> }) {
  const { me, canEdit } = useDrive();
  return (
    <li className="group/comment bg-card shadow-surface flex flex-col gap-1.5 rounded-xl p-3">
      <div className="flex h-6 items-center gap-2">
        <UserAvatar aria-hidden size="sm" userId={entry.actorId} />
        <span className="truncate text-sm font-medium">
          <PersonName userId={entry.actorId} />
        </span>
        <When at={entry._creationTime} />
        {canEdit && entry.actorId === me && (
          <IconButton
            className="ml-auto opacity-0 transition-opacity duration-150 group-hover/comment:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
            label="Delete comment"
            onClick={() => deleteFileComment(entry._id)}
            size="icon-xs"
          >
            <Trash2Icon />
          </IconButton>
        )}
      </div>
      <p className="text-sm wrap-break-word whitespace-pre-wrap">
        <MentionText content={entry.content} />
      </p>
    </li>
  );
}

function Composer({ file }: { file: DriveFile }) {
  const { me, project } = useDrive();
  const [text, setText] = useState("");
  const [picked, setPicked] = useState<Mention[]>([]);
  const [sending, setSending] = useState(false);
  const ready = !sending && text.trim() !== "";

  const send = async () => {
    if (!ready) {
      return;
    }
    setSending(true);
    const sent = await addFileComment(
      file._id,
      encodeMentions(text.trim(), picked)
    );
    setSending(false);
    if (sent !== undefined) {
      setText("");
      setPicked([]);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    event.stopPropagation();
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      send();
    } else if (event.key === "Escape") {
      event.currentTarget.blur();
    }
  };

  return (
    <form
      className="bg-card shadow-surface flex items-end gap-1 rounded-xl p-1.5"
      onSubmit={(event) => {
        event.preventDefault();
        send();
      }}
    >
      <MentionTextarea
        aria-label="Comment"
        className="min-h-9 flex-1 rounded-none border-0 bg-transparent px-2 py-1.5 focus-visible:ring-0 dark:bg-transparent"
        onKeyDown={onKeyDown}
        onMention={(mention) => setPicked([...picked, mention])}
        onValueChange={setText}
        people={project.members
          .map((member) => member.userId)
          .filter((userId) => userId !== me)}
        placeholder="Comment… @ to mention"
        readOnly={sending}
        rows={1}
        value={text}
      />
      <IconButton
        disabled={!ready}
        label="Send"
        onMouseDown={(event) => event.preventDefault()}
        tooltip={`Send ${APPLE ? "⌘↵" : "Ctrl+Enter"}`}
        type="submit"
        variant={ready || sending ? "default" : "secondary"}
      >
        {sending ? <Spinner /> : <ArrowUpIcon />}
      </IconButton>
    </form>
  );
}

/** A file's details, what happened to it and what people said about it. */
export function FilePanel({
  file,
  className,
}: {
  file: DriveFile;
  className?: string;
}) {
  const { canEdit } = useDrive();
  const activity = useQuery(api.drive.activity, { fileId: file._id });
  return (
    <aside
      aria-label="Details and comments"
      className={cn(
        "bg-popover text-popover-foreground shadow-raised flex min-h-0 flex-col rounded-2xl",
        className
      )}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4">
        <section className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold">Details</h3>
          <Details file={file} />
        </section>
        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold">Activity</h3>
          {activity === undefined ? (
            <Spinner className="text-muted-foreground" />
          ) : (
            <ol className="flex flex-col gap-3">
              {activity.map((entry) =>
                entry.kind === "event" ? (
                  <Event entry={entry} key={entry._id} />
                ) : (
                  <Comment entry={entry} key={entry._id} />
                )
              )}
            </ol>
          )}
        </section>
      </div>
      {canEdit && (
        <div className="border-t p-3">
          <Composer file={file} />
        </div>
      )}
    </aside>
  );
}
