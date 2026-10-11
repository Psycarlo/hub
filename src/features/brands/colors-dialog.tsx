import { ArrowDownIcon, ArrowUpIcon, PlusIcon, XIcon } from "lucide-react";
import type { FormEvent } from "react";
import { useState } from "react";

import { HexColorPicker } from "@/components/hex-color-picker";
import { IconButton } from "@/components/icon-button";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { updateBrand } from "@/lib/brand-actions";
import type { Brand, BrandColor } from "@/lib/brands";
import { MAX_COLORS, MAX_COLOR_NAME, newId } from "@/lib/brands";
import { mixHex, parseHex } from "@/lib/color";
import type { HexColor } from "@/lib/palette";

/** Where a new color starts: the last one, a little lighter, or the hub's blue. */
function nextColor(colors: BrandColor[]): HexColor {
  const last = colors.at(-1)?.hex;
  return last ? mixHex(last, "#ffffff", 0.35) : "#2563eb";
}

/** A color's hex as it's typed, kept apart until it reads as one. */
function HexField({
  value,
  onChange,
  label,
}: {
  value: HexColor;
  onChange: (hex: HexColor) => void;
  label: string;
}) {
  const [text, setText] = useState(value);
  const [shown, setShown] = useState(value);
  // Picked in the popover rather than typed: show it.
  if (value !== shown) {
    setShown(value);
    setText(value);
  }
  return (
    <Input
      aria-label={label}
      autoComplete="off"
      className="w-28 font-mono uppercase"
      onBlur={() => setText(value)}
      onChange={(event) => {
        setText(event.target.value as HexColor);
        const hex = parseHex(event.target.value);
        if (hex) {
          setShown(hex);
          onChange(hex);
        }
      }}
      spellCheck={false}
      value={text}
    />
  );
}

function ColorsForm({ brand, onDone }: { brand: Brand; onDone: () => void }) {
  // A first row to fill in, when there are none yet.
  const [colors, setColors] = useState<BrandColor[]>(() =>
    brand.colors.length > 0
      ? brand.colors
      : [{ hex: nextColor([]), id: newId(), name: "" }]
  );
  const [saving, setSaving] = useState(false);

  const change = (id: string, patch: Partial<BrandColor>) =>
    setColors(
      colors.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  const move = (index: number, by: number) => {
    const next = [...colors];
    const [item] = next.splice(index, 1);
    if (item) {
      next.splice(index + by, 0, item);
      setColors(next);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    const saved = await updateBrand(brand, {
      colors: colors.map((color) => ({ ...color, name: color.name.trim() })),
    });
    setSaving(false);
    if (saved !== undefined) {
      onDone();
    }
  };

  return (
    <form className="flex flex-col gap-5" onSubmit={submit}>
      <DialogHeader>
        <DialogTitle>Colors</DialogTitle>
        <DialogDescription>
          In order of how much they lead: the first is the brand’s main color.
        </DialogDescription>
      </DialogHeader>

      <ol className="flex flex-col gap-2">
        {colors.map((color, index) => {
          const label = color.name || `Color ${index + 1}`;
          return (
            <li className="flex items-center gap-2" key={color.id}>
              <Popover>
                <PopoverTrigger
                  aria-label={`Pick ${label}`}
                  className="image-outline focus-visible:ring-ring/50 size-9 shrink-0 rounded-lg outline-none focus-visible:ring-3"
                  style={{ background: color.hex }}
                />
                <PopoverContent
                  aria-label={`Pick ${label}`}
                  className="rounded-2xl"
                  sideOffset={8}
                >
                  <HexColorPicker
                    onChange={(hex) => change(color.id, { hex })}
                    value={color.hex}
                  />
                </PopoverContent>
              </Popover>
              <Input
                aria-label={`Name of color ${index + 1}`}
                autoComplete="off"
                className="min-w-0 flex-1"
                maxLength={MAX_COLOR_NAME}
                onChange={(event) =>
                  change(color.id, { name: event.target.value })
                }
                placeholder={index === 0 ? "Primary" : "Name"}
                value={color.name}
              />
              <HexField
                label={`Hex of ${label}`}
                onChange={(hex) => change(color.id, { hex })}
                value={color.hex}
              />
              <div className="flex shrink-0 items-center max-sm:hidden">
                <IconButton
                  disabled={index === 0}
                  label="Move up"
                  onClick={() => move(index, -1)}
                  size="icon-xs"
                  type="button"
                >
                  <ArrowUpIcon />
                </IconButton>
                <IconButton
                  disabled={index === colors.length - 1}
                  label="Move down"
                  onClick={() => move(index, 1)}
                  size="icon-xs"
                  type="button"
                >
                  <ArrowDownIcon />
                </IconButton>
              </div>
              <IconButton
                label={`Remove ${label}`}
                onClick={() =>
                  setColors(colors.filter((item) => item.id !== color.id))
                }
                size="icon-sm"
                type="button"
              >
                <XIcon />
              </IconButton>
            </li>
          );
        })}
      </ol>

      {colors.length < MAX_COLORS && (
        <Button
          className="self-start"
          onClick={() =>
            setColors([
              ...colors,
              { hex: nextColor(colors), id: newId(), name: "" },
            ])
          }
          size="sm"
          type="button"
          variant="outline"
        >
          <PlusIcon />
          Add color
        </Button>
      )}

      <DialogFooter className="mt-1">
        <DialogClose render={<Button type="button" variant="ghost" />}>
          Cancel
        </DialogClose>
        <Button disabled={saving} type="submit">
          {saving && <Spinner />}
          Save
        </Button>
      </DialogFooter>
    </form>
  );
}

export function ColorsDialog({
  brand,
  open,
  onOpenChange,
}: {
  brand: Brand;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        className="max-h-[90dvh] overflow-y-auto sm:max-w-xl"
        showCloseButton={false}
      >
        <ColorsForm brand={brand} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
