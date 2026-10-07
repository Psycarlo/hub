/** CRM tables, fields and records: what both the server and the app know about them. */
import type { Color } from "./palette";

export const FIELD_TYPES = [
  "title",
  "text",
  "longtext",
  "number",
  "currency",
  "select",
  "multiselect",
  "stage",
  "date",
  "checkbox",
  "email",
  "phone",
  "url",
  "location",
  "member",
  "relation",
] as const;

export const STAGE_KINDS = ["open", "won", "lost"] as const;

export const TABLE_ICONS = [
  "table",
  "store",
  "building",
  "users",
  "handshake",
  "coins",
  "bitcoin",
  "map",
  "calendar",
  "heart",
  "star",
  "briefcase",
] as const;

export const CURRENCIES = [
  "EUR",
  "USD",
  "GBP",
  "CHF",
  "BRL",
  "BTC",
  "SATS",
] as const;

export const ACTIVITY_TYPES = [
  { id: "note", label: "Note" },
  { id: "call", label: "Call" },
  { id: "email", label: "Email" },
  { id: "meeting", label: "Meeting" },
  { id: "visit", label: "Visit" },
  { id: "message", label: "Message" },
] as const;

export type FieldType = (typeof FIELD_TYPES)[number];
export type StageKind = (typeof STAGE_KINDS)[number];
export type TableIcon = (typeof TABLE_ICONS)[number];
export type Currency = (typeof CURRENCIES)[number];
export type ActivityType = (typeof ACTIVITY_TYPES)[number]["id"];

/** Table links that project pages use for themselves, like `/p/:project/docs`. */
export const RESERVED_TABLE_SLUGS: readonly string[] = [
  "docs",
  "portfolios",
  "settings",
];
/** Every table has exactly one title field, always first. */
export const TITLE_FIELD = "title";
/** Stage history kept on each record, oldest dropped first. */
export const MAX_MOVES = 100;
/** Rows one import takes. */
export const MAX_IMPORT = 500;

export interface FieldOption {
  id: string;
  label: string;
  color: Color;
  /** Only meaningful on stage fields: where the journey ends up. */
  kind: StageKind;
}

export interface Field {
  id: string;
  type: FieldType;
  name: string;
  options: FieldOption[];
  /** Currency code for currency fields, target table id for relations. */
  config: string;
}

export interface StageMove {
  stage: string;
  /** Milliseconds since the epoch. */
  at: number;
  by?: string;
}

export function shortId(): string {
  return crypto.randomUUID().replaceAll("-", "").slice(0, 8);
}

export function titleField(table: { fields: Field[] }): Field {
  return (
    table.fields.find((field) => field.type === "title") ?? {
      config: "",
      id: TITLE_FIELD,
      name: "Name",
      options: [],
      type: "title",
    }
  );
}

export function stageField(table: { fields: Field[] }): Field | undefined {
  return table.fields.find((field) => field.type === "stage");
}

export function findOption(
  field: Field,
  id: string | undefined
): FieldOption | undefined {
  return id === undefined
    ? undefined
    : field.options.find((option) => option.id === id);
}

export function firstValue(
  record: { values: Record<string, string[]> },
  field: string
): string | undefined {
  return record.values[field]?.[0];
}

export function recordTitle(record: { title: string }): string {
  return record.title.trim() || "Untitled";
}

/**
 * Fields as a table can hold them: exactly one title field, first, and at
 * most one stage field. A second title is dropped and a second stage becomes
 * a select.
 */
export function normalizeFields(fields: Field[]): Field[] {
  const seen = new Set<string>();
  let title: Field | undefined;
  let stage = false;
  const rest: Field[] = [];
  for (const field of fields) {
    if (seen.has(field.id)) {
      continue;
    }
    seen.add(field.id);
    if (field.type === "title") {
      title ??= field;
      continue;
    }
    if (field.type === "stage") {
      rest.push(stage ? { ...field, type: "select" } : field);
      stage = true;
      continue;
    }
    rest.push(field);
  }
  return [title ?? titleField({ fields: [] }), ...rest].map((field) => ({
    ...field,
    options: field.options.map((option) => ({
      ...option,
      kind: field.type === "stage" ? option.kind : "open",
    })),
  }));
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * A list as the user edited it, laid over its latest version: what they added,
 * changed or removed follows them, the rest follows the latest version, and
 * what others added meanwhile is kept at the end.
 */
function mergeById<T extends { id: string }>(
  base: readonly T[],
  mine: readonly T[],
  latest: readonly T[],
  mergeItem: (base: T, mine: T, latest: T) => T = (_, item) => item
): T[] {
  const before = new Map(base.map((item) => [item.id, item]));
  const now = new Map(latest.map((item) => [item.id, item]));
  const merged: T[] = [];
  for (const item of mine) {
    const original = before.get(item.id);
    const current = now.get(item.id);
    if (!original) {
      merged.push(item);
    } else if (current) {
      merged.push(
        same(original, item) ? current : mergeItem(original, item, current)
      );
    } else if (!same(original, item)) {
      // Removed meanwhile, but this user changed it: keep their version.
      merged.push(item);
    }
  }
  const kept = new Set(mine.map((item) => item.id));
  for (const item of latest) {
    if (!(before.has(item.id) || kept.has(item.id))) {
      merged.push(item);
    }
  }
  return merged;
}

/**
 * Fields as edited in the table settings, over the table's latest version, so
 * fields and options a teammate or an import added while the dialog was open
 * survive the save.
 */
export function mergeFields(
  base: readonly Field[],
  mine: readonly Field[],
  latest: readonly Field[]
): Field[] {
  return mergeById(base, mine, latest, (before, edited, current) => {
    const pick = <K extends "name" | "type" | "config">(key: K) =>
      edited[key] === before[key] ? current[key] : edited[key];
    return {
      config: pick("config"),
      id: edited.id,
      name: pick("name"),
      options: mergeById(before.options, edited.options, current.options),
      type: pick("type"),
    };
  });
}
