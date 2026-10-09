import { cn } from "cn";
import { PlusIcon } from "lucide-react";
import type { FormEvent } from "react";
import { useId, useState } from "react";

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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { LabelChip } from "@/features/card/card-parts";
import { CategoryPicker } from "@/features/finance/category-picker";
import { KindTabs, MoneyField } from "@/features/finance/entry-fields";
import { CREDIT_TEXT } from "@/features/finance/finance-parts";
import type { Account, Category, EntryKind, Recurring } from "@/lib/finance";
import {
  MAX_ENTRY_NAME,
  categoryOf,
  formatMoney,
  moneyText,
  ordinal,
  parseMoney,
  signedCents,
} from "@/lib/finance";
import type { RecurringDraft } from "@/lib/finance-actions";
import {
  createRecurring,
  deleteRecurring,
  updateRecurring,
} from "@/lib/finance-actions";

const DAYS = Array.from({ length: 31 }, (_, index) => ({
  label: ordinal(index + 1),
  value: index + 1,
}));
/** Days some months lack, which then take their last. */
const SHORT_FROM = 29;

interface Fields {
  kind: EntryKind;
  name: string;
  amount: string;
  day: number;
  category?: string;
  note: string;
}

function initialFields(item?: Recurring): Fields {
  if (!item) {
    return { amount: "", day: 1, kind: "debit", name: "", note: "" };
  }
  return {
    amount: moneyText(item.cents),
    category: item.category,
    day: item.day,
    kind: item.kind,
    name: item.name,
    note: item.note,
  };
}

function DeleteRecurring({
  item,
  onDeleted,
}: {
  item: Recurring;
  onDeleted: () => void;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button className="sm:mr-auto" type="button" variant="destructive" />
        }
      >
        Delete
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Stop {item.name} every month?</AlertDialogTitle>
          <AlertDialogDescription>
            Months you start from now on won’t bring it in. It stays in months
            already started.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              deleteRecurring(item);
              onDeleted();
            }}
            variant="destructive"
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function RecurringForm({
  account,
  categories,
  item,
  onDone,
}: {
  account: Account;
  categories: Category[];
  /** The monthly entry to change; a new one starts otherwise. */
  item?: Recurring;
  onDone: () => void;
}) {
  const id = useId();
  const [fields, setFields] = useState(() => initialFields(item));
  const [saving, setSaving] = useState(false);
  const cents = parseMoney(fields.amount);
  const valid = fields.name.trim() !== "" && cents !== undefined;
  const change = (patch: Partial<Fields>) =>
    setFields((current) => ({ ...current, ...patch }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!valid) {
      return;
    }
    const draft: RecurringDraft = {
      category: fields.category,
      cents,
      day: fields.day,
      kind: fields.kind,
      name: fields.name.trim(),
      note: fields.note.trim(),
    };
    setSaving(true);
    const saved = item
      ? await updateRecurring(item, draft)
      : await createRecurring(account, draft);
    setSaving(false);
    if (saved !== undefined) {
      onDone();
    }
  };

  return (
    <form className="flex flex-col gap-5" onSubmit={submit}>
      <DialogHeader>
        <DialogTitle>
          {item ? "Edit monthly entry" : "New monthly entry"}
        </DialogTitle>
        <DialogDescription>
          {item
            ? "Changes reach the months you start from now on."
            : "Every month you start brings it in, not paid yet."}
        </DialogDescription>
      </DialogHeader>

      <KindTabs onChange={(kind) => change({ kind })} value={fields.kind} />

      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-name`}>Name</Label>
        <Input
          autoComplete="off"
          autoFocus={!item}
          id={`${id}-name`}
          maxLength={MAX_ENTRY_NAME}
          onChange={(event) => change({ name: event.target.value })}
          placeholder={fields.kind === "debit" ? "Gym membership" : "Salary"}
          value={fields.name}
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-2 sm:gap-3">
        <MoneyField
          currency={account.currency}
          error={
            fields.amount.trim() && cents === undefined
              ? "Enter an amount, like 42.50."
              : undefined
          }
          id={`${id}-amount`}
          onChange={(amount) => change({ amount })}
          value={fields.amount}
        />
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-day`}>Day of the month</Label>
          <Select
            items={DAYS}
            onValueChange={(day: number | null) => {
              if (day) {
                change({ day });
              }
            }}
            value={fields.day}
          >
            <SelectTrigger className="w-full" id={`${id}-day`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-64">
              {DAYS.map((day) => (
                <SelectItem key={day.value} value={day.value}>
                  {day.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {fields.day >= SHORT_FROM && (
            <p className="text-muted-foreground text-xs">
              Shorter months take their last day.
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-category`}>Category</Label>
        <CategoryPicker
          categories={categories}
          id={`${id}-category`}
          onChange={(category) => change({ category })}
          projectId={account.projectId}
          value={fields.category}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-note`}>Note</Label>
        <Textarea
          id={`${id}-note`}
          onChange={(event) => change({ note: event.target.value })}
          placeholder="Optional"
          value={fields.note}
        />
      </div>

      <DialogFooter className="mt-1">
        {item && <DeleteRecurring item={item} onDeleted={onDone} />}
        <Button onClick={onDone} type="button" variant="ghost">
          Back
        </Button>
        <Button disabled={!valid || saving} type="submit">
          {saving && <Spinner />}
          {item ? "Save" : `Add ${fields.kind}`}
        </Button>
      </DialogFooter>
    </form>
  );
}

function RecurringRow({
  item,
  account,
  categories,
  onOpen,
}: {
  item: Recurring;
  account: Account;
  categories: Category[];
  onOpen?: () => void;
}) {
  const category = categoryOf(categories, item.category);
  return (
    <li>
      <button
        className="hover:bg-foreground/5 focus-visible:ring-ring/50 flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors duration-150 ease-out outline-none focus-visible:ring-3 disabled:pointer-events-none"
        disabled={!onOpen}
        onClick={onOpen}
        type="button"
      >
        <span className="bg-muted flex size-9 shrink-0 flex-col items-center justify-center rounded-lg leading-none">
          <span className="text-sm font-semibold tabular-nums">{item.day}</span>
          <span className="text-muted-foreground text-[0.6rem] font-medium uppercase">
            {ordinal(item.day).slice(-2)}
          </span>
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate font-medium">{item.name}</span>
          {category ? (
            <span className="flex">
              <LabelChip label={category} />
            </span>
          ) : (
            <span className="text-muted-foreground text-xs">No category</span>
          )}
        </span>
        <span
          className={cn(
            "shrink-0 font-medium tabular-nums",
            item.kind === "credit" && CREDIT_TEXT
          )}
        >
          {formatMoney(signedCents(item), account.currency, { signed: true })}
        </span>
      </button>
    </li>
  );
}

interface RecurringDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: Account;
  categories: Category[];
  /** The account's monthly entries, by day. */
  items: Recurring[];
  editable: boolean;
}

/** What the account pays or gets every month, and changing it. */
export function RecurringDialog({
  open,
  onOpenChange,
  account,
  categories,
  items,
  editable,
}: RecurringDialogProps) {
  const [editing, setEditing] = useState<Recurring | "new">();
  const item = editing === "new" ? undefined : editing;
  const credits = items
    .filter((other) => other.kind === "credit")
    .reduce((sum, other) => sum + other.cents, 0);
  const debits = items
    .filter((other) => other.kind === "debit")
    .reduce((sum, other) => sum + other.cents, 0);

  return (
    <Dialog
      onOpenChange={(next) => {
        onOpenChange(next);
        if (next) {
          setEditing(undefined);
        }
      }}
      open={open}
    >
      <DialogContent showCloseButton={false}>
        {editing ? (
          <RecurringForm
            account={account}
            categories={categories}
            item={item}
            key={item?._id ?? "new"}
            onDone={() => setEditing(undefined)}
          />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Every month</DialogTitle>
              <DialogDescription>
                Each month you start brings these in, not paid yet, to tick off
                as they’re paid.
              </DialogDescription>
            </DialogHeader>
            {items.length > 0 ? (
              <>
                <ul className="-mx-2 flex flex-col">
                  {items.map((other) => (
                    <RecurringRow
                      account={account}
                      categories={categories}
                      item={other}
                      key={other._id}
                      onOpen={editable ? () => setEditing(other) : undefined}
                    />
                  ))}
                </ul>
                <dl className="bg-muted/60 grid grid-cols-2 gap-3 rounded-xl px-4 py-3 text-sm">
                  <div className="flex flex-col gap-0.5">
                    <dt className="text-muted-foreground text-xs">Comes in</dt>
                    <dd className={cn("font-medium tabular-nums", CREDIT_TEXT)}>
                      {formatMoney(credits, account.currency)}
                    </dd>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <dt className="text-muted-foreground text-xs">Goes out</dt>
                    <dd className="font-medium tabular-nums">
                      {formatMoney(debits, account.currency)}
                    </dd>
                  </div>
                </dl>
              </>
            ) : (
              <p className="bg-muted/60 text-muted-foreground rounded-xl px-4 py-6 text-center text-sm text-balance">
                Rent, salary, a gym membership: anything that comes every month.
              </p>
            )}
            <DialogFooter className="mt-1">
              <DialogClose render={<Button type="button" variant="ghost" />}>
                Close
              </DialogClose>
              {editable && (
                <Button onClick={() => setEditing("new")} type="button">
                  <PlusIcon />
                  Add monthly entry
                </Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
