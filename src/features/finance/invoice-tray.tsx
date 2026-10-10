import type { Id } from "@convex/_generated/dataModel";
import { cn } from "cn";
import {
  CheckIcon,
  ChevronDownIcon,
  CircleAlertIcon,
  RotateCcwIcon,
  SparklesIcon,
  XIcon,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";

import { IconButton } from "@/components/icon-button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { FluidTooltip } from "@/components/ui/fluid-tooltip";
import { FileIcon } from "@/features/drive/file-icon";
import { anyMoney, dayText } from "@/features/finance/invoice-fill";
import { fileKind } from "@/lib/drive";
import { useUploads } from "@/lib/drive-upload";
import type { InvoiceJob } from "@/lib/invoice-jobs";
import { dropBatch, dropJob, isBusy, retryJob } from "@/lib/invoice-jobs";
import { plural } from "@/lib/utils";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;
/** A tray of only added invoices tucks itself away after this, unless it's being looked at. */
const DISMISS_MS = 6000;

/** What reading came to, in a few words. */
const SHORT_FAILURES = {
  failed: "Couldn’t read it",
  limit: "Not read: too many lately",
  "not-invoice": "Doesn’t look like an invoice",
  off: "Fill it in by hand",
  unsupported: "Can’t read this kind of file",
} as const;

/** Whether a job is still to be reviewed: uploaded, and neither added nor skipped. */
export function toReview(job: InvoiceJob): boolean {
  return job.status !== "failed" && job.outcome === undefined;
}

/** How far the batch got, as a ring that fills, a check once all are added, or a warning. */
function Ring({
  share,
  state,
}: {
  share: number;
  state: "active" | "ready" | "done" | "failed";
}) {
  const radius = 11;
  const length = 2 * Math.PI * radius;
  return (
    <span className="relative flex size-8 shrink-0 items-center justify-center">
      <svg
        aria-hidden
        className="absolute inset-0 -rotate-90"
        viewBox="0 0 32 32"
      >
        <circle
          className="stroke-foreground/10"
          cx="16"
          cy="16"
          fill="none"
          r={radius}
          strokeWidth="3"
        />
        <circle
          className={cn(
            "transition-[stroke-dashoffset,stroke] duration-300 ease-out",
            state === "failed" ? "stroke-destructive" : "stroke-primary",
            state === "done" && "stroke-green-500"
          )}
          cx="16"
          cy="16"
          fill="none"
          r={radius}
          strokeDasharray={length}
          strokeDashoffset={length * (1 - share)}
          strokeLinecap="round"
          strokeWidth="3"
        />
      </svg>
      {state === "done" && (
        <CheckIcon
          aria-hidden
          className="size-3.5 text-green-500"
          strokeWidth={3}
        />
      )}
      {state === "ready" && (
        <SparklesIcon aria-hidden className="text-primary size-3.5" />
      )}
      {state === "failed" && (
        <CircleAlertIcon aria-hidden className="text-destructive size-3.5" />
      )}
    </span>
  );
}

/** What a job's row says under its name. */
function Status({ job }: { job: InvoiceJob }) {
  if (job.outcome === "added") {
    return <span>Added</span>;
  }
  if (job.status === "uploading") {
    return <span>Uploading…</span>;
  }
  if (job.status === "reading") {
    return <span className="text-primary">Reading…</span>;
  }
  if (job.status === "failed") {
    return (
      <span className="text-destructive truncate" title={job.error}>
        {job.error ?? "Didn’t upload"}
      </span>
    );
  }
  const prefix = job.outcome === "skipped" ? "Skipped · " : "";
  const { reading } = job;
  if (!reading) {
    return (
      <span className="text-amber-700 dark:text-amber-400">
        {prefix}
        {job.failure ? SHORT_FAILURES[job.failure] : "Fill it in by hand"}
      </span>
    );
  }
  const parts = [
    reading.cents !== undefined && reading.currency
      ? anyMoney(reading.cents, reading.currency)
      : undefined,
    (reading.due ?? reading.issued) &&
      dayText(reading.due ?? reading.issued ?? ""),
  ].filter(Boolean);
  return (
    <span className="tabular-nums">
      {prefix}
      {parts.length > 0 ? parts.join(" · ") : "Read, with gaps to fill"}
    </span>
  );
}

/** A small picture of the file: the photo itself, or its icon. */
function Thumb({ job }: { job: InvoiceJob }) {
  const [broken, setBroken] = useState(false);
  if (fileKind(job) === "image" && !broken) {
    return (
      <img
        alt=""
        className="image-outline size-9 shrink-0 rounded-lg object-cover"
        onError={() => setBroken(true)}
        src={job.url}
      />
    );
  }
  return (
    <span className="flex size-9 shrink-0 items-center justify-center">
      <FileIcon file={job} size="md" />
    </span>
  );
}

function Row({
  job,
  onReview,
}: {
  job: InvoiceJob;
  onReview: (id: string) => void;
}) {
  const added = job.outcome === "added";
  const reviewable = toReview(job) || job.outcome === "skipped";
  return (
    <motion.li
      animate={{ opacity: 1, transform: "translateY(0px)" }}
      className="group/row relative flex items-center gap-3 px-3 py-2"
      initial={{ opacity: 0, transform: "translateY(6px)" }}
      layout="position"
      transition={{ duration: 0.2, ease: EASE_OUT }}
    >
      <Thumb job={job} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        {reviewable ? (
          <button
            className="hover:text-primary focus-visible:ring-ring/50 truncate rounded text-left text-sm font-medium outline-none after:absolute after:inset-0 focus-visible:ring-3"
            onClick={() => onReview(job.id)}
            title={`Review ${job.name}`}
            type="button"
          >
            {job.reading?.name ?? job.name}
          </button>
        ) : (
          <span className="truncate text-sm font-medium" title={job.name}>
            {job.reading?.name ?? job.name}
          </span>
        )}
        {isBusy(job) && (
          <span className="bg-foreground/8 relative block h-1 overflow-hidden rounded-full">
            <span className="invoice-pending absolute inset-0" />
          </span>
        )}
        <span className="text-muted-foreground flex min-w-0 text-xs">
          <Status job={job} />
        </span>
      </span>
      <span className="relative z-10 flex shrink-0 items-center">
        {job.status === "failed" && (
          <IconButton
            label={`Try ${job.name} again`}
            onClick={() => retryJob(job.id)}
            size="icon-xs"
          >
            <RotateCcwIcon />
          </IconButton>
        )}
        {added ? (
          <span className="flex size-6 items-center justify-center rounded-full bg-green-500/15 text-green-600 dark:text-green-400">
            <CheckIcon aria-hidden className="size-3.5" strokeWidth={3} />
          </span>
        ) : (
          <IconButton
            className="opacity-0 transition-opacity duration-150 group-hover/row:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
            label={`Discard ${job.name}`}
            onClick={() => dropJob(job.id)}
            size="icon-xs"
          >
            <XIcon />
          </IconButton>
        )}
      </span>
    </motion.li>
  );
}

/** What the whole batch comes to, for the tray's header. */
function summarize(jobs: InvoiceJob[]) {
  const busy = jobs.filter(isBusy).length;
  const added = jobs.filter((job) => job.outcome === "added").length;
  const failed = jobs.filter((job) => job.status === "failed").length;
  const waiting = jobs.filter(toReview).length;
  const skipped = jobs.filter((job) => job.outcome === "skipped").length;
  const settled = jobs.length - busy;
  let title = `${plural(added, "invoice")} added`;
  let state: "active" | "ready" | "done" | "failed" = "done";
  if (busy > 0) {
    title = `Reading ${Math.min(settled + 1, jobs.length)} of ${jobs.length}`;
    state = "active";
  } else if (waiting + skipped > 0) {
    title = `${plural(waiting + skipped, "invoice")} to review`;
    state = "ready";
  } else if (failed > 0) {
    title = `${failed} didn’t upload`;
    state = "failed";
  }
  const detail = [
    added > 0 && busy + waiting + skipped > 0 ? `${added} added` : "",
    skipped > 0 ? `${skipped} skipped` : "",
    failed > 0 && state !== "failed" ? `${failed} didn’t upload` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  return {
    detail,
    open: jobs.length - added,
    share: jobs.length > 0 ? settled / jobs.length : 0,
    state,
    title,
    waiting: waiting + skipped,
  };
}

/**
 * Invoices dropped on an account together, in a card in the corner: each
 * uploads and is read, then they're reviewed one by one, and added. It
 * tucks itself away once every one is in.
 */
export function InvoiceTray({
  jobs,
  account,
  onReview,
}: {
  /** The account's batch, oldest first. */
  jobs: InvoiceJob[];
  account: { _id: Id<"financeAccounts">; title: string };
  onReview: (id?: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [confirming, setConfirming] = useState(false);
  // Drive's uploads keep the corner; this sits beside them.
  const besideDrive = useUploads().length > 0;
  const summary = summarize(jobs);
  const finished = jobs.length > 0 && summary.open === 0;

  const clear = () => dropBatch(account._id);

  useEffect(() => {
    if (!finished || hovered) {
      return;
    }
    const timer = setTimeout(() => dropBatch(account._id), DISMISS_MS);
    return () => clearTimeout(timer);
  }, [finished, hovered, account._id]);

  const close = () => {
    if (summary.open > 0) {
      setConfirming(true);
    } else {
      clear();
    }
  };

  return (
    <>
      <AnimatePresence>
        {jobs.length > 0 && (
          <motion.section
            animate={{ filter: "blur(0px)", opacity: 1, scale: 1, y: 0 }}
            aria-label="Invoices"
            className={cn(
              "bg-popover text-popover-foreground shadow-raised fixed right-4 bottom-4 z-40 flex w-92 max-w-[calc(100vw-2rem)] origin-bottom-right flex-col overflow-hidden rounded-2xl max-md:bottom-[calc(max(1rem,env(safe-area-inset-bottom))+3.25rem)] max-sm:right-2 max-sm:max-w-[calc(100vw-1rem)]",
              besideDrive && "md:right-[calc(23rem+2rem)]"
            )}
            exit={{
              filter: "blur(4px)",
              opacity: 0,
              scale: 0.96,
              transition: { duration: 0.15 },
              y: 8,
            }}
            initial={{ filter: "blur(4px)", opacity: 0, scale: 0.96, y: 16 }}
            onPointerEnter={() => setHovered(true)}
            onPointerLeave={() => setHovered(false)}
            transition={{ duration: 0.3, ease: EASE_OUT }}
          >
            <header className="flex items-center gap-3 py-2.5 pr-2 pl-3">
              <Ring share={summary.share} state={summary.state} />
              <div aria-live="polite" className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-semibold">
                  {summary.title}
                </span>
                {summary.detail && (
                  <span className="text-muted-foreground truncate text-xs tabular-nums">
                    {summary.detail}
                  </span>
                )}
              </div>
              {summary.waiting > 0 && (
                <Button onClick={() => onReview()} size="sm">
                  Review
                </Button>
              )}
              <FluidTooltip.Group>
                <IconButton
                  aria-expanded={!collapsed}
                  className="[&>svg]:transition-transform [&>svg]:duration-200 [&>svg]:ease-out aria-[expanded=false]:[&>svg]:rotate-180"
                  label={collapsed ? "Show invoices" : "Hide invoices"}
                  onClick={() => setCollapsed(!collapsed)}
                >
                  <ChevronDownIcon />
                </IconButton>
                <IconButton label="Close" onClick={close}>
                  <XIcon />
                </IconButton>
              </FluidTooltip.Group>
            </header>
            <AnimatePresence initial={false}>
              {!collapsed && (
                <motion.div
                  animate={{ height: "auto", opacity: 1 }}
                  className="overflow-hidden"
                  exit={{ height: 0, opacity: 0 }}
                  initial={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25, ease: EASE_OUT }}
                >
                  <ol className="flex max-h-72 flex-col overflow-y-auto border-t py-1">
                    {jobs.map((job) => (
                      <Row job={job} key={job.id} onReview={onReview} />
                    ))}
                  </ol>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.section>
        )}
      </AnimatePresence>
      <AlertDialog onOpenChange={setConfirming} open={confirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Discard {plural(summary.open, "invoice")}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {summary.open === 1 ? "It isn’t" : "They aren’t"} added to{" "}
              {account.title}, and{" "}
              {summary.open === 1 ? "its file is" : "their files are"} deleted.
              What’s added stays.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep them</AlertDialogCancel>
            <AlertDialogAction onClick={clear} variant="destructive">
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
