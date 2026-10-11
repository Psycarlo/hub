import { cn } from "cn";
import type { ChangeEvent, ReactNode } from "react";
import { useRef, useState } from "react";

import { addBrandFiles } from "@/lib/brand-actions";
import type { Brand, BrandPlace } from "@/lib/brands";

/**
 * A chapter of the brand's guidelines: its number and name over a title,
 * with what it covers and an action beside.
 */
export function ShowcaseSection({
  number,
  eyebrow,
  title,
  description,
  action,
  children,
}: {
  number: number;
  eyebrow: string;
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-muted-foreground flex items-center gap-2 text-xs font-medium tracking-wide uppercase">
            <span className="text-foreground/40 font-mono tabular-nums">
              {String(number).padStart(2, "0")}
            </span>
            <span aria-hidden className="bg-foreground/15 h-px w-5" />
            {eyebrow}
          </p>
          <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
          {description && (
            <p className="text-muted-foreground max-w-xl text-sm text-pretty">
              {description}
            </p>
          )}
        </div>
        {action && <div className="flex items-center gap-2">{action}</div>}
      </div>
      {children}
    </section>
  );
}

/** A dashed place to add something, for whoever can. */
export function AddPlaceholder({
  icon,
  title,
  hint,
  onClick,
  className,
}: {
  icon: ReactNode;
  title: string;
  hint?: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      className={cn(
        "border-foreground/15 text-muted-foreground hover:border-foreground/30 hover:text-foreground hover:bg-foreground/[0.02] focus-visible:ring-ring/50 flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed p-6 text-center text-sm transition-colors duration-150 ease-out outline-none focus-visible:ring-3 [&_svg]:size-5",
        className
      )}
      onClick={onClick}
      type="button"
    >
      {icon}
      <span className="text-foreground font-medium">{title}</span>
      {hint && <span className="text-xs">{hint}</span>}
    </button>
  );
}

/**
 * A hidden file input and a way to open it: spread `inputProps` on an
 * `<input>`, then call `open`.
 */
export function useFilePicker(
  onFiles: (files: File[]) => void,
  { accept, multiple = true }: { accept?: string; multiple?: boolean } = {}
) {
  const ref = useRef<HTMLInputElement>(null);
  const inputProps = {
    accept,
    "aria-hidden": true,
    className: "sr-only",
    multiple,
    onChange: (event: ChangeEvent<HTMLInputElement>) => {
      const picked = [...(event.target.files ?? [])];
      event.target.value = "";
      if (picked.length > 0) {
        onFiles(picked);
      }
    },
    ref,
    tabIndex: -1,
    type: "file" as const,
  };
  return { inputProps, open: () => ref.current?.click() };
}

/** Uploads to a place in the brand, saying while it's busy. */
export function useBrandUpload(brand: Brand, place: BrandPlace) {
  const [busy, setBusy] = useState(false);
  const add = async (files: File[]) => {
    setBusy(true);
    await addBrandFiles(brand, place, files);
    setBusy(false);
  };
  return { add, busy };
}
