import { api } from "@convex/_generated/api";
import { useQuery } from "convex/react";

import type { Activity, CrmRecord } from "@/lib/crm";

const NONE: Activity[] = [];

/** Notes, calls and visits logged on a record, newest first. */
export function useRecordActivity(record: CrmRecord): Activity[] {
  return useQuery(api.crm.activity, { recordId: record._id }) ?? NONE;
}
