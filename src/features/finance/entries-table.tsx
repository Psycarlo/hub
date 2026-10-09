import { cn } from "cn";
import { format, parseISO } from "date-fns";
import type { MouseEvent } from "react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { LabelChip, LabelDot } from "@/features/card/card-parts";
import { Amount, BuyBadge, PaidToggle } from "@/features/finance/finance-parts";
import type { Account, Category, Entry } from "@/lib/finance";
import { categoryOf, isOverdue } from "@/lib/finance";

interface EntriesTableProps {
  account: Account;
  /** In the order they fall in the month. */
  entries: Entry[];
  categories: readonly Category[];
  today: string;
  editable: boolean;
  /** What each linked debit bought, by entry id. */
  buys: ReadonlyMap<string, string>;
  /** Every account the person can see, to name where transfers go and come from. */
  accountTitles: ReadonlyMap<string, string>;
  /** Opens an entry to change it; rows stay still without it. */
  onOpen?: (entry: Entry) => void;
}

/** The month's entries as rows: settled or not, when, what, under what, and how much. */
export function EntriesTable({
  account,
  entries,
  categories,
  today,
  editable,
  buys,
  accountTitles,
  onOpen,
}: EntriesTableProps) {
  const open = (event: MouseEvent<HTMLTableRowElement>, entry: Entry) => {
    if (
      !onOpen ||
      (event.target as Element).closest("a, button, [role=checkbox]")
    ) {
      return;
    }
    onOpen(entry);
  };
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10 pr-0">
            <span className="sr-only">Paid</span>
          </TableHead>
          <TableHead className="w-24">Date</TableHead>
          <TableHead>Name</TableHead>
          <TableHead className="max-sm:hidden">Category</TableHead>
          <TableHead className="max-lg:hidden">Note</TableHead>
          <TableHead className="text-right">Amount</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((entry) => {
          const category = categoryOf(categories, entry.category);
          const overdue = isOverdue(entry, today);
          const bought = buys.get(entry._id);
          const other =
            entry.transfer &&
            (accountTitles.get(entry.transfer.accountId) ?? "another account");
          const date = (
            <time dateTime={entry.date}>
              {format(parseISO(entry.date), "MMM d")}
            </time>
          );
          return (
            <TableRow
              className={cn(
                onOpen && "hover:bg-foreground/[0.025] cursor-pointer"
              )}
              key={entry._id}
              onClick={(event) => open(event, entry)}
            >
              <TableCell className="pr-0">
                <PaidToggle editable={editable} entry={entry} />
              </TableCell>
              <TableCell
                className={cn(
                  "tabular-nums",
                  overdue ? "text-destructive" : "text-muted-foreground"
                )}
              >
                {overdue && <span className="sr-only">Overdue, </span>}
                {onOpen ? (
                  // The row's click, reachable by keyboard too.
                  <button
                    className="focus-visible:ring-ring/50 -mx-1.5 rounded-md px-1.5 py-0.5 outline-none focus-visible:ring-3"
                    onClick={() => onOpen(entry)}
                    type="button"
                  >
                    {date}
                  </button>
                ) : (
                  date
                )}
              </TableCell>
              <TableCell className="w-full max-w-0 min-w-36">
                <span className="flex min-w-0 items-center gap-2">
                  {category && (
                    <LabelDot className="sm:hidden" color={category.color} />
                  )}
                  <span
                    className={cn(
                      "truncate font-medium",
                      !entry.paid && "text-muted-foreground"
                    )}
                  >
                    {entry.name}
                  </span>
                  {other && (
                    <span className="text-muted-foreground truncate">
                      {entry.kind === "debit" ? "to" : "from"} {other}
                    </span>
                  )}
                  {bought && <BuyBadge>{bought}</BuyBadge>}
                </span>
              </TableCell>
              <TableCell className="max-sm:hidden">
                {category ? (
                  <LabelChip label={category} />
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="text-muted-foreground max-w-56 truncate max-lg:hidden">
                {entry.note}
              </TableCell>
              <TableCell className="text-right font-medium">
                <Amount currency={account.currency} entry={entry} />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
