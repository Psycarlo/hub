import { api } from "@convex/_generated/api";
import { cn } from "cn";
import { useQuery } from "convex/react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  FileTextIcon,
  PaperclipIcon,
  SheetIcon,
} from "lucide-react";
import type { Variants } from "motion/react";
import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { useState } from "react";

import { IconButton } from "@/components/icon-button";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FluidTooltip } from "@/components/ui/fluid-tooltip";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileIcon } from "@/features/drive/file-icon";
import { startExport } from "@/features/finance/export-jobs";
import { DEFAULT_LOOK } from "@/features/finance/wallet-card";
import type { Account } from "@/lib/finance";
import type {
  ExportParts,
  ExportPeriod,
  FinanceExport,
  PeriodUnit,
} from "@/lib/finance-export";
import {
  PERIOD_UNITS,
  exportFileName,
  lastMonth,
  periodLabel,
  periodMonths,
  periodOf,
  periodRange,
  shiftPeriod,
} from "@/lib/finance-export";
import { formatBytes, plural, readStorage, writeStorage } from "@/lib/utils";

/** What was picked last time, to start from next time. */
const PREFERENCE_KEY = "finance-export";

interface Preference {
  unit: PeriodUnit;
  parts: ExportParts;
}

const DEFAULT_PREFERENCE: Preference = {
  parts: { csv: true, files: true, pdf: true },
  unit: "month",
};

function readPreference(): Preference {
  try {
    const stored = JSON.parse(readStorage(PREFERENCE_KEY) ?? "null") as {
      unit?: unknown;
      parts?: Record<string, unknown>;
    } | null;
    const unit = PERIOD_UNITS.find((item) => item === stored?.unit);
    const parts = stored?.parts;
    if (!(unit && parts)) {
      return DEFAULT_PREFERENCE;
    }
    return {
      parts: {
        csv: parts.csv === true,
        files: parts.files === true,
        pdf: parts.pdf === true,
      },
      unit,
    };
  } catch {
    return DEFAULT_PREFERENCE;
  }
}

const UNIT_NAMES: Record<PeriodUnit, string> = {
  month: "Month",
  quarter: "Quarter",
  year: "Year",
};

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

/** The period's name sliding in from the side it was stepped toward. */
const SLIDE: Variants = {
  enter: (direction: number) => ({ opacity: 0, x: direction * 14 }),
  exit: (direction: number) => ({ opacity: 0, x: direction * -14 }),
  show: { opacity: 1, x: 0 },
};

/** The period, stepped back and forth, with the days it runs. */
function PeriodStepper({
  period,
  direction,
  onStep,
}: {
  period: ExportPeriod;
  direction: number;
  onStep: (by: number) => void;
}) {
  const { unit } = period;
  return (
    <FluidTooltip.Group>
      <div className="bg-foreground/4 flex items-center gap-1 rounded-xl p-1">
        <IconButton label={`Previous ${unit}`} onClick={() => onStep(-1)}>
          <ChevronLeftIcon />
        </IconButton>
        <div
          aria-live="polite"
          className="relative flex h-11 min-w-0 flex-1 items-center justify-center overflow-hidden"
        >
          <AnimatePresence custom={direction} initial={false} mode="popLayout">
            <motion.div
              animate="show"
              className="flex flex-col items-center"
              custom={direction}
              exit="exit"
              initial="enter"
              key={`${period.unit}-${period.first}`}
              transition={{ duration: 0.2, ease: EASE_OUT }}
              variants={SLIDE}
            >
              <span className="text-sm font-semibold tabular-nums">
                {periodLabel(period)}
              </span>
              <span className="text-muted-foreground text-xs tabular-nums">
                {periodRange(period)}
              </span>
            </motion.div>
          </AnimatePresence>
        </div>
        <IconButton label={`Next ${unit}`} onClick={() => onStep(1)}>
          <ChevronRightIcon />
        </IconButton>
      </div>
    </FluidTooltip.Group>
  );
}

/** One thing the export can include, picked or not. */
function Part({
  icon,
  title,
  format,
  checked,
  disabled = false,
  onChange,
  children,
}: {
  icon: ReactNode;
  title: string;
  format: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
}) {
  const on = checked && !disabled;
  return (
    <label
      className={cn(
        "flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-[background-color,border-color,opacity] duration-150 ease-out select-none",
        on
          ? "border-primary/35 bg-primary/[0.04]"
          : "hover:bg-foreground/[0.025]",
        disabled && "cursor-default opacity-55 hover:bg-transparent"
      )}
    >
      <span
        className={cn(
          "grid size-9 shrink-0 place-items-center rounded-lg transition-colors duration-150 [&_svg]:size-4.5",
          on
            ? "bg-primary/10 text-primary"
            : "bg-foreground/5 text-muted-foreground"
        )}
      >
        {icon}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-2 text-sm font-medium">
          {title}
          <span className="bg-foreground/6 text-muted-foreground rounded px-1.5 py-px text-[0.625rem] font-semibold tracking-wide">
            {format}
          </span>
        </span>
        <span className="text-muted-foreground text-xs text-pretty">
          {children}
        </span>
      </span>
      <Checkbox
        checked={on}
        disabled={disabled}
        onCheckedChange={(next) => onChange(next)}
      />
    </label>
  );
}

/** What the export comes to with what's picked, in a few words, once the period's counted. */
function describe(
  title: string,
  period: ExportPeriod,
  parts: ExportParts,
  data: FinanceExport | null | undefined
) {
  const files = data?.files;
  // Until the period's files are counted, they're taken to be there.
  const withFiles = parts.files && files?.length !== 0;
  let filesNote = "The invoices and receipts kept on transactions.";
  let contents = "Counting transactions…";
  if (files?.length === 0) {
    filesNote = `None kept on transactions in ${periodLabel(period)}.`;
  } else if (files) {
    const bytes = files.reduce((sum, file) => sum + file.size, 0);
    const folders = period.unit === "month" ? "" : ", in a folder per month";
    filesNote = `${plural(files.length, "file")} · ${formatBytes(bytes)}, named by day${folders}.`;
  }
  if (data) {
    contents = plural(data.entries.length, "transaction");
    if (withFiles) {
      contents += ` · ${plural(data.files.length, "file")}`;
    }
  }
  return {
    contents,
    fileName: exportFileName(title, period, parts, withFiles),
    filesNote,
    ready: parts.pdf || parts.csv || withFiles,
    withFiles,
  };
}

function ExportForm({
  account,
  month,
  onDone,
}: {
  account: Account;
  /** The month the account shows, which the period starts around. */
  month: string;
  onDone: () => void;
}) {
  // oxlint-disable-next-line react/hook-use-state -- read once, never set
  const [preference] = useState(readPreference);
  const [parts, setParts] = useState(preference.parts);
  const [period, setPeriod] = useState(() => periodOf(preference.unit, month));
  const [direction, setDirection] = useState(0);
  const data = useQuery(api.finance.exportData, {
    accountId: account._id,
    first: period.first,
    last: lastMonth(period),
  });
  const { withFiles, ready, fileName, filesNote, contents } = describe(
    account.title,
    period,
    parts,
    data
  );

  const step = (by: number) => {
    setDirection(by);
    setPeriod(shiftPeriod(period, by));
  };
  const changeUnit = (unit: PeriodUnit) => {
    // Around the month the account shows, while it's in the period.
    const anchor = periodMonths(period).includes(month) ? month : period.first;
    setDirection(0);
    setPeriod(periodOf(unit, anchor));
  };
  const pick = (part: keyof ExportParts) => (checked: boolean) =>
    setParts({ ...parts, [part]: checked });

  const submit = () => {
    writeStorage(
      PREFERENCE_KEY,
      JSON.stringify({ parts, unit: period.unit } satisfies Preference)
    );
    startExport({
      account: { _id: account._id, title: account.title },
      card: account.look?.card ?? DEFAULT_LOOK.card,
      parts: { ...parts, files: withFiles },
      period,
    });
    onDone();
  };

  return (
    <div className="flex flex-col gap-5">
      <DialogHeader>
        <DialogTitle>Export {account.title}</DialogTitle>
        <DialogDescription>
          A statement, a spreadsheet and the invoices behind them, for a month,
          a quarter or a year.
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-2">
        <Tabs
          onValueChange={(unit: PeriodUnit) => changeUnit(unit)}
          value={period.unit}
        >
          <TabsList aria-label="Period" className="w-full">
            {PERIOD_UNITS.map((unit) => (
              <TabsTrigger className="flex-1" key={unit} value={unit}>
                {UNIT_NAMES[unit]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <PeriodStepper direction={direction} onStep={step} period={period} />
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-muted-foreground mb-2 text-xs font-medium">
          Include
        </legend>
        <Part
          checked={parts.pdf}
          format="PDF"
          icon={<FileTextIcon />}
          onChange={pick("pdf")}
          title="Statement"
        >
          What came in and went out, by month and category, then every
          transaction with its running balance.
        </Part>
        <Part
          checked={parts.csv}
          format="CSV"
          icon={<SheetIcon />}
          onChange={pick("csv")}
          title="Spreadsheet"
        >
          A row per transaction, for Excel, Numbers or your accountant.
        </Part>
        <Part
          checked={parts.files}
          disabled={data?.files.length === 0}
          format="Files"
          icon={<PaperclipIcon />}
          onChange={pick("files")}
          title="Invoices & receipts"
        >
          {filesNote}
        </Part>
      </fieldset>
      <div className="bg-foreground/4 flex items-center gap-3 rounded-xl py-2.5 pr-3 pl-2.5">
        <FileIcon
          className={cn("transition-opacity", !ready && "opacity-40")}
          file={{ name: fileName, type: "" }}
          size="md"
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium" title={fileName}>
            {ready ? fileName : "Pick something to export"}
          </span>
          <span className="text-muted-foreground truncate text-xs tabular-nums">
            {contents}
          </span>
        </div>
      </div>
      <DialogFooter>
        <DialogClose render={<Button type="button" variant="ghost" />}>
          Cancel
        </DialogClose>
        <Button disabled={!ready} onClick={submit} type="button">
          <DownloadIcon />
          Export
        </Button>
      </DialogFooter>
    </div>
  );
}

type ExportDialogProps = Omit<Parameters<typeof ExportForm>[0], "onDone"> & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * Exporting the account over a month, a quarter or a year: what to include,
 * and what it saves as. It carries on in the corner once started.
 */
export function ExportDialog({
  open,
  onOpenChange,
  ...props
}: ExportDialogProps) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent showCloseButton={false}>
        <ExportForm {...props} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
