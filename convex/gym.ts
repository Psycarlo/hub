import { ConvexError, v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import {
  ifVisible,
  requireExercise,
  requireGym,
  requireProject,
  requireUser,
  visibleProjects,
} from "./lib/access";
import {
  cleanName,
  cleanNote,
  cleanRest,
  gymOf,
  requireGymOf,
  settle,
} from "./lib/gym";
import {
  vEquipment,
  vExerciseKind,
  vMuscle,
  vUnitSystem,
} from "./lib/validators";
import type { Muscle } from "./shared/gym";
import {
  DEFAULT_REST,
  MAX_BODY_WEIGHT,
  MAX_EXERCISES,
  MAX_EXERCISE_NAME,
  MIN_BODY_WEIGHT,
  exerciseKey,
} from "./shared/gym";

/** Gyms in every project the signed-in person can see: at most one each, in personal projects. */
export const list = query({
  args: {},
  handler: async (ctx): Promise<Doc<"gyms">[]> => {
    const user = await requireUser(ctx);
    const projects = await visibleProjects(ctx, user);
    const gyms = await Promise.all(
      projects
        .filter(({ project }) => project.personalFor)
        .map(({ project }) => gymOf(ctx, project._id))
    );
    return gyms.filter((gym) => gym !== null);
  },
});

/** Starts the gym in a personal project; resolves with its id, or the one it has. */
export const setup = mutation({
  args: { projectId: v.id("projects"), units: vUnitSystem },
  handler: async (ctx, { projectId, units }) => {
    const { project, user } = await requireProject(ctx, projectId, "edit");
    if (!project.personalFor) {
      throw new ConvexError("The gym lives in personal projects.");
    }
    const existing = await gymOf(ctx, projectId);
    if (existing) {
      return existing._id;
    }
    return await ctx.db.insert("gyms", {
      createdBy: user._id,
      projectId,
      rest: DEFAULT_REST,
      units,
    });
  },
});

export const update = mutation({
  args: {
    /** null clears it. */
    goalWeight: v.optional(v.union(v.number(), v.null())),
    gymId: v.id("gyms"),
    rest: v.optional(v.number()),
    units: v.optional(vUnitSystem),
  },
  handler: async (ctx, { gymId, goalWeight, rest, units }) => {
    await requireGym(ctx, gymId, "edit");
    const patch: Partial<Doc<"gyms">> = {};
    if (units !== undefined) {
      patch.units = units;
    }
    if (rest !== undefined) {
      patch.rest = cleanRest(rest);
    }
    if (goalWeight !== undefined) {
      if (
        goalWeight !== null &&
        !(goalWeight >= MIN_BODY_WEIGHT && goalWeight <= MAX_BODY_WEIGHT)
      ) {
        throw new ConvexError("That goal is off the scale.");
      }
      patch.goalWeight = goalWeight ?? undefined;
    }
    await ctx.db.patch(gymId, patch);
  },
});

/** The gym's exercises, archived ones included; null once out of reach. */
export const exercises = query({
  args: { projectId: v.id("projects") },
  handler: async (
    ctx,
    { projectId }
  ): Promise<Doc<"gymExercises">[] | null> => {
    const access = await ifVisible(requireProject(ctx, projectId, "view"));
    if (!access) {
      return null;
    }
    return await ctx.db
      .query("gymExercises")
      .withIndex("by_project_and_name", (q) => q.eq("projectId", projectId))
      .collect();
  },
});

/** A name no other exercise of the gym goes by, ready to keep, with its key. */
async function cleanExerciseName(
  ctx: QueryCtx,
  projectId: Id<"projects">,
  name: string,
  exerciseId?: Id<"gymExercises">
): Promise<{ name: string; nameKey: string }> {
  const cleaned = cleanName(
    name.replaceAll(/\s+/gu, " "),
    MAX_EXERCISE_NAME,
    "Give the exercise a name."
  );
  const nameKey = exerciseKey(cleaned);
  const taken = await ctx.db
    .query("gymExercises")
    .withIndex("by_project_and_name", (q) =>
      q.eq("projectId", projectId).eq("nameKey", nameKey)
    )
    .first();
  if (taken && taken._id !== exerciseId) {
    throw new ConvexError(`You have ${taken.name} already.`);
  }
  return { name: cleaned, nameKey };
}

/** Each muscle once, and none both trained most and along the way. */
function cleanMuscles(
  muscles: readonly Muscle[],
  secondary: readonly Muscle[]
): { muscles: Muscle[]; secondary: Muscle[] } {
  const main = [...new Set(muscles)];
  return {
    muscles: main,
    secondary: [...new Set(secondary)].filter(
      (muscle) => !main.includes(muscle)
    ),
  };
}

export const createExercise = mutation({
  args: {
    equipment: v.optional(vEquipment),
    kind: vExerciseKind,
    muscles: v.array(vMuscle),
    name: v.string(),
    note: v.optional(v.string()),
    projectId: v.id("projects"),
    rest: v.optional(v.number()),
    secondary: v.array(vMuscle),
  },
  handler: async (ctx, args) => {
    const { user } = await requireGymOf(ctx, args.projectId, "edit");
    const existing = await ctx.db
      .query("gymExercises")
      .withIndex("by_project_and_name", (q) =>
        q.eq("projectId", args.projectId)
      )
      .take(MAX_EXERCISES);
    if (existing.length >= MAX_EXERCISES) {
      throw new ConvexError(`A gym can know up to ${MAX_EXERCISES} exercises.`);
    }
    return await ctx.db.insert("gymExercises", {
      ...(await cleanExerciseName(ctx, args.projectId, args.name)),
      ...cleanMuscles(args.muscles, args.secondary),
      createdBy: user._id,
      equipment: args.equipment,
      kind: args.kind,
      note: cleanNote(args.note ?? ""),
      projectId: args.projectId,
      records: [],
      rest: args.rest === undefined ? undefined : cleanRest(args.rest),
    });
  },
});

export const updateExercise = mutation({
  args: {
    archived: v.optional(v.boolean()),
    /** null clears it. */
    equipment: v.optional(v.union(vEquipment, v.null())),
    exerciseId: v.id("gymExercises"),
    kind: v.optional(vExerciseKind),
    muscles: v.optional(v.array(vMuscle)),
    name: v.optional(v.string()),
    note: v.optional(v.string()),
    /** null takes the gym's. */
    rest: v.optional(v.union(v.number(), v.null())),
    secondary: v.optional(v.array(vMuscle)),
  },
  handler: async (ctx, { exerciseId, ...changes }) => {
    const { exercise } = await requireExercise(ctx, exerciseId, "edit");
    const patch: Partial<Doc<"gymExercises">> = {};
    if (changes.name !== undefined) {
      Object.assign(
        patch,
        await cleanExerciseName(
          ctx,
          exercise.projectId,
          changes.name,
          exerciseId
        )
      );
    }
    if (changes.muscles !== undefined || changes.secondary !== undefined) {
      Object.assign(
        patch,
        cleanMuscles(
          changes.muscles ?? exercise.muscles,
          changes.secondary ?? exercise.secondary
        )
      );
    }
    if (changes.equipment !== undefined) {
      patch.equipment = changes.equipment ?? undefined;
    }
    if (changes.rest !== undefined) {
      patch.rest = changes.rest === null ? undefined : cleanRest(changes.rest);
    }
    if (changes.note !== undefined) {
      patch.note = cleanNote(changes.note);
    }
    if (changes.archived !== undefined) {
      patch.archived = changes.archived || undefined;
    }
    if (changes.kind !== undefined) {
      patch.kind = changes.kind;
    }
    await ctx.db.patch(exerciseId, patch);
    if (changes.kind !== undefined && changes.kind !== exercise.kind) {
      // Another kind keeps other records.
      await settle(ctx, { exerciseIds: [exerciseId], workoutIds: [] });
    }
  },
});

/** Deletes the exercise, and with it every time it was done and its place in routines. */
export const removeExercise = mutation({
  args: { exerciseId: v.id("gymExercises") },
  handler: async (ctx, { exerciseId }) => {
    const { exercise } = await requireExercise(ctx, exerciseId, "edit");
    await ctx.db.delete(exerciseId);
    await ctx.scheduler.runAfter(0, internal.cleanup.gymExercise, {
      exerciseId,
      projectId: exercise.projectId,
    });
  },
});
