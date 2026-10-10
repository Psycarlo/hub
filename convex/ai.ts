import { ConvexError, v } from "convex/values";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { action, internalMutation, mutation, query } from "./_generated/server";
import { requireAdmin, requireUser } from "./lib/access";
import { aiKey } from "./lib/env";
import type { AiModel, AiTask } from "./shared/ai";
import {
  AI_RUNS_PER_HOUR,
  AI_TASK_IDS,
  AI_TASKS,
  isAiTask,
  isModelId,
} from "./shared/ai";

const HOUR = 60 * 60 * 1000;
/** Runs counted for an admin's month at most; a hub runs far fewer. */
const MAX_COUNTED_RUNS = 10_000;
const MODELS_URL = "https://openrouter.ai/api/v1/models";

function cleanTask(task: string): AiTask {
  if (!isAiTask(task)) {
    throw new ConvexError("There’s no such AI task.");
  }
  return task;
}

/** The model a task runs on: the one an admin picked, or its default. */
async function modelFor(ctx: QueryCtx, task: AiTask): Promise<string> {
  const picked = await ctx.db
    .query("aiModels")
    .withIndex("by_task", (q) => q.eq("task", task))
    .unique();
  return picked?.model ?? AI_TASKS[task].defaultModel;
}

/** Whether AI tasks can run, so the app offers them only then. */
export const ready = query({
  args: {},
  handler: async (ctx): Promise<boolean> => {
    await requireUser(ctx);
    return aiKey() !== undefined;
  },
});

export interface AiTaskOverview {
  task: AiTask;
  name: string;
  description: string;
  model: string;
  defaultModel: string;
  /** This month's runs, and what they cost in USD as far as OpenRouter said. */
  runs: number;
  failed: number;
  cost: number;
}

/** Every task with its model and this month's runs, for admins; `since` is the month's start, in ms. */
export const overview = query({
  args: { since: v.number() },
  handler: async (
    ctx,
    { since }
  ): Promise<{ connected: boolean; tasks: AiTaskOverview[] }> => {
    await requireAdmin(ctx);
    const runs = await ctx.db
      .query("aiRuns")
      .withIndex("by_creation_time", (q) => q.gte("_creationTime", since))
      .take(MAX_COUNTED_RUNS);
    const tasks = await Promise.all(
      AI_TASK_IDS.map(async (task): Promise<AiTaskOverview> => {
        const own = runs.filter((run) => run.task === task);
        return {
          cost: own.reduce((sum, run) => sum + (run.cost ?? 0), 0),
          defaultModel: AI_TASKS[task].defaultModel,
          description: AI_TASKS[task].description,
          failed: own.filter((run) => !run.ok).length,
          model: await modelFor(ctx, task),
          name: AI_TASKS[task].name,
          runs: own.length,
          task,
        };
      })
    );
    return { connected: aiKey() !== undefined, tasks };
  },
});

/** Runs a task on another model from now on; null goes back to its default. */
export const setModel = mutation({
  args: { model: v.union(v.string(), v.null()), task: v.string() },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const task = cleanTask(args.task);
    const model = args.model?.trim() || null;
    if (model !== null && !isModelId(model)) {
      throw new ConvexError("That isn’t an OpenRouter model id.");
    }
    const picked = await ctx.db
      .query("aiModels")
      .withIndex("by_task", (q) => q.eq("task", task))
      .unique();
    if (model === null || model === AI_TASKS[task].defaultModel) {
      if (picked) {
        await ctx.db.delete(picked._id);
      }
      return;
    }
    await (picked
      ? ctx.db.patch(picked._id, { model, updatedBy: admin._id })
      : ctx.db.insert("aiModels", { model, task, updatedBy: admin._id }));
  },
});

interface OpenRouterModel {
  id: string;
  name: string;
  context_length?: number;
  pricing?: { prompt?: string; completion?: string };
  architecture?: { input_modalities?: string[]; output_modalities?: string[] };
}

/** USD per token, as OpenRouter writes it, per million; undefined for variable prices. */
function perMillion(price: string | undefined): number | undefined {
  const value = Number(price);
  return Number.isFinite(value) && value >= 0
    ? Math.round(value * 1e6 * 1000) / 1000
    : undefined;
}

/**
 * The models on OpenRouter a task can run on, cheapest first: they take in
 * what it needs and keep to a schema. The catalog is public, so this works
 * before a key is set too.
 */
export const models = action({
  args: { task: v.string() },
  handler: async (ctx, args): Promise<AiModel[]> => {
    const self: { admin: boolean } = await ctx.runQuery(
      internal.users.actor,
      {}
    );
    if (!self.admin) {
      throw new ConvexError("Only admins can do this.");
    }
    const task = cleanTask(args.task);
    const response = await fetch(
      `${MODELS_URL}?supported_parameters=structured_outputs`
    );
    if (!response.ok) {
      throw new ConvexError("OpenRouter didn’t answer. Try again.");
    }
    const { data } = (await response.json()) as { data: OpenRouterModel[] };
    const needs = AI_TASKS[task].inputs;
    return data
      .flatMap((model): AiModel[] => {
        const inputs = model.architecture?.input_modalities ?? [];
        const input = perMillion(model.pricing?.prompt);
        const output = perMillion(model.pricing?.completion);
        const writes =
          model.architecture?.output_modalities?.includes("text") ?? true;
        if (
          !(writes && needs.every((need) => inputs.includes(need))) ||
          input === undefined ||
          output === undefined
        ) {
          return [];
        }
        return [
          {
            context: model.context_length ?? 0,
            id: model.id,
            input,
            name: model.name,
            output,
          },
        ];
      })
      .toSorted(
        (a, b) =>
          a.input + a.output - (b.input + b.output) ||
          a.name.localeCompare(b.name)
      );
  },
});

/**
 * Starts a run of a task for someone, unless they ran too many in the last
 * hour. Resolves with the run and the model to use, or null.
 */
export const start = internalMutation({
  args: { task: v.string(), userId: v.id("users") },
  handler: async (
    ctx,
    args
  ): Promise<{ runId: Id<"aiRuns">; model: string } | null> => {
    const task = cleanTask(args.task);
    const recent = await ctx.db
      .query("aiRuns")
      .withIndex("by_user", (q) =>
        q.eq("userId", args.userId).gt("_creationTime", Date.now() - HOUR)
      )
      .take(AI_RUNS_PER_HOUR);
    if (recent.length >= AI_RUNS_PER_HOUR) {
      return null;
    }
    const model = await modelFor(ctx, task);
    const runId = await ctx.db.insert("aiRuns", {
      model,
      ok: false,
      task,
      userId: args.userId,
    });
    return { model, runId };
  },
});

/** Records how a run went and what it cost. */
export const finish = internalMutation({
  args: {
    cost: v.optional(v.number()),
    inputTokens: v.optional(v.number()),
    ok: v.boolean(),
    outputTokens: v.optional(v.number()),
    runId: v.id("aiRuns"),
  },
  handler: async (ctx, { runId, ...result }) => {
    await ctx.db.patch(runId, result);
  },
});
