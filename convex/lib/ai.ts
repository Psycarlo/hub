/**
 * Runs AI tasks on OpenRouter, through the AI SDK. Set OPENROUTER_API_KEY on
 * the deployment to turn them on; admins pick each task's model in Admin.
 * A task is declared in convex/shared/ai.ts, then run from an action with
 * `runTask`, which picks its model, limits runs per person and records what
 * each cost.
 */
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModelUsage, UserContent } from "ai";
import { generateText, NoObjectGeneratedError, Output } from "ai";
import type { z } from "zod";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import type { AiTask } from "../shared/ai";
import { aiKey } from "./env";

/** Why a task didn't run: there's no key, the person ran too many lately, or the model failed. */
export type AiFailure = "off" | "limit" | "failed";

export class AiError extends Error {
  override name = "AiError";
  readonly reason: AiFailure;

  constructor(reason: AiFailure, message: string = reason) {
    super(message);
    this.reason = reason;
  }
}

interface RunUsage {
  cost?: number;
  inputTokens?: number;
  outputTokens?: number;
}

function usageOf(
  usage: LanguageModelUsage | undefined,
  metadata?: Record<string, unknown>
): RunUsage {
  // OpenRouter says what the run cost, in USD, alongside the tokens.
  const openrouter = metadata?.openrouter as
    | { usage?: { cost?: number } }
    | undefined;
  return {
    cost: openrouter?.usage?.cost,
    inputTokens: usage?.inputTokens,
    outputTokens: usage?.outputTokens,
  };
}

/**
 * Runs a task on its model and returns what the model made of `content`,
 * shaped and checked by `schema`. Make optional fields `.nullable()` rather
 * than `.optional()`: strict structured outputs need every field present.
 */
export async function runTask<Schema extends z.ZodType>(
  ctx: ActionCtx,
  {
    task,
    userId,
    schema,
    instructions,
    content,
  }: {
    task: AiTask;
    userId: Id<"users">;
    schema: Schema;
    instructions: string;
    content: UserContent;
  }
): Promise<z.infer<Schema>> {
  const apiKey = aiKey();
  if (!apiKey) {
    throw new AiError("off", "AI isn’t set up on this hub.");
  }
  const run: { runId: Id<"aiRuns">; model: string } | null =
    await ctx.runMutation(internal.ai.start, { task, userId });
  if (!run) {
    throw new AiError("limit", "Too many runs lately. Try again in a while.");
  }
  const openrouter = createOpenRouter({ apiKey, appName: "Hub" });
  try {
    const result = await generateText({
      instructions,
      messages: [{ content, role: "user" }],
      // Only providers that keep to the schema, rather than taking it as a hint.
      model: openrouter(run.model, { provider: { require_parameters: true } }),
      output: Output.object({ name: task, schema }),
      temperature: 0,
    });
    await ctx.runMutation(internal.ai.finish, {
      ok: true,
      runId: run.runId,
      ...usageOf(result.usage, result.finalStep.providerMetadata),
    });
    return result.output as z.infer<Schema>;
  } catch (error) {
    await ctx.runMutation(internal.ai.finish, {
      ok: false,
      runId: run.runId,
      // A reply that didn't fit the schema was still paid for.
      ...(NoObjectGeneratedError.isInstance(error) ? usageOf(error.usage) : {}),
    });
    throw new AiError(
      "failed",
      error instanceof Error ? error.message : "The model didn’t answer."
    );
  }
}
