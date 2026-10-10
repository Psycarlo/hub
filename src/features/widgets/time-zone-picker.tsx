import { Combobox } from "@base-ui/react/combobox";
import { cn } from "cn";
import { CheckIcon, ChevronDownIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { FIELD } from "@/components/ui/input";
import type { Zone } from "@/lib/time-zones";
import {
  cityOf,
  formatOffset,
  listZones,
  localTimeZone,
  offsetOf,
} from "@/lib/time-zones";

const ITEM =
  "group/choice data-highlighted:bg-accent data-highlighted:text-accent-foreground flex h-8 cursor-default items-center gap-2 rounded-lg px-2 text-sm outline-none select-none";

/** Following the device's own time zone, wherever it goes. */
interface Local {
  local: true;
}

type Choice = Local | Zone;

const LOCAL: Local = { local: true };
const LOCAL_NAME = "Your time zone";

/** Listed the first time they're picked from, then kept. */
let zones: Zone[] | undefined;

function allZones(): Zone[] {
  zones ??= listZones(Date.now());
  return zones;
}

function choiceKey(choice: Choice): string {
  return "local" in choice ? "local" : choice.id;
}

function choiceName(choice: Choice): string {
  return "local" in choice ? LOCAL_NAME : choice.city;
}

/** A line beside the city: what the zone is called, or else where it is. */
function aside(zone: Zone): string {
  if (zone.name && !zone.name.startsWith("GMT")) {
    return zone.name;
  }
  return zone.id.split("/").slice(0, -1).join(" / ").replaceAll("_", " ");
}

/**
 * Without a search, the device's own zone and then every one by city; with
 * one, the zones it's found in by city, name, IANA name or offset, those
 * whose city starts with it first.
 */
function choices(query: string): Choice[] {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return [LOCAL, ...allZones()];
  }
  const starts = (zone: Zone) => zone.city.toLowerCase().startsWith(needle);
  const matches: Choice[] = allZones()
    .filter((zone) =>
      [
        zone.city,
        zone.name,
        zone.id.replaceAll("_", " "),
        formatOffset(zone.offset),
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle)
    )
    .toSorted((a, b) => Number(!starts(a)) - Number(!starts(b)));
  return LOCAL_NAME.toLowerCase().includes(needle)
    ? [LOCAL, ...matches]
    : matches;
}

function ChoiceItem({
  choice,
  localOffset,
}: {
  choice: Choice;
  /** The device's own zone's offset, which the choice following it shows. */
  localOffset: number;
}) {
  const local = "local" in choice;
  return (
    <Combobox.Item className={ITEM} value={choice}>
      <span className="min-w-0 flex-1 truncate">
        {choiceName(choice)}
        <span className="text-muted-foreground">
          {" "}
          {local ? cityOf(localTimeZone()) : aside(choice)}
        </span>
      </span>
      <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
        {formatOffset(local ? localOffset : choice.offset)}
      </span>
      <CheckIcon
        aria-hidden
        className="text-foreground size-4 shrink-0 opacity-0 group-data-selected/choice:opacity-100"
      />
    </Combobox.Item>
  );
}

interface TimeZonePickerProps {
  /** The label naming the field. */
  labelledBy?: string;
  /** An IANA time zone; none follows the device's own. */
  value: string | undefined;
  onChange: (timeZone?: string) => void;
}

/** Picks a time zone by its city, or the device's own, searched as typed. */
export function TimeZonePicker({
  labelledBy,
  value,
  onChange,
}: TimeZonePickerProps) {
  const [query, setQuery] = useState("");
  // Every zone is only listed once the picker first opens.
  const [listed, setListed] = useState(false);
  // Offsets as of when it last opened; they only move twice a year.
  const [now, setNow] = useState(Date.now);
  const localOffset = offsetOf(localTimeZone(), now);
  const picked = useMemo<Choice>(
    () =>
      value ? { city: cityOf(value), id: value, name: "", offset: 0 } : LOCAL,
    [value]
  );
  return (
    <Combobox.Root
      autoHighlight
      filter={null}
      inputValue={query}
      isItemEqualToValue={(a: Choice, b: Choice) =>
        choiceKey(a) === choiceKey(b)
      }
      itemToStringLabel={choiceName}
      items={listed ? choices(query) : [picked]}
      onInputValueChange={setQuery}
      onOpenChange={(next: boolean) => {
        if (next) {
          setListed(true);
          setNow(Date.now());
        }
      }}
      onValueChange={(choice: Choice | null) => {
        if (choice) {
          onChange("local" in choice ? undefined : choice.id);
        }
        setQuery("");
      }}
      value={picked}
    >
      <Combobox.Trigger
        aria-labelledby={labelledBy}
        className={cn(
          FIELD,
          "data-popup-open:border-ring flex h-9 items-center gap-2 text-left select-none"
        )}
      >
        <span className="min-w-0 flex-1 truncate">
          {value ? cityOf(value) : LOCAL_NAME}
        </span>
        <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
          {formatOffset(value ? offsetOf(value, now) : localOffset)}
        </span>
        <ChevronDownIcon
          aria-hidden
          className="text-muted-foreground size-4 shrink-0"
        />
      </Combobox.Trigger>
      <Combobox.Portal>
        <Combobox.Positioner
          align="start"
          className="isolate z-50"
          sideOffset={6}
        >
          <Combobox.Popup className="bg-popover text-popover-foreground shadow-raised flex max-h-[min(22rem,var(--available-height))] w-(--anchor-width) min-w-64 origin-(--transform-origin) flex-col overflow-hidden rounded-xl transition-[opacity,scale] duration-150 ease-out outline-none data-ending-style:scale-[0.96] data-ending-style:opacity-0 data-ending-style:duration-100 data-starting-style:scale-[0.96] data-starting-style:opacity-0">
            <Combobox.Input
              aria-label="Search time zones"
              autoCapitalize="off"
              autoCorrect="off"
              className="border-border placeholder:text-muted-foreground h-10 shrink-0 border-b bg-transparent px-3 text-base outline-none md:text-sm"
              placeholder="Search a city or zone…"
              spellCheck={false}
            />
            <Combobox.Empty className="text-muted-foreground px-3 py-5 text-center text-sm text-balance empty:hidden">
              {`No time zones match “${query.trim()}”.`}
            </Combobox.Empty>
            <Combobox.List className="min-h-0 overflow-y-auto overscroll-contain p-1 empty:hidden">
              {(choice: Choice) => (
                <ChoiceItem
                  choice={choice}
                  key={choiceKey(choice)}
                  localOffset={localOffset}
                />
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}
