import type { Id } from "@convex/_generated/dataModel";
import { cn } from "cn";
import type { FormEvent } from "react";
import { useId, useState } from "react";
import { useLocation } from "wouter";

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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { boardPath } from "@/features/board/board-context";
import {
  CardDefaultsField,
  NO_CARD_DEFAULTS,
} from "@/features/boards/card-defaults-field";
import {
  codeError,
  KeyField,
  useTakenCodes,
} from "@/features/boards/key-field";
import { LabelsEditor, useLabelsDraft } from "@/features/boards/labels-editor";
import { STATUS_STYLES } from "@/features/card/card-fields";
import type { BoardDraft, LabelChanges } from "@/lib/actions";
import { createBoard, deleteBoard, updateBoard } from "@/lib/actions";
import type { Board, BoardLabel, CardDefaults, Status } from "@/lib/model";
import {
  DEFAULT_STATUSES,
  isClosed,
  STATUSES,
  suggestCode,
  workableStatuses,
} from "@/lib/model";
import type { Project } from "@/lib/project";
import { canEdit } from "@/lib/project";

function ProjectField({
  projects,
  value,
  onChange,
}: {
  projects: Project[];
  value: Id<"projects">;
  onChange: (project: Id<"projects">) => void;
}) {
  const id = useId();
  const options = projects.map((project) => ({
    label: (
      <>
        <ProjectAvatar project={project} />
        <span className="truncate">{project.title}</span>
      </>
    ),
    value: project._id,
  }));
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>Project</Label>
      <Select
        items={options}
        onValueChange={(next: Id<"projects"> | null) => {
          if (next) {
            onChange(next);
          }
        }}
        value={value}
      >
        <SelectTrigger className="w-full" id={id}>
          <SelectValue className="items-center gap-2" />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/**
 * The statuses the board uses, as chips to switch on and off. The last open
 * status and the last closed one stay on: cards need somewhere to start and
 * somewhere to finish.
 */
function StatusesField({
  value,
  onChange,
}: {
  value: Status[];
  onChange: (statuses: Status[]) => void;
}) {
  const id = useId();
  const open = value.filter((status) => !isClosed(status)).length;
  const closed = value.length - open;
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium select-none" id={id}>
        Statuses
      </span>
      <ToggleGroup
        aria-labelledby={id}
        className="flex-wrap gap-1.5"
        multiple
        onValueChange={(next) =>
          onChange(
            STATUSES.flatMap(({ id: status }) =>
              next.includes(status) ? [status] : []
            )
          )
        }
        value={value}
      >
        {STATUSES.map(({ id: status, label }) => {
          const { icon: Icon, className } = STATUS_STYLES[status];
          const on = value.includes(status);
          const last = on && (isClosed(status) ? closed : open) === 1;
          return (
            <ToggleGroupItem
              className="text-muted-foreground not-data-disabled:hover:text-foreground data-pressed:bg-card data-pressed:text-foreground data-pressed:shadow-surface not-data-pressed:not-data-disabled:hover:bg-foreground/5 border-foreground/15 flex h-7 items-center gap-1.5 rounded-full border border-dashed pr-2.5 pl-2 text-xs font-medium transition-[background-color,border-color,color,box-shadow,scale] duration-150 ease-out not-data-disabled:active:scale-[0.96] data-disabled:cursor-not-allowed data-pressed:border-transparent"
              disabled={last}
              key={status}
              value={status}
            >
              <Icon
                aria-hidden
                className={cn(
                  "size-3.5 shrink-0 transition-colors duration-150",
                  on ? className : "text-muted-foreground/70"
                )}
              />
              {label}
            </ToggleGroupItem>
          );
        })}
      </ToggleGroup>
    </div>
  );
}

function DeleteBoard({
  board,
  onDeleted,
}: {
  board: Board;
  onDeleted: () => void;
}) {
  const [, navigate] = useLocation();
  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button className="sm:mr-auto" type="button" variant="destructive" />
        }
      >
        Delete board
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {board.title}?</AlertDialogTitle>
          <AlertDialogDescription>
            Its cards and sprints disappear for everyone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              deleteBoard(board);
              onDeleted();
              navigate("/", { replace: true });
            }}
            variant="destructive"
          >
            Delete board
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

interface BoardFormProps {
  board?: Board;
  /** The board's labels, once loaded, for its settings to edit. */
  labels?: BoardLabel[];
  projects: Project[];
  /** Project a new board starts in. */
  project?: Project;
  onDone: () => void;
}

/** What the form starts with: the board's settings, or a blank board in `project`. */
function initialDraft(
  board: Board | undefined,
  project: Project | undefined,
  choices: Project[]
) {
  if (board) {
    return { ...board, cardDefaults: board.cardDefaults ?? NO_CARD_DEFAULTS };
  }
  return {
    cardDefaults: NO_CARD_DEFAULTS,
    description: "",
    projectId: project?._id ?? choices[0]?._id,
    statuses: [...DEFAULT_STATUSES],
    title: "",
    usesSprints: false,
  };
}

/** Everyone on a project, who the board's new cards can go to once it's there. */
function peopleIn(projects: Project[], projectId?: Id<"projects">) {
  const project = projects.find((item) => item._id === projectId);
  return project ? project.members.map((member) => member.userId) : [];
}

/** Creates the board or saves its settings; resolves with its code once saved. */
function saveBoard(
  board: Board | undefined,
  draft: BoardDraft,
  labels?: LabelChanges,
  cardDefaults?: CardDefaults
) {
  return board
    ? updateBoard(board, { ...draft, cardDefaults, labels })
    : createBoard(draft);
}

function BoardForm({
  board,
  labels,
  projects,
  project,
  onDone,
}: BoardFormProps) {
  const id = useId();
  const [, navigate] = useLocation();
  // Boards only go in projects the person can add to; a board already elsewhere stays.
  const choices = projects.filter(
    (item) => canEdit(item) || item._id === board?.projectId
  );
  // Only read on the first render, as the starting values.
  const initial = initialDraft(board, project, choices);
  const [title, setTitle] = useState(initial.title);
  // A new board's key follows its name until typed.
  const [typedCode, setTypedCode] = useState(board?.code);
  const [description, setDescription] = useState(initial.description);
  const [projectId, setProjectId] = useState(initial.projectId);
  const [usesSprints, setUsesSprints] = useState(initial.usesSprints ?? false);
  const [statuses, setStatuses] = useState(initial.statuses);
  const labelsDraft = useLabelsDraft(labels);
  const [cardDefaults, setCardDefaults] = useState(initial.cardDefaults);
  const [saving, setSaving] = useState(false);
  const taken = useTakenCodes(board?._id);
  const code = typedCode ?? suggestCode(title, taken);

  const keyError = codeError(code, taken, board?.code);
  const valid =
    title.trim() !== "" &&
    code !== "" &&
    !keyError &&
    projectId !== undefined &&
    workableStatuses(statuses) &&
    !labelsDraft.problem;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!(valid && projectId)) {
      return;
    }
    const draft = {
      code,
      description: description.trim(),
      projectId,
      statuses,
      title: title.trim(),
      usesSprints,
    };
    setSaving(true);
    const saved = await saveBoard(
      board,
      draft,
      labelsDraft.changes,
      cardDefaults
    );
    setSaving(false);
    if (!saved) {
      return;
    }
    onDone();
    const target = choices.find((item) => item._id === projectId);
    if (target && saved.code !== board?.code) {
      navigate(boardPath(target, saved), { replace: board !== undefined });
    }
  };

  return (
    <form className="flex flex-col gap-5" onSubmit={submit}>
      <DialogHeader>
        <DialogTitle>{board ? "Board settings" : "New board"}</DialogTitle>
      </DialogHeader>

      <div className="grid grid-cols-[1fr_7.5rem] gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-title`}>Name</Label>
          <Input
            autoComplete="off"
            autoFocus={!board}
            id={`${id}-title`}
            onChange={(event) => setTitle(event.target.value)}
            value={title}
          />
        </div>
        <KeyField error={keyError} onChange={setTypedCode} value={code} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-description`}>Description</Label>
        <Textarea
          id={`${id}-description`}
          onChange={(event) => setDescription(event.target.value)}
          value={description}
        />
      </div>

      {projectId && choices.length > 1 && (
        <ProjectField
          onChange={setProjectId}
          projects={choices}
          value={projectId}
        />
      )}

      <p className="text-muted-foreground -mt-1 text-xs">
        Everyone on the project sees the board; whoever can edit the project can
        work on its cards.
      </p>

      <label
        className="flex cursor-pointer items-center gap-3 select-none"
        htmlFor={`${id}-sprints`}
      >
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-sm font-medium" id={`${id}-sprints-label`}>
            Sprints
          </span>
          <span
            className="text-muted-foreground text-xs"
            id={`${id}-sprints-hint`}
          >
            Plan work in sprints, from a backlog.
          </span>
        </span>
        <Switch
          aria-describedby={`${id}-sprints-hint`}
          aria-labelledby={`${id}-sprints-label`}
          checked={usesSprints}
          id={`${id}-sprints`}
          onCheckedChange={setUsesSprints}
        />
      </label>

      <StatusesField onChange={setStatuses} value={statuses} />

      {labelsDraft.editor && <LabelsEditor {...labelsDraft.editor} />}

      {labelsDraft.current && (
        <CardDefaultsField
          labels={labelsDraft.current}
          onChange={setCardDefaults}
          people={peopleIn(choices, projectId)}
          value={cardDefaults}
        />
      )}

      <DialogFooter className="mt-1">
        {board && <DeleteBoard board={board} onDeleted={onDone} />}
        <DialogClose render={<Button type="button" variant="ghost" />}>
          Cancel
        </DialogClose>
        <Button disabled={!valid || saving} type="submit">
          {saving && <Spinner />}
          {board ? "Save" : "Create board"}
        </Button>
      </DialogFooter>
    </form>
  );
}

type BoardDialogProps = Omit<BoardFormProps, "onDone"> & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function BoardDialog({
  open,
  onOpenChange,
  ...props
}: BoardDialogProps) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent showCloseButton={false}>
        <BoardForm {...props} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
