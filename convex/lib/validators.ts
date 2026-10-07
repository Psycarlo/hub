import type { VLiteral, VString, VUnion } from "convex/values";
import { v } from "convex/values";

import {
  ACTIVITY_TYPES,
  CURRENCIES,
  FIELD_TYPES,
  STAGE_KINDS,
  TABLE_ICONS,
} from "../shared/crm";
import {
  APP_ROLES,
  LABELS,
  PRIORITIES,
  PROJECT_ROLES,
  SPRINT_STATUSES,
  STATUSES,
} from "../shared/model";
import type { HexColor } from "../shared/palette";
import { COLORS } from "../shared/palette";

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
export const vLabel = oneOf(LABELS);
export const vSprintStatus = oneOf(SPRINT_STATUSES);
export const vFieldType = oneOf(FIELD_TYPES);
export const vStageKind = oneOf(STAGE_KINDS);
export const vTableIcon = oneOf(TABLE_ICONS);
export const vCurrency = oneOf(CURRENCIES);
export const vActivityType = oneOf(ACTIVITY_TYPES.map(({ id }) => id));

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
