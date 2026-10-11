import { PlusIcon, XIcon } from "lucide-react";
import type { FormEvent } from "react";
import { useId, useState } from "react";
import { useLocation } from "wouter";

import { IconButton } from "@/components/icon-button";
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
import { Textarea } from "@/components/ui/textarea";
import { brandPath, brandsPath } from "@/features/brands/brands-context";
import { normalizeLink, platformOf } from "@/features/brands/platforms";
import { SocialIcon } from "@/features/brands/social-icon";
import { createBrand, deleteBrand, updateBrand } from "@/lib/brand-actions";
import type { Brand } from "@/lib/brands";
import { MAX_SOCIALS, newId } from "@/lib/brands";
import type { Project } from "@/lib/project";

function DeleteBrand({
  project,
  brand,
  onDeleted,
}: {
  project: Project;
  brand: Brand;
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
        Delete brand
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {brand.title}?</AlertDialogTitle>
          <AlertDialogDescription>
            Its logos, banners and font files disappear for everyone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              deleteBrand(brand);
              onDeleted();
              navigate(brandsPath(project), { replace: true });
            }}
            variant="destructive"
          >
            Delete brand
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

interface Social {
  id: string;
  link: string;
}

/** The brand's profiles elsewhere, each with its platform's icon as it's typed. */
function SocialsField({
  socials,
  onChange,
}: {
  socials: Social[];
  onChange: (socials: Social[]) => void;
}) {
  const id = useId();
  const change = (key: string, link: string) =>
    onChange(
      socials.map((item) => (item.id === key ? { ...item, link } : item))
    );
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-medium">Social links</legend>
      {socials.map((social, index) => {
        const platform = platformOf(social.link);
        return (
          <div className="relative flex items-center gap-1" key={social.id}>
            <span className="pointer-events-none absolute left-3 flex size-4 items-center justify-center">
              <SocialIcon className="size-4" platform={platform} />
            </span>
            <Input
              aria-label={platform ? platform.name : `Link ${index + 1}`}
              autoComplete="off"
              className="pl-9"
              id={`${id}-${social.id}`}
              inputMode="url"
              onChange={(event) => change(social.id, event.target.value)}
              placeholder="instagram.com/yourbrand"
              value={social.link}
            />
            <IconButton
              label="Remove link"
              onClick={() =>
                onChange(socials.filter((item) => item.id !== social.id))
              }
              type="button"
            >
              <XIcon />
            </IconButton>
          </div>
        );
      })}
      {socials.length < MAX_SOCIALS && (
        <Button
          className="self-start"
          onClick={() => onChange([...socials, { id: newId(), link: "" }])}
          size="sm"
          type="button"
          variant="ghost"
        >
          <PlusIcon />
          Add link
        </Button>
      )}
    </fieldset>
  );
}

interface BrandFormProps {
  project: Project;
  /** The brand to change; a new one starts otherwise. */
  brand?: Brand;
  /** Whether whoever's here may delete it. */
  manageable?: boolean;
  onDone: () => void;
}

function BrandForm({
  project,
  brand,
  manageable = false,
  onDone,
}: BrandFormProps) {
  const id = useId();
  const [, navigate] = useLocation();
  const [title, setTitle] = useState(brand?.title ?? "");
  const [description, setDescription] = useState(brand?.description ?? "");
  const [website, setWebsite] = useState(brand?.website ?? "");
  const [socials, setSocials] = useState<Social[]>(() =>
    (brand?.socials ?? []).map((link) => ({ id: newId(), link }))
  );
  const [saving, setSaving] = useState(false);
  const valid = title.trim() !== "";

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!valid) {
      return;
    }
    const draft = { description: description.trim(), title: title.trim() };
    setSaving(true);
    if (brand) {
      const links = socials
        .map((item) => normalizeLink(item.link))
        .filter(Boolean);
      // Kept open on a link the server turns down, so it can be fixed.
      const saved = await updateBrand(brand, {
        ...draft,
        socials: links,
        website: website.trim(),
      });
      setSaving(false);
      if (saved !== undefined) {
        onDone();
      }
      return;
    }
    const brandId = await createBrand(project._id, draft);
    setSaving(false);
    if (brandId) {
      onDone();
      navigate(brandPath(project, { _id: brandId, title: draft.title }));
    }
  };

  return (
    <form className="flex flex-col gap-5" onSubmit={submit}>
      <DialogHeader>
        <DialogTitle>{brand ? "Brand details" : "New brand"}</DialogTitle>
      </DialogHeader>

      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-title`}>Name</Label>
        <Input
          autoComplete="off"
          autoFocus={!brand}
          id={`${id}-title`}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Acme"
          value={title}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-description`}>Description</Label>
        <Textarea
          id={`${id}-description`}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="What the brand stands for, in a line or two."
          value={description}
        />
      </div>

      {brand && (
        <>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${id}-website`}>Website</Label>
            <div className="relative flex items-center">
              <span className="pointer-events-none absolute left-3 flex size-4">
                <SocialIcon className="size-4" website />
              </span>
              <Input
                autoComplete="off"
                className="pl-9"
                id={`${id}-website`}
                inputMode="url"
                onChange={(event) => setWebsite(event.target.value)}
                placeholder="yourbrand.com"
                value={website}
              />
            </div>
          </div>
          <SocialsField onChange={setSocials} socials={socials} />
        </>
      )}

      {!brand && (
        <p className="text-muted-foreground -mt-1 text-xs">
          Add its logos, colors, typefaces and links once it’s made.
        </p>
      )}

      <DialogFooter className="mt-1">
        {brand && manageable && (
          <DeleteBrand brand={brand} onDeleted={onDone} project={project} />
        )}
        <DialogClose render={<Button type="button" variant="ghost" />}>
          Cancel
        </DialogClose>
        <Button disabled={!valid || saving} type="submit">
          {saving && <Spinner />}
          {brand ? "Save" : "Create brand"}
        </Button>
      </DialogFooter>
    </form>
  );
}

type BrandDialogProps = Omit<BrandFormProps, "onDone"> & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function BrandDialog({
  open,
  onOpenChange,
  ...props
}: BrandDialogProps) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        className="max-h-[90dvh] overflow-y-auto"
        showCloseButton={false}
      >
        <BrandForm {...props} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
