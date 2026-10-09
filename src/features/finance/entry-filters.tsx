import { cn } from "cn";
import { ListFilterIcon, SearchIcon, XIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { LabelDot } from "@/features/card/card-parts";
import type {
  Category,
  Entry,
  EntryFilters,
  EntryKind,
  EntryStatus,
} from "@/lib/finance";
import {
  NO_CATEGORY,
  NO_FILTERS,
  categoryOf,
  filterCount,
} from "@/lib/finance";

interface Option<T extends string> {
  value: T;
  label: ReactNode;
  /** A word for it among the active filters. */
  name: string;
  count: number;
}

const KIND_NAMES: Record<EntryKind, string> = {
  credit: "Credits",
  debit: "Debits",
};

const STATUS_NAMES: Record<EntryStatus, string> = {
  paid: "Paid",
  unpaid: "Unpaid",
};

function kindOptions(entries: Entry[]): Option<EntryKind>[] {
  return (["debit", "credit"] as const).map((value) => ({
    count: entries.filter((entry) => entry.kind === value).length,
    label: KIND_NAMES[value],
    name: KIND_NAMES[value],
    value,
  }));
}

function statusOptions(entries: Entry[]): Option<EntryStatus>[] {
  return (["paid", "unpaid"] as const).map((value) => ({
    count: entries.filter((entry) => entry.paid === (value === "paid")).length,
    label: STATUS_NAMES[value],
    name: STATUS_NAMES[value],
    value,
  }));
}

/** The categories in use, and none when some entries have none. */
function categoryOptions(
  entries: Entry[],
  categories: readonly Category[]
): Option<string>[] {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const id = categoryOf(categories, entry.category)?.id ?? NO_CATEGORY;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const options: Option<string>[] = categories.map((category) => ({
    count: counts.get(category.id) ?? 0,
    label: (
      <span className="flex min-w-0 items-center gap-1.5">
        <LabelDot color={category.color} />
        <span className="truncate">{category.name}</span>
      </span>
    ),
    name: category.name,
    value: category.id,
  }));
  const none = counts.get(NO_CATEGORY) ?? 0;
  if (none > 0) {
    options.push({
      count: none,
      label: <span className="text-muted-foreground">No category</span>,
      name: "No category",
      value: NO_CATEGORY,
    });
  }
  return options.filter((option) => option.count > 0);
}

function FilterGroup<T extends string>({
  title,
  options,
  value,
  onChange,
}: {
  title: string;
  options: Option<T>[];
  value: T[];
  onChange: (value: T[]) => void;
}) {
  if (options.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-col gap-1.5">
      <h3 className="text-muted-foreground px-1 text-xs font-medium">
        {title}
      </h3>
      <ToggleGroup
        aria-label={`Filter by ${title.toLowerCase()}`}
        className="flex-wrap gap-1"
        multiple
        onValueChange={(next) => onChange(next as T[])}
        value={value}
      >
        {options.map((option) => (
          <ToggleGroupItem
            className="hover:bg-foreground/5 data-pressed:bg-primary/15 data-pressed:inset-ring-primary/60 inset-ring-border flex h-7 max-w-full items-center gap-1.5 rounded-full px-2.5 text-xs inset-ring transition-[background-color,box-shadow] duration-150"
            key={option.value}
            value={option.value}
          >
            {option.label}
            <span className="text-muted-foreground tabular-nums">
              {option.count}
            </span>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}

interface EntryFiltersProps {
  /** Every entry of the month, which the counts are of. */
  entries: Entry[];
  categories: readonly Category[];
  filters: EntryFilters;
  onChange: (filters: EntryFilters) => void;
}

/** Search across names, notes and categories. */
export function EntrySearch({
  filters,
  onChange,
}: Pick<EntryFiltersProps, "filters" | "onChange">) {
  return (
    <label className="border-input bg-card focus-within:border-ring focus-within:ring-ring/30 dark:bg-input/30 flex h-9 min-w-0 flex-1 items-center gap-2 rounded-full border px-3 transition-[border-color,box-shadow] focus-within:ring-3 sm:max-w-72">
      <SearchIcon
        aria-hidden
        className="text-muted-foreground size-4 shrink-0"
      />
      <input
        aria-label="Search entries"
        autoComplete="off"
        className="placeholder:text-muted-foreground h-full min-w-0 flex-1 bg-transparent text-base outline-none md:text-sm"
        onChange={(event) =>
          onChange({ ...filters, search: event.target.value })
        }
        placeholder="Search…"
        type="search"
        value={filters.search}
      />
    </label>
  );
}

/** Narrows the month to some kinds, statuses or categories. */
export function FilterButton({
  entries,
  categories,
  filters,
  onChange,
}: EntryFiltersProps) {
  const active = filterCount(filters);
  return (
    <Popover>
      <PopoverTrigger render={<Button variant="outline" />}>
        <ListFilterIcon />
        <span className="max-sm:sr-only">Filter</span>
        {active > 0 && (
          <span className="bg-primary text-primary-foreground -mr-1 flex size-5 items-center justify-center rounded-full text-xs tabular-nums">
            {active}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="flex max-h-(--available-height) w-[min(24rem,calc(100vw-2rem))] flex-col gap-4 overflow-y-auto"
      >
        <FilterGroup
          onChange={(kinds) => onChange({ ...filters, kinds })}
          options={kindOptions(entries)}
          title="Type"
          value={filters.kinds}
        />
        <FilterGroup
          onChange={(statuses) => onChange({ ...filters, statuses })}
          options={statusOptions(entries)}
          title="Status"
          value={filters.statuses}
        />
        <FilterGroup
          onChange={(picked) => onChange({ ...filters, categories: picked })}
          options={categoryOptions(entries, categories)}
          title="Category"
          value={filters.categories}
        />
        {active > 0 && (
          <Button
            className="self-start"
            onClick={() => onChange({ ...NO_FILTERS, search: filters.search })}
            size="sm"
            variant="ghost"
          >
            Clear filters
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}

function ActiveChip({
  title,
  names,
  onRemove,
}: {
  title: string;
  names: string[];
  onRemove: () => void;
}) {
  return (
    <li className="bg-card shadow-surface flex h-8 max-w-full items-center gap-1.5 rounded-full pr-1 pl-3 text-sm">
      <span className="text-muted-foreground shrink-0">{title}</span>
      <span className="min-w-0 truncate">
        {names.map((name, index) => (
          <span key={name}>
            {index > 0 && <span className="text-muted-foreground"> or </span>}
            {name}
          </span>
        ))}
      </span>
      <Button
        aria-label={`Remove ${title.toLowerCase()} filter`}
        className="size-6"
        onClick={onRemove}
        size="icon-xs"
        variant="ghost"
      >
        <XIcon />
      </Button>
    </li>
  );
}

/** The filters in use, each removable on its own. */
export function ActiveFilters({
  categories,
  filters,
  onChange,
  className,
}: Omit<EntryFiltersProps, "entries"> & { className?: string }) {
  if (filterCount(filters) === 0) {
    return null;
  }
  const categoryNames = filters.categories.map(
    (id) => categoryOf(categories, id)?.name ?? "No category"
  );
  return (
    <ul
      aria-label="Filters"
      className={cn("flex flex-wrap items-center gap-1.5", className)}
    >
      {filters.kinds.length > 0 && (
        <ActiveChip
          names={filters.kinds.map((kind) => KIND_NAMES[kind])}
          onRemove={() => onChange({ ...filters, kinds: [] })}
          title="Type"
        />
      )}
      {filters.statuses.length > 0 && (
        <ActiveChip
          names={filters.statuses.map((status) => STATUS_NAMES[status])}
          onRemove={() => onChange({ ...filters, statuses: [] })}
          title="Status"
        />
      )}
      {filters.categories.length > 0 && (
        <ActiveChip
          names={categoryNames}
          onRemove={() => onChange({ ...filters, categories: [] })}
          title="Category"
        />
      )}
    </ul>
  );
}
