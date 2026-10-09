import type { Infer, VLiteral, VString, VUnion } from "convex/values";
import { v } from "convex/values";

import {
  ACTIVITY_TYPES,
  CURRENCIES,
  FIELD_TYPES,
  STAGE_KINDS,
  TABLE_ICONS,
} from "../shared/crm";
import { ENTRY_KINDS } from "../shared/finance";
import { HABIT_ICONS } from "../shared/habits";
import {
  APP_ROLES,
  PRIORITIES,
  PROJECT_ROLES,
  SPRINT_STATUSES,
  STATUSES,
} from "../shared/model";
import type { HexColor } from "../shared/palette";
import { COLORS } from "../shared/palette";
import { FIATS, TRANSACTION_KINDS } from "../shared/portfolio";
import { TASK_SCOPES, TASK_SORTS, TIMEFRAMES } from "../shared/widgets";

type OneOf<T extends string> = VUnion<T, VLiteral<T, "required">[], "required">;

/** A validator for one of the strings in a list. */
function oneOf<const T extends string>(values: readonly T[]): OneOf<T> {
  const [first, second, ...rest] = values.map((value) => v.literal(value));
  if (!(first && second)) {
    throw new Error("oneOf needs at least two values.");
  }
  return v.union(first, second, ...rest) as unknown as OneOf<T>;
}

export const vColor = oneOf(COLORS);
/** Any string to the validator; mutations check it's really `#rrggbb`. */
export const vHexColor = v.string() as VString<HexColor>;
/** Projects take a palette color, or any other picked off it. */
export const vProjectColor = v.union(vColor, vHexColor);
export const vAppRole = oneOf(APP_ROLES);
export const vProjectRole = oneOf(PROJECT_ROLES);
export const vStatus = oneOf(STATUSES.map(({ id }) => id));
export const vPriority = oneOf(PRIORITIES.map(({ id }) => id));
export const vSprintStatus = oneOf(SPRINT_STATUSES);
export const vFieldType = oneOf(FIELD_TYPES);
export const vStageKind = oneOf(STAGE_KINDS);
export const vTableIcon = oneOf(TABLE_ICONS);
export const vCurrency = oneOf(CURRENCIES);
export const vActivityType = oneOf(ACTIVITY_TYPES.map(({ id }) => id));
export const vFiat = oneOf(FIATS);
export const vTransactionKind = oneOf(TRANSACTION_KINDS);
export const vEntryKind = oneOf(ENTRY_KINDS);
export const vHabitIcon = oneOf(HABIT_ICONS);
export const vTimeframe = oneOf(TIMEFRAMES);
export const vTaskScope = oneOf(TASK_SCOPES);
export const vTaskSort = oneOf(TASK_SORTS);

export const vBoardLabel = v.object({
  color: vColor,
  id: v.string(),
  name: v.string(),
});

/** What a board's new cards start with, before anything is picked. */
export const vCardDefaults = v.object({
  assignees: v.array(v.id("users")),
  /** Ids of the board's labels. */
  labels: v.array(v.string()),
  priority: v.optional(vPriority),
});

/** A sprint as a card's history keeps it, should it be deleted later. */
const vSprintRef = v.object({ id: v.id("sprints"), title: v.string() });

/** One change to a card, as its activity tells it. Labels are kept whole, like sprints. */
export const vCardChange = v.union(
  v.object({ from: v.string(), kind: v.literal("title"), to: v.string() }),
  v.object({ kind: v.literal("description") }),
  v.object({ from: vStatus, kind: v.literal("status"), to: vStatus }),
  v.object({
    from: v.optional(vPriority),
    kind: v.literal("priority"),
    to: v.optional(vPriority),
  }),
  v.object({
    from: v.optional(v.string()),
    kind: v.literal("due"),
    to: v.optional(v.string()),
  }),
  v.object({
    from: v.array(v.id("users")),
    kind: v.literal("assignees"),
    to: v.array(v.id("users")),
  }),
  v.object({
    from: v.array(vBoardLabel),
    kind: v.literal("labels"),
    to: v.array(vBoardLabel),
  }),
  v.object({
    from: v.optional(vSprintRef),
    kind: v.literal("sprint"),
    to: v.optional(vSprintRef),
  }),
  v.object({
    kind: v.literal("attachments"),
    names: v.array(v.string()),
    removed: v.boolean(),
  })
);

export type CardChange = Infer<typeof vCardChange>;

/** A file just uploaded to R2, described by the app that uploaded it. */
export const vUpload = v.object({
  key: v.string(),
  name: v.string(),
  size: v.number(),
  type: v.string(),
});

export type Upload = Infer<typeof vUpload>;

export const vFieldOption = v.object({
  color: vColor,
  id: v.string(),
  kind: vStageKind,
  label: v.string(),
});

export const vField = v.object({
  config: v.string(),
  id: v.string(),
  name: v.string(),
  options: v.array(vFieldOption),
  type: vFieldType,
});

export const vStageMove = v.object({
  at: v.number(),
  by: v.optional(v.string()),
  stage: v.string(),
});

/** Field id to values; most fields hold one, multi-selects hold several. */
export const vValues = v.record(v.string(), v.array(v.string()));

export const vMember = v.object({
  role: vProjectRole,
  userId: v.id("users"),
});

/**
 * What a widget shows and how. Each kind of widget has settings of its own,
 * told apart by `type`; a new kind adds its object here.
 */
export const vWidgetSettings = v.union(
  v.object({
    /** Missing follows the person's own currency. */
    currency: v.optional(vFiat),
    timeframe: vTimeframe,
    type: v.literal("bitcoinPrice"),
  }),
  v.object({
    scope: vTaskScope,
    sort: vTaskSort,
    type: v.literal("myTasks"),
  }),
  v.object({
    /** One account to follow; missing follows every account in the total. */
    accountId: v.optional(v.id("financeAccounts")),
    type: v.literal("finance"),
  }),
  v.object({
    /** One habit to follow; missing lists every habit. */
    habitId: v.optional(v.id("habits")),
    type: v.literal("habits"),
  })
);

export type WidgetSettings = Infer<typeof vWidgetSettings>;
