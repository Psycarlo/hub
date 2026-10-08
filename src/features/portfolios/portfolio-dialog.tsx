import type { FormEvent } from "react";
import { useId, useState } from "react";
import { useLocation } from "wouter";

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
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  portfolioPath,
  portfoliosPath,
} from "@/features/portfolios/portfolio-context";
import type { Portfolio } from "@/lib/portfolio";
import {
  createPortfolio,
  deletePortfolio,
  updatePortfolio,
} from "@/lib/portfolio-actions";
import type { Project } from "@/lib/project";

function DeletePortfolio({
  project,
  portfolio,
  onDeleted,
}: {
  project: Project;
  portfolio: Portfolio;
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
        Delete portfolio
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {portfolio.title}?</AlertDialogTitle>
          <AlertDialogDescription>
            Its transactions disappear for everyone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              deletePortfolio(portfolio);
              onDeleted();
              navigate(portfoliosPath(project), { replace: true });
            }}
            variant="destructive"
          >
            Delete portfolio
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

interface PortfolioFormProps {
  project: Project;
  /** The portfolio to change; a new one starts otherwise. */
  portfolio?: Portfolio;
  onDone: () => void;
}

function PortfolioForm({ project, portfolio, onDone }: PortfolioFormProps) {
  const id = useId();
  const [, navigate] = useLocation();
  const [title, setTitle] = useState(portfolio?.title ?? "");
  const [description, setDescription] = useState(portfolio?.description ?? "");
  const [excludedFromTotal, setExcludedFromTotal] = useState(
    portfolio?.excludedFromTotal ?? false
  );
  const [saving, setSaving] = useState(false);
  const valid = title.trim() !== "";

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!valid) {
      return;
    }
    const draft = {
      description: description.trim(),
      excludedFromTotal,
      title: title.trim(),
    };
    if (portfolio) {
      updatePortfolio(portfolio, draft);
      onDone();
      return;
    }
    setSaving(true);
    const portfolioId = await createPortfolio(project._id, draft);
    setSaving(false);
    if (portfolioId) {
      onDone();
      navigate(
        portfolioPath(project, { _id: portfolioId, title: draft.title })
      );
    }
  };

  return (
    <form className="flex flex-col gap-5" onSubmit={submit}>
      <DialogHeader>
        <DialogTitle>
          {portfolio ? "Portfolio settings" : "New portfolio"}
        </DialogTitle>
      </DialogHeader>

      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-title`}>Name</Label>
        <Input
          autoComplete="off"
          autoFocus={!portfolio}
          id={`${id}-title`}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Savings"
          value={title}
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

      <p className="text-muted-foreground -mt-1 text-xs">
        Everyone on the project sees the portfolio; whoever can edit the project
        can add transactions.
      </p>

      <label
        className="flex cursor-pointer items-center gap-3 select-none"
        htmlFor={`${id}-excluded`}
      >
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-sm font-medium" id={`${id}-excluded-label`}>
            Leave out of total
          </span>
          <span
            className="text-muted-foreground text-xs"
            id={`${id}-excluded-hint`}
          >
            Its holdings don’t count toward the project’s portfolios together.
          </span>
        </span>
        <Switch
          aria-describedby={`${id}-excluded-hint`}
          aria-labelledby={`${id}-excluded-label`}
          checked={excludedFromTotal}
          id={`${id}-excluded`}
          onCheckedChange={setExcludedFromTotal}
        />
      </label>

      <DialogFooter className="mt-1">
        {portfolio && (
          <DeletePortfolio
            onDeleted={onDone}
            portfolio={portfolio}
            project={project}
          />
        )}
        <DialogClose render={<Button type="button" variant="ghost" />}>
          Cancel
        </DialogClose>
        <Button disabled={!valid || saving} type="submit">
          {saving && <Spinner />}
          {portfolio ? "Save" : "Create portfolio"}
        </Button>
      </DialogFooter>
    </form>
  );
}

type PortfolioDialogProps = Omit<PortfolioFormProps, "onDone"> & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function PortfolioDialog({
  open,
  onOpenChange,
  ...props
}: PortfolioDialogProps) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent showCloseButton={false}>
        <PortfolioForm {...props} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
