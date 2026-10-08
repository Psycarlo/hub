import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Board, Card } from "@/lib/model";
import { plural, readStorage, writeStorage } from "@/lib/utils";

const DAY = 24 * 60 * 60_000;

/** How far back the done column reaches. Done cards pile up, so older ones stay out of sight. */
const DONE_WINDOWS = [
  { label: "Last day", span: DAY, value: "day" },
  { label: "Last week", span: 7 * DAY, value: "week" },
  { label: "Last month", span: 30 * DAY, value: "month" },
  { label: "All", span: undefined, value: "all" },
] as const;

export type DoneWindow = (typeof DONE_WINDOWS)[number]["value"];

const DEFAULT_WINDOW: DoneWindow = "week";

function windowKey(board: Pick<Board, "_id">): string {
  return `board:${board._id}:done`;
}

function storedWindow(board: Pick<Board, "_id">): DoneWindow {
  const stored = readStorage(windowKey(board));
  return (
    DONE_WINDOWS.find((item) => item.value === stored)?.value ?? DEFAULT_WINDOW
  );
}

/** The board's done window, remembered on this device. */
export function useDoneWindow(
  board: Pick<Board, "_id">
): [DoneWindow, (value: DoneWindow) => void] {
  const [value, setValue] = useState(() => storedWindow(board));
  const change = (next: DoneWindow) => {
    setValue(next);
    writeStorage(windowKey(board), next === DEFAULT_WINDOW ? null : next);
  };
  return [value, change];
}

/** Whether the window leaves the card out: done, and before the window reaches. */
export function outsideWindow(card: Card, value: DoneWindow): boolean {
  const span = DONE_WINDOWS.find((item) => item.value === value)?.span;
  return (
    span !== undefined &&
    card.status === "done" &&
    card.doneAt !== undefined &&
    card.doneAt < Date.now() - span
  );
}

interface HiddenCardsProps {
  /** How many cards the window leaves out. */
  hidden: number;
  value: DoneWindow;
  onChange: (value: DoneWindow) => void;
}

/**
 * How many cards the display options leave out, and the options themselves.
 * Stays while the window is changed, so it can be changed back.
 */
export function HiddenCards({ hidden, value, onChange }: HiddenCardsProps) {
  const id = useId();
  if (hidden === 0 && value === DEFAULT_WINDOW) {
    return null;
  }
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm">
      <p>
        {hidden === 0 ? (
          <span className="text-muted-foreground">
            No cards hidden by display options
          </span>
        ) : (
          <>
            <span className="font-medium tabular-nums">
              {plural(hidden, "card")}
            </span>{" "}
            <span className="text-muted-foreground">
              hidden by display options
            </span>
          </>
        )}
      </p>
      <Popover>
        <PopoverTrigger render={<Button size="sm" variant="ghost" />}>
          Show options
        </PopoverTrigger>
        <PopoverContent className="flex w-64 flex-col gap-3">
          <h3 className="font-medium">Display options</h3>
          <div className="flex flex-col gap-1.5">
            <Label className="text-muted-foreground text-xs" htmlFor={id}>
              Done cards
            </Label>
            <Select
              items={DONE_WINDOWS}
              onValueChange={(next: DoneWindow | null) => {
                if (next) {
                  onChange(next);
                }
              }}
              value={value}
            >
              <SelectTrigger className="w-full" id={id}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DONE_WINDOWS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
