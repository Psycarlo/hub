import { Combobox } from "@base-ui/react/combobox";
import type { Id } from "@convex/_generated/dataModel";
import { cn } from "cn";
import { CheckIcon, ChevronDownIcon, PlusIcon } from "lucide-react";
import { useState } from "react";

import { FIELD } from "@/components/ui/input";
import { nextLabelColor } from "@/features/card/card-fields";
import { LabelDot } from "@/features/card/card-parts";
import { shortId } from "@/lib/crm";
import type { Category } from "@/lib/finance";
import { MAX_CATEGORIES, MAX_CATEGORY_NAME, categoryOf } from "@/lib/finance";
import { addCategory } from "@/lib/finance-actions";
import { labelKey } from "@/lib/model";

const ITEM =
  "group/choice data-highlighted:bg-accent data-highlighted:text-accent-foreground flex h-8 cursor-default items-center gap-2.5 rounded-lg px-2 text-sm outline-none select-none";

/** Filing an entry under no category. */
interface NoCategory {
  none: true;
}

/** A category to make from what was typed. */
interface NewCategory {
  create: string;
}

type Choice = Category | NoCategory | NewCategory;

const NONE: NoCategory = { none: true };

function choiceKey(choice: Choice): string {
  if ("none" in choice) {
    return "none";
  }
  return "create" in choice ? "create" : choice.id;
}

function choiceName(choice: Choice): string {
  if ("none" in choice) {
    return "No category";
  }
  return "create" in choice ? choice.create : choice.name;
}

/**
 * Without a search, no category and then every one; with one, the matches
 * and a new category when none is named exactly that.
 */
function choices(categories: readonly Category[], query: string): Choice[] {
  const needle = labelKey(query);
  if (!needle) {
    return [NONE, ...categories];
  }
  const matches: Choice[] = categories
    .filter((category) => labelKey(category.name).includes(needle))
    .toSorted(
      (a, b) =>
        Number(!labelKey(a.name).startsWith(needle)) -
        Number(!labelKey(b.name).startsWith(needle))
    );
  const named = categories.some(
    (category) => labelKey(category.name) === needle
  );
  if (!(named || categories.length >= MAX_CATEGORIES)) {
    matches.push({ create: query.trim() });
  }
  return matches;
}

function ChoiceItem({ choice }: { choice: Choice }) {
  if ("create" in choice) {
    return (
      <Combobox.Item className={ITEM} value={choice}>
        <PlusIcon
          aria-hidden
          className="text-muted-foreground size-4 shrink-0"
        />
        <span className="truncate">
          <span className="text-muted-foreground">Create category: </span>
          {`“${choice.create}”`}
        </span>
      </Combobox.Item>
    );
  }
  return (
    <Combobox.Item className={ITEM} value={choice}>
      {"none" in choice ? (
        <span
          aria-hidden
          className="border-muted-foreground/50 size-2 shrink-0 rounded-full border border-dashed"
        />
      ) : (
        <LabelDot color={choice.color} />
      )}
      <span
        className={cn(
          "flex-1 truncate",
          "none" in choice && "text-muted-foreground"
        )}
      >
        {choiceName(choice)}
      </span>
      <CheckIcon
        aria-hidden
        className="text-foreground size-4 shrink-0 opacity-0 group-data-selected/choice:opacity-100"
      />
    </Combobox.Item>
  );
}

interface CategoryPickerProps {
  id?: string;
  projectId: Id<"projects">;
  categories: readonly Category[];
  /** The category's id; one deleted since reads as none. */
  value: string | undefined;
  /** Called with no id for no category. */
  onChange: (category?: string) => void;
}

/** Picks the category an entry is filed under, or makes one from a name. */
export function CategoryPicker({
  id,
  projectId,
  categories,
  value,
  onChange,
}: CategoryPickerProps) {
  const [query, setQuery] = useState("");
  const picked: Choice = categoryOf(categories, value) ?? NONE;

  const pick = (choice: Choice | null) => {
    if (!choice || "none" in choice) {
      onChange();
    } else if ("create" in choice) {
      const category = {
        color: nextLabelColor(categories),
        id: shortId(),
        name: choice.create.slice(0, MAX_CATEGORY_NAME),
      };
      addCategory(projectId, category);
      onChange(category.id);
    } else {
      onChange(choice.id);
    }
    setQuery("");
  };

  return (
    <Combobox.Root
      autoHighlight
      filter={null}
      inputValue={query}
      isItemEqualToValue={(a: Choice, b: Choice) =>
        choiceKey(a) === choiceKey(b)
      }
      itemToStringLabel={choiceName}
      items={choices(categories, query)}
      onInputValueChange={setQuery}
      onValueChange={pick}
      value={picked}
    >
      <Combobox.Trigger
        className={cn(
          FIELD,
          "data-popup-open:border-ring flex h-9 items-center gap-2 text-left select-none"
        )}
        id={id}
      >
        {"none" in picked ? (
          <span className="text-muted-foreground flex-1 truncate">
            No category
          </span>
        ) : (
          <>
            <LabelDot color={(picked as Category).color} />
            <span className="flex-1 truncate">{choiceName(picked)}</span>
          </>
        )}
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
          <Combobox.Popup className="bg-popover text-popover-foreground shadow-raised flex max-h-[min(22rem,var(--available-height))] w-(--anchor-width) min-w-56 origin-(--transform-origin) flex-col overflow-hidden rounded-xl transition-[opacity,scale] duration-150 ease-out outline-none data-ending-style:scale-[0.96] data-ending-style:opacity-0 data-ending-style:duration-100 data-starting-style:scale-[0.96] data-starting-style:opacity-0">
            <Combobox.Input
              aria-label="Search or add categories"
              autoCapitalize="off"
              autoCorrect="off"
              className="border-border placeholder:text-muted-foreground h-10 shrink-0 border-b bg-transparent px-3 text-base outline-none md:text-sm"
              maxLength={MAX_CATEGORY_NAME}
              placeholder="Search or create…"
              spellCheck={false}
            />
            <Combobox.Empty className="text-muted-foreground px-3 py-5 text-center text-sm text-balance empty:hidden">
              {`No categories match “${query.trim()}”.`}
            </Combobox.Empty>
            <Combobox.List className="min-h-0 overflow-y-auto overscroll-contain p-1 empty:hidden">
              {(choice: Choice) => (
                <ChoiceItem choice={choice} key={choiceKey(choice)} />
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}
