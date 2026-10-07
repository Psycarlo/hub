import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { cn } from "cn";
import { useQuery } from "convex/react";
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
import { Textarea } from "@/components/ui/textarea";
import type { BoardDraft } from "@/lib/actions";
import { createBoard, deleteBoard, updateBoard } from "@/lib/actions";
import type { Board } from "@/lib/model";
import { CODE, RESERVED_CODES } from "@/lib/model";
import type { Project } from "@/lib/project";
import { canEdit } from "@/lib/project";

const DIACRITICS = /\p{Diacritic}/gu;

function deriveCode(title: string): string {
  const words = title
    .normalize("NFD")
    .replace(DIACRITICS, "")
    .toUpperCase()
    .split(/[^A-Z0-9]+/u)
    .filter(Boolean);
  const code =
    words.length > 1
      ? words.map((word) => word[0]).join("")
      : (words[0] ?? "").slice(0, 4);
  return code.replace(/^\d+/u, "").slice(0, 10);
}

function cleanCode(value: string): string {
  return value
    .toUpperCase()
    .replaceAll(/[^A-Z0-9]/gu, "")
    .slice(0, 10);
}

function validateCode(
  code: string,
  taken: { _id: string; code: string }[],
  board?: Board
): string | null {
  if (code && !CODE.test(code)) {
    return "Start with a letter.";
  }
  if (RESERVED_CODES.has(code)) {
    return "The app uses this code.";
  }
  if (taken.some((item) => item.code === code && item._id !== board?._id)) {
    return "Another board uses this code.";
  }
  return null;
}

function KeyField({
  error,
  onChange,
  value,
}: {
  error: string | null;
  onChange: (value: string) => void;
  value: string;
}) {
  const id = useId();
  const key = value || "KEY";
  return (
    <>
      <div className="flex flex-col gap-2">
        <Label htmlFor={id}>Key</Label>
        <Input
          aria-describedby={`${id}-hint`}
          aria-invalid={error ? true : undefined}
          autoCapitalize="characters"
          autoComplete="off"
          className="font-mono uppercase"
          id={id}
          onChange={(event) => onChange(cleanCode(event.target.value))}
          spellCheck={false}
          value={value}
        />
      </div>
      <p
        className={cn(
          "col-span-2 -mt-1 text-xs",
          error ? "text-destructive" : "text-muted-foreground"
        )}
        id={`${id}-hint`}
      >
        {error ?? `Cards are numbered ${key}-1, ${key}-2, …`}
      </p>
    </>
  );
}

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
    return board;
  }
  return {
    code: "",
    description: "",
    projectId: project?._id ?? choices[0]?._id,
    title: "",
  };
}

/** Creates the board or saves its settings; resolves with its code once saved. */
function saveBoard(board: Board | undefined, draft: BoardDraft) {
  return board ? updateBoard(board, draft) : createBoard(draft);
}

function BoardForm({ board, projects, project, onDone }: BoardFormProps) {
  const id = useId();
  const [, navigate] = useLocation();
  // Boards only go in projects the person can add to; a board already elsewhere stays.
  const choices = projects.filter(
    (item) => canEdit(item) || item._id === board?.projectId
  );
  // Only read on the first render, as the starting values.
  const initial = initialDraft(board, project, choices);
  const [title, setTitle] = useState(initial.title);
  const [code, setCode] = useState(initial.code);
  const [codeEdited, setCodeEdited] = useState(board !== undefined);
  const [description, setDescription] = useState(initial.description);
  const [projectId, setProjectId] = useState(initial.projectId);
  const [saving, setSaving] = useState(false);
  const taken = useQuery(api.boards.codes) ?? [];

  const codeError = validateCode(code, taken, board);
  const valid =
    title.trim() !== "" && code !== "" && !codeError && projectId !== undefined;

  const changeTitle = (value: string) => {
    setTitle(value);
    if (!codeEdited) {
      setCode(deriveCode(value));
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!(valid && projectId)) {
      return;
    }
    const draft = {
      code,
      description: description.trim(),
      projectId,
      title: title.trim(),
    };
    setSaving(true);
    const saved = await saveBoard(board, draft);
    setSaving(false);
    if (!saved) {
      return;
    }
    onDone();
    if (saved.code !== board?.code) {
      navigate(`/${saved.code}`, { replace: board !== undefined });
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
            onChange={(event) => changeTitle(event.target.value)}
            value={title}
          />
        </div>
        <KeyField
          error={codeError}
          onChange={(value) => {
            setCode(value);
            setCodeEdited(true);
          }}
          value={code}
        />
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
