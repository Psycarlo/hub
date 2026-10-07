import { ConvexError, v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { deleteRecord as deleteRecordDeep } from "./cleanup";
import {
  ifVisible,
  requireProject,
  requireRecord,
  requireTable,
  requireUser,
  visibleProjects,
} from "./lib/access";
import { vActivityType, vField, vTableIcon, vValues } from "./lib/validators";
import type { Field, StageMove } from "./shared/crm";
import {
  MAX_IMPORT,
  MAX_MOVES,
  normalizeFields,
  RESERVED_TABLE_SLUGS,
  stageField,
} from "./shared/crm";
import { slugify, uniqueSlug } from "./shared/slug";

const MAX_TITLE = 300;
const MAX_VALUE = 10_000;
const MAX_ACTIVITY = 10_000;

type Values = Doc<"crmRecords">["values"];

function without(values: Values, fieldId: string): Values {
  return Object.fromEntries(
    Object.entries(values).filter(([key]) => key !== fieldId)
  );
}

/** Tables of every project the signed-in person can see, for navigation. */
export const navTables = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const projects = await visibleProjects(ctx, user);
    const tables = await Promise.all(
      projects.map(({ project }) =>
        ctx.db
          .query("crmTables")
          .withIndex("by_project", (q) => q.eq("projectId", project._id))
          .collect()
      )
    );
    return tables.flat().map((table) => ({
      _creationTime: table._creationTime,
      _id: table._id,
      icon: table.icon,
      projectId: table.projectId,
      slug: table.slug,
      title: table.title,
    }));
  },
});

/** A project's tables and all their records. */
export const project = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    if (!(await ifVisible(requireProject(ctx, projectId, "view")))) {
      return null;
    }
    const [tables, records] = await Promise.all([
      ctx.db
        .query("crmTables")
        .withIndex("by_project", (q) => q.eq("projectId", projectId))
        .collect(),
      ctx.db
        .query("crmRecords")
        .withIndex("by_project", (q) => q.eq("projectId", projectId))
        .collect(),
    ]);
    return {
      records: records.toSorted(
        (a, b) => a.rank - b.rank || a._creationTime - b._creationTime
      ),
      tables: tables.toSorted((a, b) => a._creationTime - b._creationTime),
    };
  },
});

async function takenSlugs(
  ctx: QueryCtx,
  projectId: Id<"projects">,
  except?: Id<"crmTables">
): Promise<Set<string>> {
  const tables = await ctx.db
    .query("crmTables")
    .withIndex("by_project", (q) => q.eq("projectId", projectId))
    .collect();
  return new Set([
    ...RESERVED_TABLE_SLUGS,
    ...tables
      .filter((table) => table._id !== except)
      .map((table) => table.slug),
  ]);
}

function cleanText(value: string, fallback: string, max = MAX_TITLE): string {
  return value.trim().slice(0, max) || fallback;
}

function cleanFields(fields: Field[]): Field[] {
  return normalizeFields(
    fields.map((field) => ({
      ...field,
      name: cleanText(field.name, "Untitled"),
      options: field.options.map((option) => ({
        ...option,
        label: cleanText(option.label, "Untitled"),
      })),
    }))
  );
}

/** Relations only point at tables of the same project; others are unlinked. */
async function scopeRelations(
  ctx: QueryCtx,
  projectId: Id<"projects">,
  fields: Field[]
): Promise<Field[]> {
  return await Promise.all(
    fields.map(async (field) => {
      if (field.type !== "relation" || !field.config) {
        return field;
      }
      const id = ctx.db.normalizeId("crmTables", field.config);
      const target = id ? await ctx.db.get(id) : null;
      return target?.projectId === projectId ? field : { ...field, config: "" };
    })
  );
}

/** Values the table can hold: known fields, no empty ones, stages from the list. */
function cleanValues(table: Doc<"crmTables">, values: Values): Values {
  const fields = new Map(table.fields.map((field) => [field.id, field]));
  const clean: Values = {};
  for (const [fieldId, list] of Object.entries(values)) {
    const field = fields.get(fieldId);
    if (!field || field.type === "title") {
      continue;
    }
    let kept = list.map((value) => value.slice(0, MAX_VALUE)).filter(Boolean);
    if (field.type === "stage" || field.type === "select") {
      kept = kept
        .filter((value) => field.options.some((option) => option.id === value))
        .slice(0, 1);
    } else if (field.type !== "multiselect") {
      kept = kept.slice(0, 1);
    }
    if (kept.length > 0) {
      clean[fieldId] = [...new Set(kept)];
    }
  }
  return clean;
}

/** Entering a new stage is remembered on the record, so its journey can be told later. */
function withMove(
  table: Doc<"crmTables">,
  before: Values | undefined,
  after: Values,
  moves: StageMove[],
  by: Id<"users">
): StageMove[] {
  const field = stageField(table);
  const stage = field ? after[field.id]?.[0] : undefined;
  if (!(field && stage) || stage === before?.[field.id]?.[0]) {
    return moves;
  }
  return [...moves, { at: Date.now(), by, stage }].slice(-MAX_MOVES);
}

export const createTables = mutation({
  args: {
    projectId: v.id("projects"),
    tables: v.array(
      v.object({
        description: v.string(),
        fields: v.array(vField),
        icon: vTableIcon,
        /** What other tables in the same call use to point at this one. */
        ref: v.string(),
        singular: v.string(),
        title: v.string(),
      })
    ),
  },
  handler: async (ctx, { projectId, tables }) => {
    const { user } = await requireProject(ctx, projectId, "edit");
    const taken = await takenSlugs(ctx, projectId);
    const created: { _id: Id<"crmTables">; slug: string; ref: string }[] = [];
    for (const spec of tables) {
      const title = cleanText(spec.title, "Untitled");
      const slug = uniqueSlug(slugify(title), taken);
      taken.add(slug);
      const tableId = await ctx.db.insert("crmTables", {
        createdBy: user._id,
        description: spec.description.trim(),
        fields: cleanFields(spec.fields),
        icon: spec.icon,
        projectId,
        singular: cleanText(spec.singular, "Record"),
        slug,
        title,
      });
      created.push({ _id: tableId, ref: spec.ref, slug });
    }
    // Relations name tables by their refs until the tables exist.
    const ids = new Map(created.map((table) => [table.ref, table._id]));
    for (const { _id } of created) {
      const table = await ctx.db.get(_id);
      if (table) {
        const named = table.fields.map((field) =>
          field.type === "relation" && ids.has(field.config)
            ? { ...field, config: ids.get(field.config) ?? "" }
            : field
        );
        await ctx.db.patch(_id, {
          fields: await scopeRelations(ctx, projectId, named),
        });
      }
    }
    return created.map(({ _id, slug }) => ({ _id, slug }));
  },
});

export const updateTable = mutation({
  args: {
    description: v.optional(v.string()),
    fields: v.optional(v.array(vField)),
    icon: v.optional(vTableIcon),
    singular: v.optional(v.string()),
    tableId: v.id("crmTables"),
    title: v.optional(v.string()),
  },
  handler: async (ctx, { tableId, ...changes }) => {
    const { table } = await requireTable(ctx, tableId, "edit");
    const patch: Partial<Doc<"crmTables">> = {};
    const fields = changes.fields
      ? await scopeRelations(ctx, table.projectId, changes.fields)
      : undefined;
    if (changes.title !== undefined) {
      patch.title = cleanText(changes.title, table.title);
    }
    if (changes.singular !== undefined) {
      patch.singular = cleanText(changes.singular, table.singular);
    }
    if (changes.description !== undefined) {
      patch.description = changes.description.trim();
    }
    if (changes.icon !== undefined) {
      patch.icon = changes.icon;
    }
    if (changes.fields !== undefined) {
      patch.fields = cleanFields(fields ?? changes.fields);
    }
    await ctx.db.patch(tableId, patch);
  },
});

/** Deletes the table for everyone, with its records. */
export const deleteTable = mutation({
  args: { tableId: v.id("crmTables") },
  handler: async (ctx, { tableId }) => {
    await requireTable(ctx, tableId, "edit");
    await ctx.db.delete(tableId);
    await ctx.scheduler.runAfter(0, internal.cleanup.table, { tableId });
  },
});

export const createRecord = mutation({
  args: {
    rank: v.number(),
    tableId: v.id("crmTables"),
    title: v.string(),
    values: vValues,
  },
  handler: async (ctx, { tableId, title, values, rank }) => {
    const { table, user } = await requireTable(ctx, tableId, "edit");
    const clean = cleanValues(table, values);
    return await ctx.db.insert("crmRecords", {
      createdBy: user._id,
      moves: withMove(table, undefined, clean, [], user._id),
      projectId: table.projectId,
      rank,
      tableId,
      title: title.trim().slice(0, MAX_TITLE),
      updatedAt: Date.now(),
      values: clean,
    });
  },
});

export const updateRecord = mutation({
  args: {
    rank: v.optional(v.number()),
    recordId: v.id("crmRecords"),
    title: v.optional(v.string()),
  },
  handler: async (ctx, { recordId, title, rank }) => {
    await requireRecord(ctx, recordId, "edit");
    const patch: Partial<Doc<"crmRecords">> = { updatedAt: Date.now() };
    if (title !== undefined) {
      patch.title = title.trim().slice(0, MAX_TITLE);
    }
    if (rank !== undefined) {
      patch.rank = rank;
    }
    await ctx.db.patch(recordId, patch);
  },
});

/**
 * Sets one field on one or more records of a table. Only that field changes,
 * so teammates editing other fields of the same record keep their edits.
 */
export const setValues = mutation({
  args: {
    fieldId: v.string(),
    recordIds: v.array(v.id("crmRecords")),
    values: v.array(v.string()),
  },
  handler: async (ctx, { recordIds, fieldId, values }) => {
    const [first] = recordIds;
    if (!first) {
      return;
    }
    const { table, user } = await requireRecord(ctx, first, "edit");
    const now = Date.now();
    for (const recordId of recordIds) {
      const record = await ctx.db.get(recordId);
      if (record?.tableId !== table._id) {
        throw new ConvexError("Records can only change within their table.");
      }
      const next = cleanValues(table, {
        ...without(record.values, fieldId),
        [fieldId]: values,
      });
      await ctx.db.patch(recordId, {
        moves: withMove(table, record.values, next, record.moves, user._id),
        updatedAt: now,
        values: next,
      });
    }
  },
});

/** Records dropped somewhere else on the pipeline: a new rank, and maybe a new stage. */
export const moveRecords = mutation({
  args: {
    moves: v.array(
      v.object({
        rank: v.number(),
        recordId: v.id("crmRecords"),
        /** The stage option's id, or null for no stage. */
        stage: v.optional(v.union(v.string(), v.null())),
      })
    ),
  },
  handler: async (ctx, { moves }) => {
    const [first] = moves;
    if (!first) {
      return;
    }
    const { table, user } = await requireRecord(ctx, first.recordId, "edit");
    const field = stageField(table);
    const now = Date.now();
    for (const { recordId, rank, stage } of moves) {
      const record = await ctx.db.get(recordId);
      if (record?.tableId !== table._id) {
        throw new ConvexError("Records can only move within their table.");
      }
      const patch: Partial<Doc<"crmRecords">> = { rank, updatedAt: now };
      if (field && stage !== undefined) {
        const rest = without(record.values, field.id);
        const next = cleanValues(
          table,
          stage === null ? rest : { ...rest, [field.id]: [stage] }
        );
        patch.values = next;
        patch.moves = withMove(
          table,
          record.values,
          next,
          record.moves,
          user._id
        );
      }
      await ctx.db.patch(recordId, patch);
    }
  },
});

export const deleteRecords = mutation({
  args: { recordIds: v.array(v.id("crmRecords")) },
  handler: async (ctx, { recordIds }) => {
    const [first] = recordIds;
    if (!first) {
      return;
    }
    const { table } = await requireRecord(ctx, first, "edit");
    for (const recordId of recordIds) {
      const record = await ctx.db.get(recordId);
      if (record?.tableId === table._id) {
        await deleteRecordDeep(ctx, recordId);
      }
    }
  },
});

/**
 * Adds rows from a CSV import in one go. Fields come along when the import
 * added options for labels the table didn't have yet.
 */
export const importRecords = mutation({
  args: {
    fields: v.optional(v.array(vField)),
    records: v.array(
      v.object({ rank: v.number(), title: v.string(), values: vValues })
    ),
    tableId: v.id("crmTables"),
  },
  handler: async (ctx, { tableId, fields, records }) => {
    const access = await requireTable(ctx, tableId, "edit");
    if (records.length > MAX_IMPORT) {
      throw new ConvexError(`Import at most ${MAX_IMPORT} rows at once.`);
    }
    let { table } = access;
    if (fields) {
      await ctx.db.patch(tableId, {
        fields: cleanFields(await scopeRelations(ctx, table.projectId, fields)),
      });
      table = (await ctx.db.get(tableId)) ?? table;
    }
    const now = Date.now();
    for (const row of records) {
      const values = cleanValues(table, row.values);
      await ctx.db.insert("crmRecords", {
        createdBy: access.user._id,
        moves: withMove(table, undefined, values, [], access.user._id),
        projectId: table.projectId,
        rank: row.rank,
        tableId,
        title: row.title.trim().slice(0, MAX_TITLE),
        updatedAt: now,
        values,
      });
    }
    return records.length;
  },
});

/** Notes, calls and visits logged on a record, newest first. */
export const activity = query({
  args: { recordId: v.id("crmRecords") },
  handler: async (ctx, { recordId }) => {
    if (!(await ifVisible(requireRecord(ctx, recordId, "view")))) {
      return [];
    }
    const entries = await ctx.db
      .query("crmActivity")
      .withIndex("by_record", (q) => q.eq("recordId", recordId))
      .order("desc")
      .collect();
    return entries.map((entry) => ({
      _creationTime: entry._creationTime,
      _id: entry._id,
      authorId: entry.authorId,
      content: entry.content,
      kind: entry.kind,
    }));
  },
});

export const addActivity = mutation({
  args: {
    content: v.string(),
    kind: vActivityType,
    recordId: v.id("crmRecords"),
  },
  handler: async (ctx, { recordId, kind, content }) => {
    const { user } = await requireRecord(ctx, recordId, "edit");
    const text = content.trim().slice(0, MAX_ACTIVITY);
    if (!text) {
      throw new ConvexError("Write something first.");
    }
    await ctx.db.insert("crmActivity", {
      authorId: user._id,
      content: text,
      kind,
      recordId,
    });
    await ctx.db.patch(recordId, { updatedAt: Date.now() });
  },
});

export const removeActivity = mutation({
  args: { activityId: v.id("crmActivity") },
  handler: async (ctx, { activityId }) => {
    const entry = await ctx.db.get(activityId);
    if (!entry) {
      return;
    }
    const { user } = await requireRecord(ctx, entry.recordId, "edit");
    if (entry.authorId !== user._id) {
      throw new ConvexError("You can only delete what you logged.");
    }
    await ctx.db.delete(activityId);
  },
});
