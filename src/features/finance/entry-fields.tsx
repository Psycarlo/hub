import { cn } from "cn";
import { addYears, format, parseISO } from "date-fns";
import { CalendarIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

import { Calendar } from "@/components/ui/calendar";
import { FIELD, Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { EntryKind } from "@/lib/finance";
import type { Fiat } from "@/lib/portfolio";
import { fiatSymbol } from "@/lib/portfolio";

/** The earliest month the calendar offers. */
const FIRST_MONTH = new Date(2000, 0, 1);
/** The latest: far enough ahead to plan in, from when the app loaded. */
const LAST_MONTH = addYears(new Date(), 5);

export const HINT = "flex flex-wrap items-center gap-x-2 text-xs tabular-nums";
export const HINT_ACTION = "text-primary font-medium hover:underline";

/** Debit or credit, as a pair of tabs across the form. */
export function KindTabs({
  value,
  onChange,
}: {
  value: EntryKind;
  onChange: (kind: EntryKind) => void;
}) {
  return (
    <Tabs onValueChange={(kind: EntryKind) => onChange(kind)} value={value}>
      <TabsList aria-label="Type" className="w-full">
        <TabsTrigger className="flex-1 justify-center" value="debit">
          Debit
        </TabsTrigger>
        <TabsTrigger className="flex-1 justify-center" value="credit">
          Credit
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}

/** Money in the account's currency, its symbol before the digits. */
export function MoneyField({
  id,
  label = "Amount",
  currency,
  value,
  error,
  hint,
  onChange,
}: {
  id: string;
  label?: string;
  currency: Fiat;
  value: string;
  error?: string;
  hint?: ReactNode;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <span
          aria-hidden
          className="text-muted-foreground pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm"
        >
          {fiatSymbol(currency)}
        </span>
        <Input
          aria-describedby={error || hint ? `${id}-hint` : undefined}
          aria-invalid={error ? true : undefined}
          autoComplete="off"
          className="pl-7 tabular-nums"
          id={id}
          inputMode="decimal"
          onChange={(event) => onChange(event.target.value)}
          placeholder="0.00"
          value={value}
        />
      </div>
      {(error || hint) && (
        <p
          className={cn(
            HINT,
            error ? "text-destructive" : "text-muted-foreground"
          )}
          id={`${id}-hint`}
        >
          {error ?? hint}
        </p>
      )}
    </div>
  );
}

/** A day from a calendar, as `YYYY-MM-DD`. */
export function DayField({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (date: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const day = parseISO(value);
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>Date</Label>
      <Popover onOpenChange={setOpen} open={open}>
        <PopoverTrigger
          className={cn(
            FIELD,
            "flex h-9 items-center justify-between gap-2 text-left select-none"
          )}
          id={id}
        >
          <span className="truncate">{format(day, "EEE, MMM d, yyyy")}</span>
          <CalendarIcon className="text-muted-foreground size-4 shrink-0" />
        </PopoverTrigger>
        <PopoverContent align="start" className="p-2">
          <Calendar
            captionLayout="dropdown"
            defaultMonth={day}
            endMonth={LAST_MONTH}
            mode="single"
            onSelect={(next) => {
              if (next) {
                onChange(format(next, "yyyy-MM-dd"));
                setOpen(false);
              }
            }}
            required
            selected={day}
            startMonth={FIRST_MONTH}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

/** A setting as a line of text with a switch at its end. */
export function SwitchRow({
  id,
  label,
  hint,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label
      className="flex cursor-pointer items-center gap-3 select-none"
      htmlFor={id}
    >
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-sm font-medium" id={`${id}-label`}>
          {label}
        </span>
        <span className="text-muted-foreground text-xs" id={`${id}-hint`}>
          {hint}
        </span>
      </span>
      <Switch
        aria-describedby={`${id}-hint`}
        aria-labelledby={`${id}-label`}
        checked={checked}
        id={id}
        onCheckedChange={onChange}
      />
    </label>
  );
}
