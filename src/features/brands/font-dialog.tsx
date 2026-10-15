import { Autocomplete } from "@base-ui/react/autocomplete";
import { cn } from "cn";
import {
  CheckIcon,
  FileTypeIcon,
  SearchXIcon,
  UploadIcon,
  XIcon,
} from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useId, useMemo, useState } from "react";

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
import { FIELD, Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useFilePicker } from "@/features/brands/brand-parts";
import {
  addBrandFiles,
  removeBrandFile,
  updateBrand,
} from "@/lib/brand-actions";
import { findGoogleFamily, loadGoogleFont } from "@/lib/brand-fonts";
import type { Brand, BrandFile, BrandFont, FontSource } from "@/lib/brands";
import {
  EVERY_ROLE,
  FONT_ROLES,
  MAX_FONT_FAMILY,
  MAX_FONT_FILES,
  MAX_FONT_ROLE,
  WEIGHT_NAMES,
  cssFamily,
  faceOfFile,
  fontFiles,
  googleFontsPage,
  namesRole,
  newId,
  roleParts,
} from "@/lib/brands";
import type { ListedFamily } from "@/lib/google-fonts";
import {
  findListedFamily,
  loadGoogleFamilies,
  searchGoogleFamilies,
} from "@/lib/google-fonts";
import { formatBytes } from "@/lib/utils";

const ACCEPT = ".woff2,.woff,.otf,.ttf,font/woff2,font/woff,font/otf,font/ttf";
/** Weights picked for a new Google family, as far as it has them. */
const STARTING_WEIGHTS = new Set([400, 500, 600, 700]);
/** How long typing rests before Google is asked. */
const LOOKUP_MS = 450;

const SUGGESTION =
  "data-highlighted:bg-accent data-highlighted:text-accent-foreground flex h-8 cursor-default items-center gap-2 rounded-lg px-2 text-sm outline-none select-none";

const SOURCES: { source: FontSource; label: string }[] = [
  { label: "Google Fonts", source: "google" },
  { label: "Upload files", source: "file" },
];

type Lookup =
  | { state: "idle" }
  | { state: "looking" }
  | { state: "found"; family: string; weights: number[] }
  | { state: "missing" };

/** Google's families, loaded once one is first looked for; null should they not load. */
function useGoogleFamilies(active: boolean): ListedFamily[] | null | undefined {
  const [families, setFamilies] = useState<ListedFamily[] | null>();
  useEffect(() => {
    if (!active || families !== undefined) {
      return;
    }
    let current = true;
    const load = async () => {
      try {
        const loaded = await loadGoogleFamilies();
        if (current) {
          setFamilies(loaded);
        }
      } catch {
        if (current) {
          setFamilies(null);
        }
      }
    };
    load();
    return () => {
      current = false;
    };
  }, [active, families]);
  return families;
}

/**
 * Finds the family among Google's, however it's written. One they lack,
 * added since or with no list to look in, is asked of Google once typing rests.
 */
function useGoogleLookup(
  family: string,
  families: ListedFamily[] | null | undefined,
  active: boolean
): Lookup {
  const typed = family.trim();
  const listed =
    active && families ? findListedFamily(families, typed) : undefined;
  const ask = active && typed !== "" && families !== undefined && !listed;
  // What Google said, and for which name: an answer for another is still on its way.
  const [answer, setAnswer] = useState<{
    typed: string;
    found: { family: string; weights: number[] } | null;
  }>();
  useEffect(() => {
    if (listed) {
      loadGoogleFont(listed.family, listed.weights);
    }
  }, [listed]);
  useEffect(() => {
    if (!ask) {
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const found = await findGoogleFamily(typed, controller.signal);
      if (controller.signal.aborted) {
        return;
      }
      if (found) {
        loadGoogleFont(found.family, found.weights);
      }
      setAnswer({ found, typed });
    }, LOOKUP_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [ask, typed]);
  if (!(active && typed)) {
    return { state: "idle" };
  }
  if (listed) {
    return { family: listed.family, state: "found", weights: listed.weights };
  }
  if (families === undefined || answer?.typed !== typed) {
    return { state: "looking" };
  }
  return answer.found
    ? { state: "found", ...answer.found }
    : { state: "missing" };
}

function LookupStatus({ lookup }: { lookup: Lookup }) {
  if (lookup.state === "looking") {
    return (
      <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
        <Spinner className="size-3.5" />
        Looking it up on Google Fonts…
      </p>
    );
  }
  if (lookup.state === "found") {
    return (
      <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
        <CheckIcon className="size-3.5 text-green-600 dark:text-green-400" />
        <a
          className="hover:text-foreground underline-offset-2 hover:underline"
          href={googleFontsPage(lookup.family)}
          rel="noreferrer"
          target="_blank"
        >
          {lookup.family} on Google Fonts
        </a>
        <span aria-hidden>·</span>
        {lookup.weights.length} weights
      </p>
    );
  }
  if (lookup.state === "missing") {
    return (
      <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
        <SearchXIcon className="size-3.5" />
        Not on Google Fonts. Check the spelling, or upload its files.
      </p>
    );
  }
  return null;
}

/** The family as typed, with Google's families like it to pick from. */
function GoogleFamilyField({
  id,
  autoFocus,
  families,
  value,
  onChange,
}: {
  id: string;
  autoFocus: boolean;
  families: ListedFamily[] | null | undefined;
  value: string;
  onChange: (family: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const suggestions = useMemo(
    () => (families ? searchGoogleFamilies(families, value) : []),
    [families, value]
  );
  return (
    <Autocomplete.Root
      autoHighlight
      filter={null}
      itemToStringValue={(item: ListedFamily) => item.family}
      items={suggestions}
      onOpenChange={setOpen}
      onValueChange={onChange}
      // Nothing like it leaves the status below to say so.
      open={open && suggestions.length > 0}
      openOnInputClick
      value={value}
    >
      <Autocomplete.Input
        autoCapitalize="off"
        autoCorrect="off"
        autoFocus={autoFocus}
        className={cn(FIELD, "h-9")}
        id={id}
        maxLength={MAX_FONT_FAMILY}
        placeholder="Inter"
        spellCheck={false}
      />
      <Autocomplete.Portal>
        <Autocomplete.Positioner className="isolate z-50" sideOffset={6}>
          <Autocomplete.Popup className="bg-popover text-popover-foreground shadow-raised max-h-[min(18rem,var(--available-height))] w-(--anchor-width) origin-(--transform-origin) overflow-y-auto overscroll-contain rounded-xl p-1 transition-[opacity,scale] duration-150 ease-out outline-none data-ending-style:scale-[0.96] data-ending-style:opacity-0 data-ending-style:duration-100 data-starting-style:scale-[0.96] data-starting-style:opacity-0">
            <Autocomplete.List>
              {(item: ListedFamily) => (
                <Autocomplete.Item
                  className={SUGGESTION}
                  key={item.family}
                  value={item}
                >
                  <span className="min-w-0 flex-1 truncate">{item.family}</span>
                  <span className="text-muted-foreground shrink-0 text-xs">
                    {item.category}
                  </span>
                </Autocomplete.Item>
              )}
            </Autocomplete.List>
          </Autocomplete.Popup>
        </Autocomplete.Positioner>
      </Autocomplete.Portal>
    </Autocomplete.Root>
  );
}

/** Files kept and picked, with the weight each is read as. */
function FilesField({
  kept,
  picked,
  onRemoveKept,
  onRemovePicked,
  onPick,
}: {
  kept: BrandFile[];
  picked: File[];
  onRemoveKept: (file: BrandFile) => void;
  onRemovePicked: (file: File) => void;
  onPick: (files: File[]) => void;
}) {
  const picker = useFilePicker(onPick, { accept: ACCEPT });
  const rows = [
    ...kept.map((file) => ({
      key: file._id,
      name: file.name,
      remove: () => onRemoveKept(file),
      size: file.size,
    })),
    ...picked.map((file, index) => ({
      key: `new-${index}-${file.name}`,
      name: file.name,
      remove: () => onRemovePicked(file),
      size: file.size,
    })),
  ];
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">Files</span>
      <input {...picker.inputProps} />
      {rows.length > 0 && (
        <ul className="bg-muted/60 flex flex-col rounded-xl p-1">
          {rows.map((row) => {
            const face = faceOfFile(row.name);
            return (
              <li
                className="flex items-center gap-3 rounded-lg py-1 pr-1 pl-3 text-sm"
                key={row.key}
              >
                <FileTypeIcon className="text-muted-foreground size-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{row.name}</span>
                <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                  {WEIGHT_NAMES[face.weight] ?? face.weight}
                  {face.style === "italic" ? " Italic" : ""} ·{" "}
                  {formatBytes(row.size)}
                </span>
                <IconButton
                  label={`Remove ${row.name}`}
                  onClick={() => row.remove()}
                  size="icon-xs"
                  type="button"
                >
                  <XIcon />
                </IconButton>
              </li>
            );
          })}
        </ul>
      )}
      {rows.length < MAX_FONT_FILES && (
        <Button
          className="self-start"
          onClick={() => picker.open()}
          size="sm"
          type="button"
          variant="outline"
        >
          <UploadIcon />
          Add WOFF2, WOFF, OTF or TTF
        </Button>
      )}
      <p className="text-muted-foreground text-xs">
        Weights are read from file names, like Inter-SemiBold.woff2.
      </p>
    </div>
  );
}

function DeleteFont({
  brand,
  font,
  onDeleted,
}: {
  brand: Brand;
  font: BrandFont;
  onDeleted: () => void;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button className="sm:mr-auto" type="button" variant="destructive" />
        }
      >
        Remove
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove {font.family}?</AlertDialogTitle>
          <AlertDialogDescription>
            {font.source === "file"
              ? "Its files are deleted for everyone."
              : "It comes off the brand for everyone."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              updateBrand(brand, {
                fonts: brand.fonts.filter((item) => item.id !== font.id),
              });
              onDeleted();
            }}
            variant="destructive"
          >
            Remove
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Google Fonts or uploaded files, side by side. */
function SourceSwitch({
  value,
  onChange,
}: {
  value: FontSource;
  onChange: (source: FontSource) => void;
}) {
  return (
    <ToggleGroup
      aria-label="Where it comes from"
      className="bg-foreground/5 grid grid-cols-2 gap-0 rounded-full p-0.5"
      onValueChange={(next) => {
        // Pressing the current one again would unpress it; it stays.
        if (next[0]) {
          onChange(next[0] as FontSource);
        }
      }}
      value={[value]}
    >
      {SOURCES.map((item) => (
        <ToggleGroupItem
          className="text-muted-foreground data-pressed:bg-card data-pressed:text-foreground data-pressed:shadow-surface h-8 rounded-full text-sm font-medium transition-[background-color,color,box-shadow] duration-150 ease-out"
          key={item.source}
          value={item.source}
        >
          {item.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

/** The weights Google has of the family, each set in itself, pressed when used. */
function WeightsField({
  available,
  value,
  family,
  onChange,
}: {
  available: number[];
  value: number[];
  family?: string;
  onChange: (weights: number[]) => void;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium" id={id}>
        Weights used
      </span>
      <ToggleGroup
        aria-labelledby={id}
        className="flex-wrap gap-1.5"
        multiple
        onValueChange={(next) =>
          onChange(next.map(Number).toSorted((a, b) => a - b))
        }
        value={value.map(String)}
      >
        {available.map((weight) => (
          <ToggleGroupItem
            className="border-foreground/10 text-muted-foreground data-pressed:border-primary data-pressed:bg-primary/8 data-pressed:text-foreground h-8 rounded-full border px-3 text-sm transition-colors duration-150 ease-out"
            key={weight}
            style={{ fontFamily: family, fontWeight: weight }}
            value={String(weight)}
          >
            {WEIGHT_NAMES[weight] ?? weight}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}

/**
 * The role with a usual part picked or dropped. Everything stands alone; the
 * others keep their usual order, with any typed ones after.
 */
function toggleRole(role: string, part: string): string {
  if (part === EVERY_ROLE) {
    return namesRole(role, EVERY_ROLE) ? "" : EVERY_ROLE;
  }
  const rest = roleParts(role).filter(
    (item) => !(namesRole(item, part) || namesRole(item, EVERY_ROLE))
  );
  if (namesRole(role, part)) {
    return rest.join(", ");
  }
  const usual = FONT_ROLES.filter(
    (item) => item === part || rest.some((typed) => namesRole(typed, item))
  );
  const typed = rest.filter(
    (item) => !FONT_ROLES.some((usualPart) => namesRole(item, usualPart))
  );
  return [...usual, ...typed].join(", ");
}

/** What the typeface is for, typed or picked from the usual ones, as many as it serves. */
function RoleField({
  value,
  onChange,
}: {
  value: string;
  onChange: (role: string) => void;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>Used for</Label>
      <Input
        autoComplete="off"
        id={id}
        maxLength={MAX_FONT_ROLE}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Headings, Body"
        value={value}
      />
      <div className="flex flex-wrap gap-1">
        {[EVERY_ROLE, ...FONT_ROLES].map((item) => {
          const pressed = namesRole(value, item);
          return (
            <button
              aria-pressed={pressed}
              className={cn(
                "focus-visible:ring-ring/50 h-6 rounded-full px-2.5 text-xs transition-colors duration-150 ease-out outline-none focus-visible:ring-3",
                pressed
                  ? "bg-foreground text-background"
                  : "bg-foreground/5 text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
              )}
              key={item}
              onClick={() => onChange(toggleRole(value, item))}
              type="button"
            >
              {item}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The weights kept of what Google has: as picked, else the usual ones it
 * has, else whatever comes first.
 */
function keptWeights(
  available: number[],
  picked: number[] | undefined
): number[] {
  if (picked) {
    return picked.filter((weight) => available.includes(weight));
  }
  const usual = available.filter((weight) => STARTING_WEIGHTS.has(weight));
  return usual.length > 0 ? usual : available.slice(0, 1);
}

/** The brand's typefaces with this one changed, or added at the end. */
function withFont(brand: Brand, next: BrandFont): BrandFont[] {
  return brand.fonts.some((item) => item.id === next.id)
    ? brand.fonts.map((item) => (item.id === next.id ? next : item))
    : [...brand.fonts, next];
}

/** Takes off the files removed, then uploads the ones picked. */
async function syncFiles(
  brand: Brand,
  fontId: string,
  removed: BrandFile[],
  picked: File[]
): Promise<void> {
  for (const file of removed) {
    // oxlint-disable-next-line no-await-in-loop -- few, and taken off before new ones count against the limit
    await removeBrandFile(brand, file);
  }
  if (picked.length > 0) {
    await addBrandFiles(brand, { fontId, kind: "font" }, picked);
  }
}

interface FontFormProps {
  brand: Brand;
  files: BrandFile[];
  /** The typeface to change; a new one starts otherwise. */
  font?: BrandFont;
  onDone: () => void;
}

/** What the form holds about the typeface, and what follows from it. */
function useFontDraft(brand: Brand, files: BrandFile[], font?: BrandFont) {
  const [source, setSource] = useState<FontSource>(font?.source ?? "google");
  const [family, setFamily] = useState(font?.family ?? "");
  const [role, setRole] = useState(
    font?.role ?? (brand.fonts.length === 0 ? "Headings" : "")
  );
  const [picked, setPicked] = useState<number[] | undefined>(font?.weights);
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const google = source === "google";
  const families = useGoogleFamilies(google);
  const lookup = useGoogleLookup(family, families, google);
  const found = lookup.state === "found" ? lookup : undefined;
  const available = found?.weights ?? [];
  const weights = keptWeights(available, picked);
  const valid = google
    ? found !== undefined && weights.length > 0
    : family.trim() !== "";
  /** The typeface as it'll be kept. */
  const next: BrandFont = {
    family: found?.family ?? family.trim(),
    id: font?.id ?? newId(),
    role: role.trim(),
    source,
    weights: google ? weights : [],
  };
  return {
    available,
    families,
    family,
    found,
    google,
    kept: fontFiles(files, next.id).filter(
      (file) => !removed.includes(file._id)
    ),
    lookup,
    newFiles,
    next,
    removed: files.filter((file) => removed.includes(file._id)),
    role,
    setFamily,
    setNewFiles,
    setPicked,
    setRemoved: (file: BrandFile) => setRemoved([...removed, file._id]),
    setRole,
    setSource,
    source,
    valid,
    weights,
  };
}

function FontForm({ brand, files, font, onDone }: FontFormProps) {
  const id = useId();
  const draft = useFontDraft(brand, files, font);
  const [saving, setSaving] = useState(false);
  const { found, google, lookup, newFiles } = draft;
  const previewFamily = found
    ? cssFamily({ family: found.family, id: "", source: "google" })
    : undefined;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft.valid) {
      return;
    }
    setSaving(true);
    const { next } = draft;
    const saved = await updateBrand(brand, { fonts: withFont(brand, next) });
    if (saved !== undefined && !google) {
      await syncFiles(brand, next.id, draft.removed, newFiles);
    }
    setSaving(false);
    if (saved !== undefined) {
      onDone();
    }
  };

  return (
    <form className="flex flex-col gap-5" onSubmit={submit}>
      <DialogHeader>
        <DialogTitle>{font ? "Typeface" : "New typeface"}</DialogTitle>
      </DialogHeader>

      <SourceSwitch
        onChange={(next) => draft.setSource(next)}
        value={draft.source}
      />

      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-family`}>Family</Label>
        {google ? (
          <GoogleFamilyField
            autoFocus={!font}
            families={draft.families}
            id={`${id}-family`}
            onChange={(next) => draft.setFamily(next)}
            value={draft.family}
          />
        ) : (
          <Input
            autoComplete="off"
            autoFocus={!font}
            id={`${id}-family`}
            maxLength={MAX_FONT_FAMILY}
            onChange={(event) => draft.setFamily(event.target.value)}
            placeholder="Your typeface"
            spellCheck={false}
            value={draft.family}
          />
        )}
        {google && <LookupStatus lookup={lookup} />}
      </div>

      {previewFamily && (
        <div
          className="bg-muted/60 flex flex-col gap-1 rounded-xl px-4 py-3"
          style={{ fontFamily: previewFamily }}
        >
          <span className="truncate text-2xl leading-tight">{brand.title}</span>
          <span className="text-muted-foreground text-sm">
            The quick brown fox jumps over the lazy dog
          </span>
        </div>
      )}

      {google && draft.available.length > 0 && (
        <WeightsField
          available={draft.available}
          family={previewFamily}
          onChange={(next) => draft.setPicked(next)}
          value={draft.weights}
        />
      )}

      {!google && (
        <FilesField
          kept={draft.kept}
          onPick={(more) => draft.setNewFiles([...newFiles, ...more])}
          onRemoveKept={(file) => draft.setRemoved(file)}
          onRemovePicked={(file) =>
            draft.setNewFiles(newFiles.filter((item) => item !== file))
          }
          picked={newFiles}
        />
      )}

      <RoleField onChange={(next) => draft.setRole(next)} value={draft.role} />

      <DialogFooter className="mt-1">
        {font && <DeleteFont brand={brand} font={font} onDeleted={onDone} />}
        <DialogClose render={<Button type="button" variant="ghost" />}>
          Cancel
        </DialogClose>
        <Button disabled={!draft.valid || saving} type="submit">
          {saving && <Spinner />}
          {font ? "Save" : "Add typeface"}
        </Button>
      </DialogFooter>
    </form>
  );
}

type FontDialogProps = Omit<FontFormProps, "onDone"> & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function FontDialog({ open, onOpenChange, ...props }: FontDialogProps) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        className="max-h-[90dvh] overflow-y-auto"
        showCloseButton={false}
      >
        <FontForm {...props} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
