import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type {
  InvoiceFailure,
  InvoiceReading,
  InvoiceResult,
} from "@convex/shared/finance";
import { useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import type { FormFile } from "@/features/finance/entry-files";
import { formFileId } from "@/features/finance/entry-files";
import { convex } from "@/lib/convex";
import type { Account, Entry } from "@/lib/finance";
import { MAX_ENTRY_FILES } from "@/lib/finance";
import type { FileChanges } from "@/lib/finance-actions";
import type { InvoiceJob } from "@/lib/invoice-jobs";
import {
  addJobs,
  dropJob,
  finishJob,
  readJob,
  retryJob,
  useInvoiceJobs,
} from "@/lib/invoice-jobs";
import type { Upload } from "@/lib/upload";

/** The invoice read among the files: which, and what it found so far. */
export interface ReadState {
  id: string;
  name: string;
  /** Still uploading or being read. */
  busy: boolean;
  reading?: InvoiceReading;
  failure?: InvoiceFailure;
}

/** A kept file read again, which is read here rather than as a job. */
interface KeptRead {
  id: string;
  name: string;
  result?: InvoiceResult;
}

function readStateOf(
  job: InvoiceJob | undefined,
  kept: KeptRead | undefined
): ReadState | undefined {
  if (job) {
    return {
      busy: job.status === "uploading" || job.status === "reading",
      failure: job.failure,
      id: job.id,
      name: job.name,
      reading: job.reading,
    };
  }
  if (kept) {
    return {
      busy: kept.result === undefined,
      failure: kept.result?.ok === false ? kept.result.reason : undefined,
      id: kept.id,
      name: kept.name,
      reading: kept.result?.ok ? kept.result.reading : undefined,
    };
  }
  return undefined;
}

const NO_FILES: never[] = [];

/**
 * The files of an entry being added or changed: those it keeps, and new
 * ones on their way, each uploaded as soon as it's picked. The first new one
 * is read as its invoice when `reads`, and any can be read in its place.
 * `onJobsChange` hears which jobs are the form's, to drop them if it's left.
 */
export function useEntryFiles({
  account,
  entry,
  initialJobs,
  reads,
  onJobsChange,
}: {
  account: Account;
  entry?: Entry;
  initialJobs: string[];
  reads: boolean;
  onJobsChange: (ids: string[]) => void;
}) {
  const keptQuery = useQuery(
    api.finance.entryFiles,
    entry?.fileCount ? { entryId: entry._id } : "skip"
  );
  const kept = keptQuery ?? NO_FILES;
  const allJobs = useInvoiceJobs();
  const [jobIds, setJobIds] = useState(initialJobs);
  const [removed, setRemoved] = useState<Id<"financeFiles">[]>([]);
  const [selected, setSelected] = useState<string>();
  const [readId, setReadId] = useState(() => initialJobs[0]);
  const [keptRead, setKeptRead] = useState<KeptRead>();

  useEffect(() => {
    onJobsChange(jobIds);
  }, [jobIds, onJobsChange]);

  const jobs = jobIds.flatMap((id) => {
    const job = allJobs.find((item) => item.id === id);
    return job ? [job] : [];
  });
  const items: FormFile[] = [
    ...kept
      .filter((file) => !removed.includes(file._id))
      .map((file): FormFile => ({ file, kind: "kept" })),
    ...jobs.map((job): FormFile => ({ job, kind: "new" })),
  ];
  const shown = items.find((item) => formFileId(item) === selected) ?? items[0];
  const readJobNow = jobs.find((job) => job.id === readId && job.read);
  const read = readStateOf(
    readJobNow,
    keptRead?.id === readId ? keptRead : undefined
  );

  const add = (files: File[]) => {
    const room = MAX_ENTRY_FILES - items.length;
    if (files.length > room) {
      toast.error(`A transaction can keep up to ${MAX_ENTRY_FILES} files.`);
    }
    const added = addJobs(account._id, files.slice(0, Math.max(0, room)), {
      batch: false,
      // The first file is the invoice, unless one was read already.
      read: reads && read === undefined,
    });
    const [first] = added;
    if (!first) {
      return;
    }
    setJobIds((current) => [...current, ...added]);
    setSelected(first);
    if (reads && read === undefined) {
      setReadId(first);
    }
  };

  const remove = (id: string) => {
    const job = jobs.find((item) => item.id === id);
    if (job) {
      dropJob(id);
      setJobIds((current) => current.filter((other) => other !== id));
    } else {
      setRemoved((current) => [...current, id as Id<"financeFiles">]);
    }
    if (selected === id) {
      setSelected(undefined);
    }
  };

  /** Reads the file as the invoice, in place of any read before. */
  const readItem = async (item: FormFile) => {
    const id = formFileId(item);
    setReadId(id);
    if (item.kind === "new") {
      readJob(id);
      return;
    }
    setKeptRead({ id, name: item.file.name });
    let result: InvoiceResult = { ok: false, reason: "failed" };
    try {
      result = await convex.action(api.invoices.read, {
        accountId: account._id,
        key: item.file.key,
      });
    } catch {
      // Said as a failure to read.
    }
    setKeptRead((current) =>
      current?.id === id ? { ...current, result } : current
    );
  };

  const uploads = jobs.flatMap((job): Upload[] =>
    job.upload ? [job.upload] : []
  );
  const changes: FileChanges = { add: uploads, remove: removed };

  return {
    add,
    /** What saving does to the files: the uploads to keep, and the kept ones to delete. */
    changes,
    failed: jobs.some((job) => job.status === "failed"),
    /** Marks the new files as the entry's, once it's saved. */
    finish: () => {
      for (const job of jobs) {
        finishJob(job.id);
      }
    },
    items,
    /** The entry keeps files, still on their way. */
    loading: Boolean(entry?.fileCount) && keptQuery === undefined,
    read,
    readItem,
    remove,
    /** Reads the invoice read last again, after it failed. */
    rereadInvoice: () => {
      const item = items.find((other) => formFileId(other) === readId);
      if (item) {
        readItem(item);
      }
    },
    retry: retryJob,
    select: setSelected,
    shown,
    uploading: jobs.some((job) => job.status === "uploading"),
  };
}
