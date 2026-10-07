import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { cn } from "cn";
import { useQuery } from "convex/react";
import { useId } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CODE, MAX_CODE, RESERVED_CODES } from "@/lib/model";

/** How another board holds a code: as its code now, or one its old links use. */
type Holding = "current" | "former";

/** Codes the other boards hold, across the hub. */
export function useTakenCodes(
  except?: Id<"boards">
): ReadonlyMap<string, Holding> {
  const boards = useQuery(api.boards.codes) ?? [];
  const taken = new Map<string, Holding>();
  for (const board of boards) {
    if (board._id === except) {
      continue;
    }
    for (const code of board.formerCodes) {
      taken.set(code, "former");
    }
    taken.set(board.code, "current");
  }
  return taken;
}

export function cleanCode(value: string): string {
  return value
    .toUpperCase()
    .replaceAll(/[^A-Z0-9]/gu, "")
    .slice(0, MAX_CODE);
}

/** Why a typed code can't be saved, or null when it can. */
export function codeError(
  code: string,
  taken: ReadonlyMap<string, Holding>,
  /** The board's code as saved, which stays fine even from before the cap. */
  saved?: string
): string | null {
  if (code === "" || code === saved) {
    return null;
  }
  if (!CODE.test(code)) {
    return "Start with a letter.";
  }
  if (RESERVED_CODES.has(code)) {
    return "The app uses this code.";
  }
  const holding = taken.get(code);
  if (holding === "current") {
    return "Another board uses this code.";
  }
  if (holding === "former") {
    return "Another board’s old links use this code.";
  }
  return null;
}

/** The key cards are numbered with, for a two-column grid beside the name. */
export function KeyField({
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
