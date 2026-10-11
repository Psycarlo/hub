import { cn } from "cn";
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  EllipsisIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { useState } from "react";

import { ProjectAvatar } from "@/components/project-avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { useAddProjects } from "@/features/log/add-projects";
import { DeleteTopicAlert, TopicDialog } from "@/features/log/topic-dialog";
import { TopicBadge } from "@/features/log/topic-icon";
import { useMe } from "@/hooks/use-users";
import type { LogTopic } from "@/lib/log";
import { canChangeTopic, linkedProject, unlinkedProjects } from "@/lib/log";
import { updateTopic } from "@/lib/log-actions";
import type { Project } from "@/lib/project";
import { canEdit } from "@/lib/project";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

function Group({
  label,
  action,
  children,
}: {
  label: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-label={label} className="flex flex-col gap-1">
      <div className="flex h-7 items-center justify-between gap-2 px-2">
        <h3 className="text-muted-foreground text-xs font-medium">{label}</h3>
        {action}
      </div>
      <ul className="flex flex-col">
        <AnimatePresence initial={false}>{children}</AnimatePresence>
      </ul>
    </section>
  );
}

function Row({ children }: { children: ReactNode }) {
  return (
    <motion.li
      animate={{ opacity: 1 }}
      className="flex h-11 items-center gap-1"
      exit={{ opacity: 0, transition: { duration: 0.1 } }}
      initial={{ opacity: 0 }}
      layout="position"
      transition={{ duration: 0.2, ease: EASE_OUT }}
    >
      {children}
    </motion.li>
  );
}

/** A topic, opened to edit with a tap, with the rest of what it can do behind ⋯. */
function TopicRow({
  topic,
  project,
  manageable,
  onEdit,
  onDelete,
}: {
  topic: LogTopic;
  /** The project it stands for, while it can be seen. */
  project?: Project;
  manageable: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const label = (
    <>
      <TopicBadge project={project} size="sm" topic={topic} />
      <span className="truncate">{topic.title}</span>
    </>
  );
  const name = cn(
    "flex h-10 min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 text-left text-sm font-medium",
    topic.archived && "text-muted-foreground"
  );
  if (!manageable) {
    return (
      <Row>
        <span className={name}>{label}</span>
      </Row>
    );
  }
  return (
    <Row>
      <button
        className={cn(
          name,
          "hover:bg-foreground/5 focus-visible:ring-ring/50 transition-[background-color] duration-150 ease-out outline-none focus-visible:ring-3"
        )}
        onClick={onEdit}
        type="button"
      >
        {label}
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              aria-label={`More for ${topic.title}`}
              className="text-muted-foreground"
              size="icon-sm"
              variant="ghost"
            />
          }
        >
          <EllipsisIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onEdit}>
            <PencilIcon />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => updateTopic(topic, { archived: !topic.archived })}
          >
            {topic.archived ? <ArchiveRestoreIcon /> : <ArchiveIcon />}
            {topic.archived ? "Restore" : "Archive"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onDelete} variant="destructive">
            <Trash2Icon />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </Row>
  );
}

/** A project of the hub not in the log yet, added with a tap. */
function ProjectRow({
  project,
  busy,
  onAdd,
}: {
  project: Project;
  busy: boolean;
  onAdd: () => void;
}) {
  return (
    <Row>
      <span className="flex h-10 min-w-0 flex-1 items-center gap-2.5 px-2 text-sm">
        <span className="flex size-6 shrink-0 items-center justify-center">
          <ProjectAvatar project={project} />
        </span>
        <span className="truncate">{project.title}</span>
      </span>
      <Button
        aria-label={`Add ${project.title}`}
        disabled={busy}
        onClick={onAdd}
        size="sm"
        variant="ghost"
      >
        <PlusIcon />
        Add
      </Button>
    </Row>
  );
}

interface TopicsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The personal project the log is in. */
  project: Project;
  /** Every topic of the log, archived ones included. */
  topics: readonly LogTopic[];
  /** The projects the person can see. */
  projects: readonly Project[];
}

/**
 * Every topic of the log in one place: each to edit, archive or delete, and
 * the hub's projects not in it yet, to add one by one or all at once.
 */
export function TopicsDialog({
  open,
  onOpenChange,
  project,
  topics,
  projects,
}: TopicsDialogProps) {
  const me = useMe();
  // The topic stays while its dialog closes, so it doesn't empty as it goes.
  const [picked, setPicked] = useState<LogTopic>();
  const [nested, setNested] = useState<"new" | "edit" | "delete">();
  const { add, adding, room } = useAddProjects(project, topics);
  const editable = canEdit(project);
  const current = topics.find((topic) => topic._id === picked?._id) ?? picked;
  const active = topics.filter((topic) => !topic.archived);
  const archived = topics.filter((topic) => topic.archived);
  const unlinked = editable ? unlinkedProjects(projects, topics) : [];

  const openFor = (kind: "edit" | "delete", topic: LogTopic) => {
    setPicked(topic);
    setNested(kind);
  };
  const nestedProps = (kind: "new" | "edit" | "delete") => ({
    onOpenChange: (next: boolean) => setNested(next ? kind : undefined),
    open: nested === kind,
  });

  const row = (topic: LogTopic) => (
    <TopicRow
      key={topic._id}
      manageable={canChangeTopic(project, topic, me._id)}
      onDelete={() => openFor("delete", topic)}
      onEdit={() => openFor("edit", topic)}
      project={linkedProject(topic, projects)}
      topic={topic}
    />
  );

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Topics</DialogTitle>
          <DialogDescription>
            What you log your days on. Archive one to stop logging it and keep
            its days.
          </DialogDescription>
        </DialogHeader>

        <div className="-mx-2 flex flex-col gap-4">
          {topics.length === 0 && (
            <p className="text-muted-foreground px-2 text-sm">No topics yet.</p>
          )}
          {active.length > 0 && <Group label="Active">{active.map(row)}</Group>}
          {archived.length > 0 && (
            <Group label="Archived">{archived.map(row)}</Group>
          )}
          {unlinked.length > 0 && room > 0 && (
            <Group
              action={
                unlinked.length > 1 && (
                  <Button
                    disabled={adding}
                    onClick={() => add(unlinked)}
                    size="xs"
                    variant="outline"
                  >
                    {adding && <Spinner />}
                    Add all
                  </Button>
                )
              }
              label="Not in your log"
            >
              {unlinked.map((item) => (
                <ProjectRow
                  busy={adding}
                  key={item._id}
                  onAdd={() => add([item])}
                  project={item}
                />
              ))}
            </Group>
          )}
        </div>

        <DialogFooter>
          {editable && room > 0 && (
            <Button
              className="sm:mr-auto"
              onClick={() => setNested("new")}
              variant="outline"
            >
              <PlusIcon />
              New topic
            </Button>
          )}
          <DialogClose render={<Button />}>Done</DialogClose>
        </DialogFooter>

        <TopicDialog
          {...nestedProps("new")}
          project={project}
          topics={topics}
        />
        {current && (
          <>
            <TopicDialog
              {...nestedProps("edit")}
              key={current._id}
              project={project}
              topic={current}
              topics={topics}
            />
            <DeleteTopicAlert {...nestedProps("delete")} topic={current} />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
