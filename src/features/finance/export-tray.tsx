import { cn } from "cn";
import {
  CheckIcon,
  ChevronDownIcon,
  CircleAlertIcon,
  DownloadIcon,
  RotateCcwIcon,
  XIcon,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";

import { Corner } from "@/components/corner";
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
import { FluidTooltip } from "@/components/ui/fluid-tooltip";
import { FileIcon } from "@/features/drive/file-icon";
import type { ExportJob } from "@/features/finance/export-jobs";
import {
  cancelAllExports,
  cancelExport,
  clearFinishedExports,
  dismissExport,
  isRunning,
  retryExport,
  saveAgain,
  useExports,
} from "@/features/finance/export-jobs";
import { formatBytes, plural } from "@/lib/utils";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;
/** A tray of only finished exports tucks itself away after this, unless it's being looked at. */
const DISMISS_MS = 8000;

/**
 * How far along an export is, from 0 to 1: gathering and drawing are quick
 * steps up front, and fetching files takes most of the way when there are some.
 */
function shareOf(job: ExportJob): number {
  switch (job.step) {
    case "gathering": {
      return 0.05;
    }
    case "drawing": {
      return 0.15;
    }
    case "fetching": {
      const part = job.bytes > 0 ? job.loaded / job.bytes : 0;
      return 0.2 + 0.75 * Math.min(1, part);
    }
    case "packing": {
      return 0.97;
    }
    default: {
      return 1;
    }
  }
}

/** How far all of them got, as a ring that fills, a check once done, or a warning if one failed. */
function Ring({
  share,
  state,
}: {
  share: number;
  state: "active" | "done" | "failed";
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
          strokeDashoffset={length * (1 - (state === "active" ? share : 1))}
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
      {state === "failed" && (
        <CircleAlertIcon aria-hidden className="text-destructive size-3.5" />
      )}
    </span>
  );
}

function Bar({ share, busy }: { share: number; busy: boolean }) {
  return (
    <span className="bg-foreground/8 relative block h-1 overflow-hidden rounded-full">
      <span
        className={cn(
          "bg-primary absolute inset-y-0 left-0 rounded-full transition-[width] duration-300 ease-out",
          busy && "animate-pulse"
        )}
        style={{ width: `${Math.round(share * 100)}%` }}
      />
    </span>
  );
}

/** What a job's row says under its name. */
function Status({ job }: { job: ExportJob }) {
  switch (job.step) {
    case "gathering": {
      return <span>Gathering transactions…</span>;
    }
    case "drawing": {
      return <span>Drawing the statement…</span>;
    }
    case "fetching": {
      return (
        <span className="tabular-nums">
          Invoices · {job.fetched} of {job.files}
          {job.bytes > 0 &&
            ` · ${formatBytes(job.loaded)} of ${formatBytes(job.bytes)}`}
        </span>
      );
    }
    case "packing": {
      return <span>Zipping it up…</span>;
    }
    case "done": {
      return (
        <span className="truncate tabular-nums">
          Saved{job.result && ` · ${formatBytes(job.result.size)}`}
          {job.missing > 0 && (
            <span className="text-amber-700 dark:text-amber-400">
              {" "}
              · {plural(job.missing, "file")} left out
            </span>
          )}
        </span>
      );
    }
    case "canceled": {
      return <span>Canceled</span>;
    }
    default: {
      return (
        <span className="text-destructive truncate" title={job.error}>
          {job.error ?? "Didn’t export"}
        </span>
      );
    }
  }
}

function Row({ job }: { job: ExportJob }) {
  const running = isRunning(job);
  const done = job.step === "done";
  return (
    <motion.li
      animate={{ opacity: 1, y: 0 }}
      className="group/row relative flex items-center gap-3 px-3 py-2"
      initial={{ opacity: 0, y: 6 }}
      layout="position"
      transition={{ duration: 0.2, ease: EASE_OUT }}
    >
      <span className="flex size-9 shrink-0 items-center justify-center">
        <FileIcon file={{ name: job.fileName, type: "" }} size="md" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        {done ? (
          <button
            className="hover:text-primary focus-visible:ring-ring/50 truncate rounded text-left text-sm font-medium outline-none after:absolute after:inset-0 focus-visible:ring-3"
            onClick={() => saveAgain(job.id)}
            title={`Save ${job.fileName} again`}
            type="button"
          >
            {job.title}
          </button>
        ) : (
          <span className="truncate text-sm font-medium" title={job.fileName}>
            {job.title}
          </span>
        )}
        {running && <Bar busy={job.step !== "fetching"} share={shareOf(job)} />}
        <span className="text-muted-foreground flex min-w-0 text-xs">
          <Status job={job} />
        </span>
      </span>
      <span className="relative z-10 flex shrink-0 items-center">
        {running && (
          <IconButton
            label={`Cancel ${job.title}`}
            onClick={() => cancelExport(job.id)}
            size="icon-xs"
          >
            <XIcon />
          </IconButton>
        )}
        {(job.step === "failed" || job.step === "canceled") && (
          <>
            <IconButton
              label={`Try ${job.title} again`}
              onClick={() => retryExport(job.id)}
              size="icon-xs"
            >
              <RotateCcwIcon />
            </IconButton>
            <IconButton
              label={`Dismiss ${job.title}`}
              onClick={() => dismissExport(job.id)}
              size="icon-xs"
            >
              <XIcon />
            </IconButton>
          </>
        )}
        {done && (
          <IconButton
            label={`Save ${job.fileName} again`}
            onClick={() => saveAgain(job.id)}
            size="icon-xs"
          >
            <DownloadIcon />
          </IconButton>
        )}
      </span>
    </motion.li>
  );
}

/** What all the exports come to, for the tray's header. */
function summarize(jobs: ExportJob[]) {
  const running = jobs.filter(isRunning);
  const failed = jobs.filter((job) => job.step === "failed").length;
  const done = jobs.filter((job) => job.step === "done").length;
  const counted = jobs.filter((job) => job.step !== "canceled").length;
  const [only] = running;
  let title = done === 1 ? "Export saved" : `${done} exports saved`;
  let detail = "";
  let state: "active" | "done" | "failed" = "done";
  if (running.length === 1 && only && counted === 1) {
    title = `Exporting ${only.title}`;
    detail = only.fileName;
    state = "active";
  } else if (running.length > 0) {
    title = `Exporting ${Math.min(done + 1, counted)} of ${counted}`;
    state = "active";
  } else if (failed > 0) {
    title =
      failed === 1 ? "An export didn’t finish" : `${failed} didn’t finish`;
    state = "failed";
  } else if (done === 1 && jobs[0]) {
    detail = jobs[0].fileName;
  }
  return {
    detail,
    running: running.length,
    share:
      running.length > 0
        ? running.reduce((sum, job) => sum + shareOf(job), 0) / running.length
        : 1,
    state,
    title,
  };
}

/**
 * Exports as they go, in a card in the corner that stays up across the app:
 * how far each got, and buttons to cancel, try again or save it once more.
 * It tucks itself away a little after everything's saved.
 */
export function ExportTray() {
  const jobs = useExports();
  const [collapsed, setCollapsed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const summary = summarize(jobs);
  const finished = jobs.length > 0 && summary.state === "done";

  useEffect(() => {
    if (!finished || hovered) {
      return;
    }
    const timer = setTimeout(clearFinishedExports, DISMISS_MS);
    return () => clearTimeout(timer);
  }, [finished, hovered]);

  const close = () => {
    if (summary.running > 0) {
      setConfirming(true);
    } else {
      clearFinishedExports();
    }
  };

  return (
    <>
      <Corner>
        <AnimatePresence>
          {jobs.length > 0 && (
            <motion.section
              animate={{ filter: "blur(0px)", opacity: 1, scale: 1, y: 0 }}
              aria-label="Exports"
              className="bg-popover text-popover-foreground shadow-raised pointer-events-auto order-3 flex w-92 max-w-full origin-bottom-right flex-col overflow-hidden rounded-2xl"
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
                <div
                  aria-live="polite"
                  className="flex min-w-0 flex-1 flex-col"
                >
                  <span className="truncate text-sm font-semibold">
                    {summary.title}
                  </span>
                  {summary.detail && (
                    <span className="text-muted-foreground truncate text-xs">
                      {summary.detail}
                    </span>
                  )}
                </div>
                <FluidTooltip.Group>
                  <IconButton
                    aria-expanded={!collapsed}
                    className="[&>svg]:transition-transform [&>svg]:duration-200 [&>svg]:ease-out aria-[expanded=false]:[&>svg]:rotate-180"
                    label={collapsed ? "Show exports" : "Hide exports"}
                    onClick={() => setCollapsed(!collapsed)}
                  >
                    <ChevronDownIcon />
                  </IconButton>
                  <IconButton
                    label={summary.running > 0 ? "Cancel exports" : "Close"}
                    onClick={close}
                  >
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
                        <Row job={job} key={job.id} />
                      ))}
                    </ol>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.section>
          )}
        </AnimatePresence>
      </Corner>
      <AlertDialog onOpenChange={setConfirming} open={confirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Cancel {plural(summary.running, "export")}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Nothing more is saved. What’s been saved already stays where it
              is.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep exporting</AlertDialogCancel>
            <AlertDialogAction onClick={cancelAllExports} variant="destructive">
              Cancel exports
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
