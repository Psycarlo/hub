import type { Id } from "@convex/_generated/dataModel";
import type { FormEvent } from "react";
import { useState } from "react";

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
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { LabelsEditor, useLabelsDraft } from "@/features/boards/labels-editor";
import type { Category } from "@/lib/finance";
import { updateCategories } from "@/lib/finance-actions";

function CategoriesForm({
  projectId,
  categories,
  onDone,
}: {
  projectId: Id<"projects">;
  /** The project's categories, once loaded. */
  categories?: Category[];
  onDone: () => void;
}) {
  const draft = useLabelsDraft(categories, "category");
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (draft.problem) {
      return;
    }
    if (!draft.changes) {
      onDone();
      return;
    }
    setSaving(true);
    const saved = await updateCategories(projectId, draft.changes);
    setSaving(false);
    if (saved !== undefined) {
      onDone();
    }
  };

  return (
    <form className="flex flex-col gap-5" onSubmit={submit}>
      <DialogHeader>
        <DialogTitle>Categories</DialogTitle>
        <DialogDescription>
          Shared by every account in the project. Deleting one leaves its
          entries without a category.
        </DialogDescription>
      </DialogHeader>
      {draft.editor ? (
        <LabelsEditor {...draft.editor} noun="category" />
      ) : (
        <div aria-busy className="flex flex-col gap-1">
          <Skeleton className="h-8 rounded-lg" />
          <Skeleton className="h-8 rounded-lg" />
          <Skeleton className="h-8 rounded-lg" />
        </div>
      )}
      <DialogFooter className="mt-1">
        <DialogClose render={<Button type="button" variant="ghost" />}>
          Cancel
        </DialogClose>
        <Button disabled={Boolean(draft.problem) || saving} type="submit">
          {saving && <Spinner />}
          Save
        </Button>
      </DialogFooter>
    </form>
  );
}

type CategoriesDialogProps = Omit<
  Parameters<typeof CategoriesForm>[0],
  "onDone"
> & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** The project's categories: renamed, recolored, added or deleted. */
export function CategoriesDialog({
  open,
  onOpenChange,
  ...props
}: CategoriesDialogProps) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent showCloseButton={false}>
        <CategoriesForm {...props} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
