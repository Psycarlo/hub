import type { Doc } from "@convex/_generated/dataModel";
import type { Field, FieldOption } from "@convex/shared/crm";
import { findOption, firstValue, stageField } from "@convex/shared/crm";

export type {
  ActivityType,
  Currency,
  Field,
  FieldOption,
  FieldType,
  StageKind,
  StageMove,
  TableIcon,
} from "@convex/shared/crm";
export {
  ACTIVITY_TYPES,
  CURRENCIES,
  findOption,
  firstValue,
  MAX_IMPORT,
  mergeFields,
  recordTitle,
  shortId,
  stageField,
  TABLE_ICONS,
  TITLE_FIELD,
  titleField,
} from "@convex/shared/crm";

export type CrmTable = Doc<"crmTables">;
export type CrmRecord = Doc<"crmRecords">;
export type Activity = Pick<
  Doc<"crmActivity">,
  "_id" | "_creationTime" | "authorId" | "content" | "kind"
>;

/** A table as navigation shows it, across projects. */
export type NavTable = Pick<
  CrmTable,
  "_id" | "_creationTime" | "projectId" | "slug" | "title" | "icon"
>;

export interface ProjectContent {
  tables: CrmTable[];
  records: CrmRecord[];
  byTable: Map<string, CrmRecord[]>;
  byId: Map<string, CrmRecord>;
}

/** Records grouped by table and found by id, as the CRM views read them. */
export function resolveContent(raw: {
  tables: CrmTable[];
  records: CrmRecord[];
}): ProjectContent {
  const byTable = new Map(
    raw.tables.map((table): [string, CrmRecord[]] => [table._id, []])
  );
  const records = raw.records.filter((record) => byTable.has(record.tableId));
  for (const record of records) {
    byTable.get(record.tableId)?.push(record);
  }
  return {
    byId: new Map(records.map((record) => [record._id, record])),
    byTable,
    records,
    tables: raw.tables,
  };
}

export function recordStage(
  table: CrmTable,
  record: CrmRecord
): FieldOption | undefined {
  const field = stageField(table);
  return field ? findOption(field, firstValue(record, field.id)) : undefined;
}

export function relationTarget(
  field: Field,
  content: ProjectContent
): CrmTable | undefined {
  return field.type === "relation"
    ? content.tables.find((table) => table._id === field.config)
    : undefined;
}
