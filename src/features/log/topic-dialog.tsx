import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useQuery } from "convex/react";
import type { FormEvent } from "react";
import { useId, useState } from "react";

import { ColorPicker } from "@/components/color-picker";
import { ProjectAvatar } from "@/components/project-avatar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { TOPIC_ICON_COMPONENTS, TopicBadge } from "@/features/log/topic-icon";
import type { LogTopic, TopicIcon } from "@/lib/log";
import { MAX_TOPIC_TITLE, TOPIC_ICONS } from "@/lib/log";
import type { TopicDraft } from "@/lib/log-actions";
import { createTopic, deleteTopic, updateTopic } from "@/lib/log-actions";
import { isHexColor } from "@/lib/palette";
import type { Project } from "@/lib/project";

const NO_PROJECTS: Project[] = [];
/** The project select's value for a topic of its own. */
const NONE = "none";

const NEW_TOPIC: TopicDraft = { color: "blue", icon: "folder", title: "" };

/** The topic's look: its color, then its icon, from the badge beside its name. */
function LookPicker({
  icon,
  color,
  onIcon,
  onColor,
}: {
  icon: TopicIcon;
  color: TopicDraft["color"];
  onIcon: (icon: TopicIcon) => void;
  onColor: (color: TopicDraft["color"]) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger
        aria-label="Icon and color"
        className="focus-visible:ring-ring/50 shrink-0 rounded-lg transition-[scale] duration-150 ease-out outline-none focus-visible:ring-3 active:scale-[0.96]"
      >
        <TopicBadge className="size-9" topic={{ color, icon }} />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        aria-label="Icon and color"
        className="flex w-auto flex-col gap-3"
      >
        <ColorPicker aria-label="Color" onChange={onColor} value={color} />
        <ToggleGroup
          aria-label="Icon"
          className="grid grid-cols-8 gap-1 border-t pt-3"
          onValueChange={(next) => {
            const picked = TOPIC_ICONS.find((item) => item === next[0]);
            if (picked) {
              onIcon(picked);
            }
          }}
          value={[icon]}
        >
          {TOPIC_ICONS.map((name) => {
            const Icon = TOPIC_ICON_COMPONENTS[name];
            return (
              <ToggleGroupItem
                aria-label={name}
                className="text-muted-foreground hover:bg-foreground/5 hover:text-foreground data-pressed:bg-primary/15 data-pressed:text-foreground data-pressed:inset-ring-primary/60 flex size-9 items-center justify-center rounded-lg transition-[background-color,color,box-shadow] duration-150 data-pressed:inset-ring"
                key={name}
                value={name}
              >
                <Icon className="size-4" />
              </ToggleGroupItem>
            );
          })}
        </ToggleGroup>
      </PopoverContent>
    </Popover>
  );
}

/** A project of the hub the topic stands for, or none for a topic of its own. */
function ProjectField({
  id,
  value,
  projects,
  onChange,
}: {
  id: string;
  value: Id<"projects"> | undefined;
  projects: readonly Project[];
  onChange: (project: Project | undefined) => void;
}) {
  const options = [
    { label: "None", value: NONE },
    ...projects.map((project) => ({
      label: project.title,
      value: project._id as string,
    })),
  ];
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium select-none" id={`${id}-label`}>
        Project
      </span>
      <Select
        items={options}
        onValueChange={(next: string | null) =>
          onChange(projects.find((project) => project._id === next))
        }
        value={value ?? NONE}
      >
        <SelectTrigger aria-labelledby={`${id}-label`} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>None</SelectItem>
          {projects.map((project) => (
            <SelectItem key={project._id} value={project._id}>
              <span className="flex min-w-0 items-center gap-2">
                <ProjectAvatar project={project} />
                <span className="truncate">{project.title}</span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className="text-muted-foreground text-xs">
        Shows the project’s avatar and links to it.
      </span>
    </div>
  );
}

function DeleteTopic({
  topic,
  onDeleted,
}: {
  topic: LogTopic;
  onDeleted: () => void;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button className="sm:mr-auto" type="button" variant="destructive" />
        }
      >
        Delete topic
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {topic.title}?</AlertDialogTitle>
          <AlertDialogDescription>
            Every day logged on it disappears, notes included. To keep them,
            archive it instead.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              deleteTopic(topic);
              onDeleted();
            }}
            variant="destructive"
          >
            Delete topic
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

interface TopicFormProps {
  /** The personal project the log is in. */
  project: Project;
  /** The topic to change; a new one starts otherwise. */
  topic?: LogTopic;
  /** Every topic of the log, so a project stands for one topic at most. */
  topics: readonly LogTopic[];
  /** Once a new topic is in, with its id. */
  onCreated?: (topicId: Id<"logTopics">) => void;
  onDone: () => void;
}

function TopicForm({
  project,
  topic,
  topics,
  onCreated,
  onDone,
}: TopicFormProps) {
  const id = useId();
  const projects = useQuery(api.projects.list) ?? NO_PROJECTS;
  const [draft, setDraft] = useState<TopicDraft>(() =>
    topic
      ? {
          color: topic.color,
          icon: topic.icon,
          linkedProjectId: topic.linkedProjectId,
          title: topic.title,
        }
      : NEW_TOPIC
  );
  const [archived, setArchived] = useState(topic?.archived ?? false);
  const [saving, setSaving] = useState(false);
  const valid = draft.title.trim() !== "";
  const change = (changes: Partial<TopicDraft>) =>
    setDraft((current) => ({ ...current, ...changes }));
  // Shared projects only, each for one topic at most.
  const taken = new Set(
    topics
      .filter((item) => item._id !== topic?._id)
      .map((item) => item.linkedProjectId)
  );
  const linkable = projects.filter(
    (item) => !(item.personalFor || taken.has(item._id))
  );

  const link = (picked: Project | undefined) => {
    const current = projects.find((item) => item._id === draft.linkedProjectId);
    // A name still the old project's, or none yet, follows the new one.
    const named = draft.title.trim() === "" || draft.title === current?.title;
    change({
      linkedProjectId: picked?._id,
      ...(picked && named ? { title: picked.title } : {}),
      ...(picked && !isHexColor(picked.color) ? { color: picked.color } : {}),
    });
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!valid) {
      return;
    }
    const cleaned = { ...draft, title: draft.title.trim() };
    if (topic) {
      updateTopic(topic, {
        ...cleaned,
        archived,
        // Sent only when changed: a project no longer shared stays linked until then.
        linkedProjectId:
          cleaned.linkedProjectId === topic.linkedProjectId
            ? undefined
            : (cleaned.linkedProjectId ?? null),
      });
      onDone();
      return;
    }
    setSaving(true);
    const topicId = await createTopic(project._id, cleaned);
    setSaving(false);
    if (topicId) {
      onCreated?.(topicId);
      onDone();
    }
  };

  return (
    <form className="flex flex-col gap-5" onSubmit={submit}>
      <DialogHeader>
        <DialogTitle>{topic ? "Topic settings" : "New topic"}</DialogTitle>
      </DialogHeader>

      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-title`}>Name</Label>
        <div className="flex items-center gap-2">
          <LookPicker
            color={draft.color}
            icon={draft.icon}
            onColor={(color) => change({ color })}
            onIcon={(icon) => change({ icon })}
          />
          <Input
            autoComplete="off"
            autoFocus={!topic}
            id={`${id}-title`}
            maxLength={MAX_TOPIC_TITLE}
            onChange={(event) => change({ title: event.target.value })}
            placeholder="Website redesign"
            value={draft.title}
          />
        </div>
      </div>

      {(linkable.length > 0 || draft.linkedProjectId) && (
        <ProjectField
          id={`${id}-project`}
          onChange={link}
          projects={linkable}
          value={draft.linkedProjectId}
        />
      )}

      {topic && (
        <label
          className="flex cursor-pointer items-center gap-3 select-none"
          htmlFor={`${id}-archived`}
        >
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-sm font-medium" id={`${id}-archived-label`}>
              Archived
            </span>
            <span
              className="text-muted-foreground text-xs"
              id={`${id}-archived-hint`}
            >
              Keeps its days, but it’s no longer offered to log.
            </span>
          </span>
          <Switch
            aria-describedby={`${id}-archived-hint`}
            aria-labelledby={`${id}-archived-label`}
            checked={archived}
            id={`${id}-archived`}
            onCheckedChange={setArchived}
          />
        </label>
      )}

      <DialogFooter className="mt-1">
        {topic && <DeleteTopic onDeleted={onDone} topic={topic} />}
        <DialogClose render={<Button type="button" variant="ghost" />}>
          Cancel
        </DialogClose>
        <Button disabled={!valid || saving} type="submit">
          {saving && <Spinner />}
          {topic ? "Save" : "Create topic"}
        </Button>
      </DialogFooter>
    </form>
  );
}

type TopicDialogProps = Omit<TopicFormProps, "onDone"> & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function TopicDialog({
  open,
  onOpenChange,
  ...props
}: TopicDialogProps) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent showCloseButton={false}>
        <TopicForm {...props} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
