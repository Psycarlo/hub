import { api } from "@convex/_generated/api";
import { cn } from "cn";
import { useQuery } from "convex/react";
import type { FormEvent } from "react";
import { useId, useState } from "react";
import { useLocation } from "wouter";

import { ColorPicker } from "@/components/color-picker";
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
import { Textarea } from "@/components/ui/textarea";
import type { User } from "@/hooks/use-users";
import { useMe } from "@/hooks/use-users";
import type { ProjectDraft } from "@/lib/actions";
import { createProject, deleteProject, updateProject } from "@/lib/actions";
import type { Color } from "@/lib/palette";
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
          aria-describedby={`${id}-hint`}
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
      <p
        className={cn(
          "-mt-1 text-xs",
          taken ? "text-destructive" : "text-muted-foreground"
        )}
        id={`${id}-hint`}
      >
        {taken
          ? "Another project uses this link."
          : "Letters, numbers and hyphens."}
      </p>
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
          placeholder="Website relaunch"
          value={title}
        />
      </div>
      <SlugField onChange={onSlugChange} taken={taken} value={slug} />
    </>
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
    color: project?.color ?? ("blue" as Color),
    description: project?.description ?? "",
    members: project?.members ?? [{ role: "owner" as const, userId: me._id }],
    slug: project?.slug ?? "",
    title: project?.title ?? "",
  };
}

/** Creates the project or saves its settings; resolves with its link once saved. */
function saveProject(project: Project | undefined, draft: ProjectDraft) {
  return project ? updateProject(project, draft) : createProject(draft);
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
  const [color, setColor] = useState<Color>(initial.color);
  const [roster, setRoster] = useState(() => toRoster(initial.members));
  const [saving, setSaving] = useState(false);

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
  const valid = title.trim() !== "" && finalSlug !== "" && !taken;

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
    const saved = await saveProject(project, draft);
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
          <ColorPicker
            aria-labelledby={`${id}-color`}
            onChange={setColor}
            value={color}
          />
        </div>
      )}

      <MembersField
        me={me}
        onChange={setRoster}
        owner={project?.personalFor}
        roster={roster}
      />

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
