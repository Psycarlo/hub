import { api } from "@convex/_generated/api";
import type { AiTaskOverview } from "@convex/ai";
import type { AiModel } from "@convex/shared/ai";
import { cn } from "cn";
import { useQuery } from "convex/react";
import { startOfMonth } from "date-fns";
import {
  CheckIcon,
  ChevronsUpDownIcon,
  SearchIcon,
  SparklesIcon,
  UndoIcon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { CopyButton } from "@/components/copy";
import { Button } from "@/components/ui/button";
import { FluidTooltip } from "@/components/ui/fluid-tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { run } from "@/lib/actions";
import { convex } from "@/lib/convex";
import { plural } from "@/lib/utils";

const SET_KEY = "npx convex env set OPENROUTER_API_KEY sk-or-…";

/** USD with as many decimals as small amounts need: $0.0004, $0.12, $14.50. */
function usd(value: number): string {
  if (value === 0) {
    return "$0";
  }
  const digits = value < 0.01 ? 4 : 2;
  return `$${value.toFixed(digits)}`;
}

/** A price per million tokens, in and out. */
function prices(model: Pick<AiModel, "input" | "output">): string {
  return `${usd(model.input)} in · ${usd(model.output)} out`;
}

/** The part after the provider, which most names repeat: "Gemini 3.1 Flash Lite". */
function shortName(name: string): string {
  return name.includes(": ") ? name.slice(name.indexOf(": ") + 2) : name;
}

/** Whether the deployment has an OpenRouter key, and how to give it one. */
function Connection({ connected }: { connected: boolean }) {
  return (
    <div className="flex items-start gap-3 p-4">
      <span
        aria-hidden
        className={cn(
          "mt-1.5 size-2 shrink-0 rounded-full",
          connected
            ? "bg-green-500 shadow-[0_0_0_3px] shadow-green-500/20"
            : "bg-amber-500 shadow-[0_0_0_3px] shadow-amber-500/20"
        )}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="text-sm font-medium">
          {connected ? "Connected to OpenRouter" : "Not connected"}
        </p>
        <p className="text-muted-foreground text-xs text-pretty">
          {connected
            ? "Tasks run with the key set on the deployment."
            : "Create a key at openrouter.ai, then set it on the deployment. Until then, files are attached but not read."}
        </p>
        {!connected && (
          <div className="bg-muted mt-2 flex items-center gap-2 rounded-lg py-1 pr-1 pl-3">
            <code className="min-w-0 flex-1 truncate font-mono text-xs">
              {SET_KEY}
            </code>
            <FluidTooltip.Group>
              <CopyButton label="Copy command" value={SET_KEY} />
            </FluidTooltip.Group>
          </div>
        )}
      </div>
    </div>
  );
}

/** The models a task can run on, loaded from OpenRouter when first opened. */
function useModels(task: string) {
  const [models, setModels] = useState<AiModel[] | null>();
  const load = async () => {
    if (models) {
      return;
    }
    setModels(undefined);
    const loaded = await run(convex.action(api.ai.models, { task }));
    setModels(loaded ?? null);
  };
  return { load, models };
}

function ModelOption({
  model,
  selected,
  isDefault,
  onPick,
}: {
  model: AiModel;
  selected: boolean;
  isDefault: boolean;
  onPick: () => void;
}) {
  return (
    <li>
      <button
        aria-pressed={selected}
        className="hover:bg-foreground/5 focus-visible:bg-foreground/5 flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left outline-none"
        onClick={onPick}
        type="button"
      >
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-sm font-medium">
              {shortName(model.name)}
            </span>
            {isDefault && (
              <span className="bg-foreground/5 text-muted-foreground shrink-0 rounded px-1.5 py-px text-[0.7rem]">
                Default
              </span>
            )}
          </span>
          <span className="text-muted-foreground truncate font-mono text-[0.7rem]">
            {model.id}
          </span>
        </span>
        <span className="text-muted-foreground shrink-0 text-right text-xs tabular-nums">
          {prices(model)}
        </span>
        <CheckIcon
          aria-hidden
          className={cn(
            "text-primary size-4 shrink-0",
            !selected && "invisible"
          )}
        />
      </button>
    </li>
  );
}

/** Picks the model a task runs on, from what OpenRouter has that can do it. */
function ModelPicker({ task }: { task: AiTaskOverview }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { load, models } = useModels(task.task);
  const needle = search.trim().toLowerCase();
  const shown = (models ?? []).filter(
    (model) =>
      !needle ||
      model.name.toLowerCase().includes(needle) ||
      model.id.includes(needle)
  );

  const pick = async (model: string | null) => {
    setOpen(false);
    const done = await run(
      convex.mutation(api.ai.setModel, { model, task: task.task })
    );
    if (done !== undefined) {
      toast.success(
        model
          ? `${task.name} now runs on ${model}`
          : "Back to the default model"
      );
    }
  };

  return (
    <Popover
      onOpenChange={(next) => {
        setOpen(next);
        setSearch("");
        if (next) {
          load();
        }
      }}
      open={open}
    >
      <PopoverTrigger
        render={
          <Button
            className="max-w-full min-w-0 justify-between gap-2 sm:max-w-72"
            size="sm"
            variant="outline"
          />
        }
      >
        <span className="truncate font-mono text-xs">{task.model}</span>
        <ChevronsUpDownIcon className="text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="flex max-h-[min(28rem,var(--available-height))] w-[min(30rem,calc(100vw-2rem))] flex-col gap-0 overflow-hidden p-0"
      >
        <label className="flex h-11 shrink-0 items-center gap-2 border-b px-3">
          <SearchIcon
            aria-hidden
            className="text-muted-foreground size-4 shrink-0"
          />
          <input
            aria-label="Search models"
            autoComplete="off"
            className="placeholder:text-muted-foreground h-full min-w-0 flex-1 bg-transparent text-base outline-none md:text-sm"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search models…"
            value={search}
          />
        </label>
        {models === undefined && (
          <div className="grid h-40 place-items-center">
            <Spinner className="text-muted-foreground" />
          </div>
        )}
        {models === null && (
          <p className="text-muted-foreground p-6 text-center text-sm">
            Couldn’t load OpenRouter’s models.
          </p>
        )}
        {models && (
          <ul className="flex min-h-0 flex-1 flex-col overflow-y-auto p-1.5">
            {shown.length === 0 && (
              <li className="text-muted-foreground p-6 text-center text-sm">
                No model matches.
              </li>
            )}
            {shown.map((model) => (
              <ModelOption
                isDefault={model.id === task.defaultModel}
                key={model.id}
                model={model}
                onPick={() => pick(model.id)}
                selected={model.id === task.model}
              />
            ))}
          </ul>
        )}
        <footer className="text-muted-foreground flex shrink-0 items-center justify-between gap-2 border-t px-3 py-2 text-xs">
          <span>
            {models
              ? `${plural(models.length, "model")} that read files and keep to a schema · per 1M tokens`
              : "Per 1M tokens"}
          </span>
          {task.model !== task.defaultModel && (
            <Button
              className="-mr-1.5"
              onClick={() => pick(null)}
              size="xs"
              variant="ghost"
            >
              <UndoIcon />
              Default
            </Button>
          )}
        </footer>
      </PopoverContent>
    </Popover>
  );
}

function TaskRow({ task }: { task: AiTaskOverview }) {
  const usage = [
    plural(task.runs, "run"),
    task.runs > 0 ? usd(task.cost) : "",
    task.failed > 0 ? `${task.failed} failed` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <li className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
      <span className="bg-primary/10 text-primary grid size-9 shrink-0 place-items-center rounded-xl max-sm:hidden">
        <SparklesIcon className="size-4" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="text-sm font-medium">{task.name}</p>
        <p className="text-muted-foreground text-xs text-pretty">
          {task.description}
        </p>
        <p className="text-muted-foreground text-xs tabular-nums">
          This month: {usage}
        </p>
      </div>
      <ModelPicker task={task} />
    </li>
  );
}

/** Which model each AI task runs on, and what they've cost this month. */
export function AiSettings() {
  // oxlint-disable-next-line react/hook-use-state -- read once, never set
  const [since] = useState(() => startOfMonth(new Date()).getTime());
  const overview = useQuery(api.ai.overview, { since });
  if (overview === undefined) {
    return <Skeleton className="h-44 rounded-2xl" />;
  }
  return (
    <div className="bg-card shadow-surface flex flex-col divide-y rounded-2xl">
      <Connection connected={overview.connected} />
      <ul className="flex flex-col divide-y">
        {overview.tasks.map((task) => (
          <TaskRow key={task.task} task={task} />
        ))}
      </ul>
    </div>
  );
}
