import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { OptimisticLocalStore } from "convex/browser";

import { run } from "@/lib/actions";
import { convex } from "@/lib/convex";
import type {
  ActivityType,
  CrmRecord,
  CrmTable,
  Field,
  StageMove,
} from "@/lib/crm";
import { stageField } from "@/lib/crm";
import type { NewTable } from "@/lib/crm-templates";

export interface NewRecord {
  title: string;
  values?: CrmRecord["values"];
  rank?: number;
}

export interface TableChanges {
  title?: string;
  singular?: string;
  icon?: CrmTable["icon"];
  description?: string;
  fields?: Field[];
}

function sortRecords(records: CrmRecord[]): CrmRecord[] {
  return records.toSorted(
    (a, b) => a.rank - b.rank || a._creationTime - b._creationTime
  );
}

/** Shows a change to a project's records at once, before the server confirms it. */
function patchRecords(
  store: OptimisticLocalStore,
  projectId: Id<"projects">,
  patch: (records: CrmRecord[]) => CrmRecord[]
): void {
  const content = store.getQuery(api.crm.project, { projectId });
  if (content) {
    store.setQuery(
      api.crm.project,
      { projectId },
      { ...content, records: sortRecords(patch(content.records)) }
    );
  }
}

function withValue(
  table: CrmTable | undefined,
  record: CrmRecord,
  fieldId: string,
  values: string[],
  me: Id<"users"> | undefined
): CrmRecord {
  const next = Object.fromEntries(
    Object.entries(record.values).filter(([key]) => key !== fieldId)
  );
  if (values.length > 0) {
    next[fieldId] = values;
  }
  const stage = table ? stageField(table) : undefined;
  let { moves } = record;
  if (
    stage?.id === fieldId &&
    values[0] &&
    values[0] !== record.values[fieldId]?.[0]
  ) {
    const move: StageMove = { at: Date.now(), by: me, stage: values[0] };
    moves = [...moves, move];
  }
  return { ...record, moves, updatedAt: Date.now(), values: next };
}

function tableOf(store: OptimisticLocalStore, record: CrmRecord) {
  return store
    .getQuery(api.crm.project, { projectId: record.projectId })
    ?.tables.find((table) => table._id === record.tableId);
}

export function createTables(projectId: Id<"projects">, tables: NewTable[]) {
  return run(convex.mutation(api.crm.createTables, { projectId, tables }));
}

export function updateTable(table: CrmTable, changes: TableChanges) {
  return run(
    convex.mutation(api.crm.updateTable, { tableId: table._id, ...changes })
  );
}

export function deleteTable(table: CrmTable) {
  return run(convex.mutation(api.crm.deleteTable, { tableId: table._id }));
}

export function createRecord(table: CrmTable, record: NewRecord) {
  return run(
    convex.mutation(api.crm.createRecord, {
      rank: record.rank ?? 0,
      tableId: table._id,
      title: record.title,
      values: record.values ?? {},
    })
  );
}

export function updateRecord(
  record: CrmRecord,
  changes: { title?: string; rank?: number }
) {
  return run(
    convex.mutation(
      api.crm.updateRecord,
      { recordId: record._id, ...changes },
      {
        optimisticUpdate: (store) =>
          patchRecords(store, record.projectId, (records) =>
            records.map((item) =>
              item._id === record._id
                ? { ...item, ...changes, updatedAt: Date.now() }
                : item
            )
          ),
      }
    )
  );
}

/** Sets one field on one or more records of a table, leaving their other fields alone. */
export function setValues(
  records: CrmRecord[],
  fieldId: string,
  values: string[],
  me?: Id<"users">
) {
  const [first] = records;
  if (!first) {
    return Promise.resolve();
  }
  const ids = new Set(records.map((record) => record._id));
  return run(
    convex.mutation(
      api.crm.setValues,
      { fieldId, recordIds: [...ids], values },
      {
        optimisticUpdate: (store) => {
          const table = tableOf(store, first);
          patchRecords(store, first.projectId, (all) =>
            all.map((item) =>
              ids.has(item._id)
                ? withValue(table, item, fieldId, values, me)
                : item
            )
          );
        },
      }
    )
  );
}

export interface RecordMove {
  record: CrmRecord;
  rank: number;
  /** The stage option it lands in, or null for none. */
  stage?: string | null;
}

/** Records dropped somewhere else on the pipeline. */
export function moveRecords(moves: RecordMove[], me?: Id<"users">) {
  const [first] = moves;
  if (!first) {
    return Promise.resolve();
  }
  const byId = new Map(moves.map((move) => [move.record._id, move]));
  return run(
    convex.mutation(
      api.crm.moveRecords,
      {
        moves: moves.map(({ record, rank, stage }) => ({
          rank,
          recordId: record._id,
          stage,
        })),
      },
      {
        optimisticUpdate: (store) => {
          const table = tableOf(store, first.record);
          const stage = table ? stageField(table) : undefined;
          patchRecords(store, first.record.projectId, (all) =>
            all.map((item) => {
              const move = byId.get(item._id);
              if (!move) {
                return item;
              }
              const moved = { ...item, rank: move.rank };
              return stage && move.stage !== undefined
                ? withValue(
                    table,
                    moved,
                    stage.id,
                    move.stage === null ? [] : [move.stage],
                    me
                  )
                : moved;
            })
          );
        },
      }
    )
  );
}

export function deleteRecords(records: CrmRecord[]) {
  const [first] = records;
  if (!first) {
    return Promise.resolve();
  }
  const ids = new Set(records.map((record) => record._id));
  return run(
    convex.mutation(
      api.crm.deleteRecords,
      { recordIds: [...ids] },
      {
        optimisticUpdate: (store) =>
          patchRecords(store, first.projectId, (all) =>
            all.filter((item) => !ids.has(item._id))
          ),
      }
    )
  );
}

export function importRecords(
  table: CrmTable,
  records: Required<NewRecord>[],
  fields?: Field[]
) {
  return run(
    convex.mutation(api.crm.importRecords, {
      fields,
      records,
      tableId: table._id,
    })
  );
}

export function addActivity(
  record: CrmRecord,
  kind: ActivityType,
  content: string
) {
  return run(
    convex.mutation(api.crm.addActivity, {
      content,
      kind,
      recordId: record._id,
    })
  );
}

export function deleteActivity(activityId: Id<"crmActivity">) {
  return run(convex.mutation(api.crm.removeActivity, { activityId }));
}
