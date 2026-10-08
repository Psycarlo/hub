import { api } from "@convex/_generated/api";
import { useQuery } from "convex/react";
import { ChevronRightIcon } from "lucide-react";
import type { FormEvent } from "react";
import { useId, useState } from "react";
import { useLocation } from "wouter";

import { ColorPicker, CustomColorPicker } from "@/components/color-picker";
import { fromRoster, MembersField, toRoster } from "@/components/members-field";
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  codeError,
  KeyField,
  useTakenCodes,
} from "@/features/boards/key-field";
import type { User } from "@/hooks/use-users";
import { useMe } from "@/hooks/use-users";
import type { NewProjectDraft, ProjectDraft } from "@/lib/actions";
import { createProject, deleteProject, updateProject } from "@/lib/actions";
import { suggestCode } from "@/lib/model";
import type { Project } from "@/lib/project";
import { cleanSlugInput, slugify, uniqueSlug } from "@/lib/project";

function DeleteProject({
  project,
  onDeleted,
}: {
  project: Project;
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
        Delete project
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {project.title}?</AlertDialogTitle>
          <AlertDialogDescription>
            Its boards, CRM tables and docs disappear for everyone. This can’t
            be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              deleteProject(project);
              onDeleted();
              navigate("/", { replace: true });
            }}
            variant="destructive"
          >
            Delete project
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function SlugField({
  value,
  taken,
  onChange,
}: {
  value: string;
  taken: boolean;
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>Link</Label>
      <div className="border-input bg-card focus-within:border-ring focus-within:ring-ring/30 has-aria-invalid:border-destructive has-aria-invalid:ring-destructive/20 dark:bg-input/30 flex h-9 items-center rounded-lg border pl-3 transition-[border-color,box-shadow] focus-within:ring-3 has-aria-invalid:ring-3">
        <span className="text-muted-foreground font-mono text-sm select-none">
          /p/
        </span>
        <input
          aria-describedby={taken ? `${id}-error` : undefined}
          aria-invalid={taken ? true : undefined}
          autoCapitalize="off"
          autoComplete="off"
          className="h-full min-w-0 flex-1 bg-transparent pr-3 font-mono text-base outline-none md:text-sm"
          id={id}
          onChange={(event) => onChange(cleanSlugInput(event.target.value))}
          spellCheck={false}
          value={value}
        />
      </div>
      {taken && (
        <p className="text-destructive -mt-1 text-xs" id={`${id}-error`}>
          Another project uses this link.
        </p>
      )}
    </div>
  );
}

function dialogTitle(project: Project | undefined): string {
  if (!project) {
    return "New project";
  }
  return project.personalFor ? "Personal project" : "Project settings";
}

/** The project's name and the link it lives at. */
function NameFields({
  project,
  title,
  slug,
  taken,
  onTitleChange,
  onSlugChange,
}: {
  project?: Project;
  title: string;
  slug: string;
  taken: boolean;
  onTitleChange: (value: string) => void;
  onSlugChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <>
      <div className="flex flex-col gap-2">
        <Label htmlFor={id}>Name</Label>
        <Input
          autoComplete="off"
          autoFocus={!project}
          id={id}
          onChange={(event) => onTitleChange(event.target.value)}
          value={title}
        />
      </div>
      <SlugField onChange={onSlugChange} taken={taken} value={slug} />
    </>
  );
}

/** What a new project's board is called unless renamed. */
const STARTER_TITLE = "Issues";

/**
 * The board a new project starts with; its key follows the project's name,
 * or the board's before there is one, until typed.
 */
function useStarterBoard(projectTitle: string) {
  const taken = useTakenCodes();
  const [enabled, setEnabled] = useState(true);
  const [title, setTitle] = useState(STARTER_TITLE);
  const [typedCode, setTypedCode] = useState<string>();
  const code =
    typedCode ??
    (suggestCode(projectTitle, taken) || suggestCode(title, taken));
  const error = codeError(code, taken);
  return {
    code,
    /** What the project is created with: the board, or nothing when switched off. */
    draft: enabled ? { code, title: title.trim() } : undefined,
    enabled,
    error,
    setCode: setTypedCode,
    setEnabled,
    setTitle,
    title,
    valid: !enabled || (title.trim() !== "" && code !== "" && !error),
  };
}

type StarterBoard = ReturnType<typeof useStarterBoard>;

function StarterBoardField({ board }: { board: StarterBoard }) {
  const id = useId();
  const [customizing, setCustomizing] = useState(false);
  return (
    <div className="flex flex-col">
      <label
        className="flex cursor-pointer items-center gap-3 select-none"
        htmlFor={`${id}-switch`}
      >
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-sm font-medium" id={`${id}-label`}>
            Start with a board
          </span>
          <span className="text-muted-foreground text-xs" id={`${id}-hint`}>
            Plan work as cards from day one.
          </span>
        </span>
        <Switch
          aria-describedby={`${id}-hint`}
          aria-labelledby={`${id}-label`}
          checked={board.enabled}
          id={`${id}-switch`}
          onCheckedChange={(checked) => board.setEnabled(checked)}
        />
      </label>
      <Collapsible open={board.enabled}>
        <CollapsibleContent>
          {/* Stays open while the name or key needs fixing. */}
          <Collapsible
            className="pt-3"
            onOpenChange={setCustomizing}
            open={customizing || !board.valid}
          >
            <CollapsibleTrigger className="group/details text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 relative flex w-full items-center gap-1 rounded-md text-sm transition-colors duration-150 outline-none after:absolute after:inset-x-0 after:-inset-y-1.5 focus-visible:ring-3">
              <ChevronRightIcon
                aria-hidden
                className="size-4 transition-transform duration-200 ease-out group-data-panel-open/details:rotate-90"
              />
              Board name and key
              <span className="ml-auto truncate pl-3 transition-opacity duration-150 group-data-panel-open/details:opacity-0">
                {board.title.trim()} ·{" "}
                <span className="font-mono">{board.code}</span>
              </span>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="grid grid-cols-[1fr_7.5rem] gap-3 pt-3">
                <div className="flex flex-col gap-2">
                  <Label htmlFor={`${id}-title`}>Board name</Label>
                  <Input
                    autoComplete="off"
                    id={`${id}-title`}
                    onChange={(event) => board.setTitle(event.target.value)}
                    value={board.title}
                  />
                </div>
                <KeyField
                  error={board.error}
                  onChange={(value) => board.setCode(value)}
                  value={board.code}
                />
              </div>
            </CollapsibleContent>
          </Collapsible>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

interface ProjectFormProps {
  project?: Project;
  projects: Project[];
  onDone: () => void;
}

/** What the form starts with: the project's settings, or a blank one you own. */
function initialDraft(project: Project | undefined, me: User) {
  return {
    color: project?.color ?? ("blue" as Project["color"]),
    description: project?.description ?? "",
    members: project?.members ?? [{ role: "owner" as const, userId: me._id }],
    slug: project?.slug ?? "",
    title: project?.title ?? "",
  };
}

/** Creates the project, with its starter board if any, or saves its settings; resolves with its link once saved. */
function saveProject(
  project: Project | undefined,
  draft: ProjectDraft,
  board: NewProjectDraft["board"]
) {
  if (project) {
    return updateProject(project, draft);
  }
  return createProject(board ? { ...draft, board } : draft);
}

function ProjectForm({ project, projects, onDone }: ProjectFormProps) {
  const id = useId();
  const me = useMe();
  const [, navigate] = useLocation();
  // Only read on the first render, as the starting values.
  const initial = initialDraft(project, me);
  const [title, setTitle] = useState(initial.title);
  const [slug, setSlug] = useState(initial.slug);
  const [slugEdited, setSlugEdited] = useState(project !== undefined);
  const [description, setDescription] = useState(initial.description);
  const [color, setColor] = useState<Project["color"]>(initial.color);
  const [roster, setRoster] = useState(() => toRoster(initial.members));
  const [saving, setSaving] = useState(false);
  const starter = useStarterBoard(title);

  // Admins see every link in use; others learn of a clash when saving.
  const every = useQuery(api.projects.slugs) ?? [];
  const takenSlugs = new Set(
    [...projects, ...every]
      .filter((item) => item._id !== project?._id)
      .map((item) => item.slug)
  );
  const finalSlug = slugify(slug);
  const taken = takenSlugs.has(finalSlug);
  // A personal project keeps its name and link; only who sees it changes.
  const personal = project?.personalFor !== undefined;
  const valid =
    title.trim() !== "" &&
    finalSlug !== "" &&
    !taken &&
    (project !== undefined || starter.valid);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!valid) {
      return;
    }
    const draft = {
      color,
      description: description.trim(),
      members: fromRoster(roster),
      slug: finalSlug,
      title: title.trim(),
    };
    setSaving(true);
    const saved = await saveProject(project, draft, starter.draft);
    setSaving(false);
    if (!saved) {
      return;
    }
    onDone();
    if (saved.slug !== project?.slug) {
      navigate(`/p/${saved.slug}`, { replace: project !== undefined });
    }
  };

  return (
    <form className="flex flex-col gap-5" onSubmit={submit}>
      <DialogHeader>
        <DialogTitle>{dialogTitle(project)}</DialogTitle>
        {personal && (
          <DialogDescription>
            Only you see your personal project, unless you add people here.
          </DialogDescription>
        )}
      </DialogHeader>

      {!personal && (
        <NameFields
          onSlugChange={(value) => {
            setSlug(value);
            setSlugEdited(true);
          }}
          onTitleChange={(value) => {
            setTitle(value);
            if (!slugEdited) {
              const base = slugify(value);
              setSlug(base && uniqueSlug(base, takenSlugs));
            }
          }}
          project={project}
          slug={slug}
          taken={taken}
          title={title}
        />
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-description`}>Description</Label>
        <Textarea
          id={`${id}-description`}
          onChange={(event) => setDescription(event.target.value)}
          value={description}
        />
      </div>

      {!personal && (
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium select-none" id={`${id}-color`}>
            Color
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <ColorPicker
              aria-labelledby={`${id}-color`}
              onChange={setColor}
              value={color}
            />
            <CustomColorPicker onChange={setColor} value={color} />
          </div>
        </div>
      )}

      <MembersField
        me={me}
        onChange={setRoster}
        owner={project?.personalFor}
        roster={roster}
      />

      {!project && <StarterBoardField board={starter} />}

      <DialogFooter className="mt-1">
        {project && !personal && (
          <DeleteProject onDeleted={onDone} project={project} />
        )}
        <DialogClose render={<Button type="button" variant="ghost" />}>
          Cancel
        </DialogClose>
        <Button disabled={!valid || saving} type="submit">
          {saving && <Spinner />}
          {project ? "Save" : "Create project"}
        </Button>
      </DialogFooter>
    </form>
  );
}

type ProjectDialogProps = Omit<ProjectFormProps, "onDone"> & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function ProjectDialog({
  open,
  onOpenChange,
  ...props
}: ProjectDialogProps) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent showCloseButton={false}>
        <ProjectForm {...props} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
