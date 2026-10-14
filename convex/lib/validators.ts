import type { Infer, VLiteral, VString, VUnion } from "convex/values";
import { v } from "convex/values";

import { FONT_SOURCES, LOGO_KINDS, LOGO_MODES } from "../shared/brands";
import {
  BODIES,
  BOTTOMS,
  CHEEKS,
  EYES,
  FACIAL_HAIR,
  GLASSES,
  HAIR_STYLES,
  HATS,
  MOUTHS,
  TOPS,
} from "../shared/character";
import {
  ACTIVITY_TYPES,
  CURRENCIES,
  FIELD_TYPES,
  STAGE_KINDS,
  TABLE_ICONS,
} from "../shared/crm";
import { CARD_NETWORKS, ENTRY_KINDS } from "../shared/finance";
import {
  EQUIPMENT,
  EXERCISE_KINDS,
  MUSCLES,
  RECORD_KINDS,
  SET_TYPES,
  UNIT_SYSTEMS,
} from "../shared/gym";
import { HABIT_ICONS } from "../shared/habits";
import { TOPIC_ICONS } from "../shared/log";
import {
  APP_ROLES,
  PRIORITIES,
  PROJECT_ROLES,
  SPRINT_STATUSES,
  STATUSES,
} from "../shared/model";
import { CARD_NEWS, ENTRY_NEWS, FILE_NEWS } from "../shared/notifications";
import { EMOTES } from "../shared/office";
import type { HexColor } from "../shared/palette";
import { COLORS } from "../shared/palette";
import { FIATS, TRANSACTION_KINDS } from "../shared/portfolio";
import {
  CLOCK_LOOKS,
  HOUR_CYCLES,
  TASK_SCOPES,
  TASK_SORTS,
  TIMEFRAMES,
} from "../shared/widgets";

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
/** A palette color, or any other picked off it, as projects and habits take. */
export const vAnyColor = v.union(vColor, vHexColor);
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
export const vCardNetwork = oneOf(CARD_NETWORKS);
export const vHabitIcon = oneOf(HABIT_ICONS);
export const vTopicIcon = oneOf(TOPIC_ICONS);
export const vUnitSystem = oneOf(UNIT_SYSTEMS);
export const vExerciseKind = oneOf(EXERCISE_KINDS);
export const vSetType = oneOf(SET_TYPES);
export const vMuscle = oneOf(MUSCLES);
export const vEquipment = oneOf(EQUIPMENT);
export const vRecordKind = oneOf(RECORD_KINDS);
export const vTimeframe = oneOf(TIMEFRAMES);
export const vTaskScope = oneOf(TASK_SCOPES);
export const vClockLook = oneOf(CLOCK_LOOKS);
export const vHourCycle = oneOf(HOUR_CYCLES);
export const vTaskSort = oneOf(TASK_SORTS);
export const vEmote = oneOf(EMOTES);
export const vLogoKind = oneOf(LOGO_KINDS);
export const vLogoMode = oneOf(LOGO_MODES);
export const vFontSource = oneOf(FONT_SOURCES);

/** A tile in the office, x across and y from the back wall. */
export const vTile = v.object({ x: v.number(), y: v.number() });

/**
 * Someone's character: what they wear, and every color as `#rrggbb`. Fields
 * added since characters were first saved are optional, missing on those.
 */
export const vCharacter = v.object({
  body: v.optional(oneOf(BODIES)),
  bottom: v.optional(oneOf(BOTTOMS)),
  bottomColor: vHexColor,
  cheeks: v.optional(oneOf(CHEEKS)),
  eyes: v.optional(oneOf(EYES)),
  facialHair: v.optional(oneOf(FACIAL_HAIR)),
  glasses: oneOf(GLASSES),
  glassesColor: v.optional(vHexColor),
  hair: oneOf(HAIR_STYLES),
  hairColor: vHexColor,
  hat: oneOf(HATS),
  hatColor: vHexColor,
  mouth: v.optional(oneOf(MOUTHS)),
  shoesColor: vHexColor,
  skin: vHexColor,
  top: oneOf(TOPS),
  topColor: vHexColor,
});

export const vBoardLabel = v.object({
  color: vColor,
  id: v.string(),
  name: v.string(),
});

/** One of a brand's colors; its place in the list says how much it leads. */
export const vBrandColor = v.object({
  hex: vHexColor,
  id: v.string(),
  /** Empty when it goes by its hex alone. */
  name: v.string(),
});

/** A typeface a brand uses, and what for. */
export const vBrandFont = v.object({
  /** As Google Fonts or the files name it, like `Inter`. */
  family: v.string(),
  id: v.string(),
  /** What it's used for, like "Headings"; empty for nothing in particular. */
  role: v.string(),
  source: vFontSource,
  /** The weights used, from Google Fonts; uploaded files tell their own. */
  weights: v.array(v.number()),
});

/** Where a brand's file sits: in a logo slot, among its banners, or with a typeface. */
export const vBrandPlace = v.union(
  v.object({ kind: v.literal("logo"), logo: vLogoKind, mode: vLogoMode }),
  v.object({ kind: v.literal("banner") }),
  v.object({ fontId: v.string(), kind: v.literal("font") })
);

/** An account drawn as a card in a leather wallet, rather than a plain tile. */
export const vAccountLook = v.object({
  /** The card peeking out of the wallet. */
  card: vHexColor,
  /** Whose logo the card shows; a chip alone otherwise. */
  network: v.optional(vCardNetwork),
  /** The wallet's leather. */
  wallet: vHexColor,
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

export const vCardNews = oneOf(CARD_NEWS);
export const vFileNews = oneOf(FILE_NEWS);
export const vEntryNews = oneOf(ENTRY_NEWS);

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
 * One set of an exercise in a workout. Its numbers are metric: kilograms,
 * seconds and meters. Which it has goes by the exercise's kind.
 */
export const vGymSet = v.object({
  /** Done in the gym. One not done yet is still to do, and counts toward nothing. */
  done: v.boolean(),
  /** Lighter weights taken straight after it, without rest, and the reps of each. */
  drops: v.optional(
    v.array(v.object({ reps: v.number(), weight: v.number() }))
  ),
  /** Stays with the set through edits, so what's kept or said about it finds it. */
  id: v.string(),
  meters: v.optional(v.number()),
  reps: v.optional(v.number()),
  seconds: v.optional(v.number()),
  type: vSetType,
  /** Lifted, or added to the body on a reps exercise. */
  weight: v.optional(v.number()),
});

export type GymSet = Infer<typeof vGymSet>;

/** A set a routine aims for, before it's done. */
export const vTargetSet = v.object({
  meters: v.optional(v.number()),
  reps: v.optional(v.number()),
  seconds: v.optional(v.number()),
  type: vSetType,
  weight: v.optional(v.number()),
});

export type TargetSet = Infer<typeof vTargetSet>;

/** The best an exercise has done of one kind, and when. */
export const vGymRecord = v.object({
  /** When the workout it was done in started, in ms. */
  at: v.number(),
  kind: vRecordKind,
  /** The set's reps, to say how an estimated max came about. */
  reps: v.optional(v.number()),
  value: v.number(),
  /** The set's weight, in kilograms. */
  weight: v.optional(v.number()),
  workoutId: v.id("gymWorkouts"),
});

export type GymRecord = Infer<typeof vGymRecord>;

/** What a workout's sets add up to, kept on it so lists needn't read them. */
export const vWorkoutSummary = v.object({
  /** Its exercises in order, with the sets of each that count. */
  exercises: v.array(
    v.object({ exerciseId: v.id("gymExercises"), sets: v.number() })
  ),
  /** Records beaten, across its exercises. */
  prs: v.number(),
  /** Sets done that count: warm-ups don't. */
  sets: v.number(),
  /** Kilograms moved in them. */
  volume: v.number(),
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
  }),
  v.object({ type: v.literal("log") }),
  v.object({ type: v.literal("gym") }),
  v.object({ type: v.literal("bodyWeight") }),
  v.object({
    /** Missing follows the person's locale. */
    hours: v.optional(vHourCycle),
    look: vClockLook,
    /**
     * An IANA time zone, like `Europe/Lisbon`; mutations check it's one there
     * is. Missing follows the device's own.
     */
    timeZone: v.optional(v.string()),
    type: v.literal("clock"),
  })
);

export type WidgetSettings = Infer<typeof vWidgetSettings>;

/**
 * Something done to a Drive file, as its activity tells it. Folders are kept
 * by name, as they were called then; a missing one is the top of the Drive.
 */
export const vDriveChange = v.union(
  v.object({ kind: v.literal("uploaded") }),
  v.object({ from: v.string(), kind: v.literal("renamed"), to: v.string() }),
  v.object({
    from: v.optional(v.string()),
    kind: v.literal("moved"),
    to: v.optional(v.string()),
  }),
  v.object({ kind: v.literal("trashed") }),
  v.object({ kind: v.literal("restored") })
);

export type DriveChange = Infer<typeof vDriveChange>;
