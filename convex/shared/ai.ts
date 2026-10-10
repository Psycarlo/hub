/**
 * Work Hub hands to a model, through OpenRouter. Each task runs on its own
 * model, which an admin can change; a new task is one more entry here.
 */

/** What a model can be given, as OpenRouter names its input modalities. */
export type AiInput = "text" | "image" | "file";

export interface AiTaskInfo {
  name: string;
  description: string;
  /** What the model has to take in, beyond text: only models that do are offered. */
  inputs: readonly AiInput[];
  /** What runs until an admin picks something else. */
  defaultModel: string;
}

export const AI_TASKS = {
  invoice: {
    defaultModel: "google/gemini-3.1-flash-lite",
    description:
      "Fills in a transaction from an invoice or receipt: who it’s from, how much and when.",
    inputs: ["image", "file"],
    name: "Reading invoices",
  },
} as const satisfies Record<string, AiTaskInfo>;

export type AiTask = keyof typeof AI_TASKS;

export const AI_TASK_IDS = Object.keys(AI_TASKS) as AiTask[];

export function isAiTask(value: string): value is AiTask {
  return Object.hasOwn(AI_TASKS, value);
}

/** OpenRouter model ids: a provider, a slash, a model, and maybe a variant like `:free`. */
const MODEL_ID = /^[\w.-]+\/[\w.:-]+$/u;
const MAX_MODEL_ID = 120;

export function isModelId(value: string): boolean {
  return value.length <= MAX_MODEL_ID && MODEL_ID.test(value);
}

/** Runs one person can start in an hour, across tasks: plenty for a month's invoices at once. */
export const AI_RUNS_PER_HOUR = 200;

/** A model as the admin picks it: what it is, what it takes in, and what it costs. */
export interface AiModel {
  id: string;
  name: string;
  /** USD per million tokens in and out. */
  input: number;
  output: number;
  /** Tokens it reads at once. */
  context: number;
}
