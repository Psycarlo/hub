import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { OptimisticLocalStore } from "convex/browser";
import { toast } from "sonner";

import { run } from "@/lib/actions";
import { convex } from "@/lib/convex";
import type { LogDay, LogTopic, TopicIcon } from "@/lib/log";
import type { Color } from "@/lib/palette";
import type { Project } from "@/lib/project";
import { playSound } from "@/lib/sounds";
import { plural } from "@/lib/utils";

export interface TopicDraft {
  title: string;
  icon: TopicIcon;
  color: Color;
  /** A project of the hub it stands for. */
  linkedProjectId?: Id<"projects">;
}

export interface TopicChanges extends Partial<
  Omit<TopicDraft, "linkedProjectId">
> {
  /** null stops it standing for a project. */
  linkedProjectId?: Id<"projects"> | null;
  archived?: boolean;
}

function patchTopics(
  store: OptimisticLocalStore,
  patch: (topics: LogTopic[]) => LogTopic[]
): void {
  const topics = store.getQuery(api.log.topics, {});
  if (topics) {
    store.setQuery(api.log.topics, {}, patch(topics));
  }
}

/** Changes every loaded stretch of the topic's project's log that `date` falls in. */
function patchDays(
  store: OptimisticLocalStore,
  topic: LogTopic,
  date: string | undefined,
  patch: (days: LogDay[]) => LogDay[]
): void {
  for (const { args, value } of store.getAllQueries(api.log.days)) {
    if (
      !value ||
      args.projectId !== topic.projectId ||
      (args.topicId !== undefined && args.topicId !== topic._id) ||
      (date !== undefined && date < args.from)
    ) {
      continue;
    }
    store.setQuery(api.log.days, args, patch(value));
  }
}

/** Starts a topic in the person's log; resolves with its id. */
export function createTopic(projectId: Id<"projects">, draft: TopicDraft) {
  return run(convex.mutation(api.log.createTopic, { projectId, ...draft }));
}

/** Adds the hub's projects to the person's log, a topic standing for each. */
export async function addProjects(
  projectId: Id<"projects">,
  projects: readonly Pick<Project, "_id">[]
) {
  const added = await run(
    convex.mutation(api.log.addProjects, {
      linkedProjectIds: projects.map((project) => project._id),
      projectId,
    })
  );
  if (added) {
    playSound("complete");
    toast(`${plural(added, "project")} added to your log`);
  }
  return added;
}

export function updateTopic(topic: LogTopic, changes: TopicChanges) {
  return run(
    convex.mutation(
      api.log.updateTopic,
      { topicId: topic._id, ...changes },
      {
        optimisticUpdate: (store) =>
          patchTopics(store, (topics) =>
            topics.map((item) =>
              item._id === topic._id
                ? {
                    ...item,
                    ...changes,
                    archived: changes.archived ?? item.archived,
                    linkedProjectId:
                      changes.linkedProjectId === undefined
                        ? item.linkedProjectId
                        : (changes.linkedProjectId ?? undefined),
                  }
                : item
            )
          ),
      }
    )
  );
}

export function deleteTopic(topic: LogTopic) {
  return run(
    convex.mutation(
      api.log.removeTopic,
      { topicId: topic._id },
      {
        optimisticUpdate: (store) => {
          patchTopics(store, (topics) =>
            topics.filter((item) => item._id !== topic._id)
          );
          patchDays(store, topic, undefined, (days) =>
            days.filter((day) => day.topicId !== topic._id)
          );
        },
      }
    )
  );
}

/**
 * Marks the topic worked on during a day, shown at once wherever that day is
 * loaded. A note left out keeps the one there.
 */
export function logTopic(topic: LogTopic, date: string, note?: string) {
  return run(
    convex.mutation(
      api.log.log,
      { date, note, topicId: topic._id },
      {
        optimisticUpdate: (store) =>
          patchDays(store, topic, date, (days) => {
            const existing = days.find(
              (day) => day.topicId === topic._id && day.date === date
            );
            const others = days.filter((day) => day !== existing);
            return [
              ...others,
              { date, note: note ?? existing?.note ?? "", topicId: topic._id },
            ];
          }),
      }
    )
  );
}

/** Clears the topic from a day; a note written there can be brought back for a moment. */
export async function unlogTopic(topic: LogTopic, date: string, note: string) {
  playSound("off");
  const done = await run(
    convex.mutation(
      api.log.unlog,
      { date, topicId: topic._id },
      {
        optimisticUpdate: (store) =>
          patchDays(store, topic, date, (days) =>
            days.filter(
              (day) => !(day.topicId === topic._id && day.date === date)
            )
          ),
      }
    )
  );
  if (done !== undefined && note) {
    toast(`${topic.title} cleared`, {
      action: { label: "Undo", onClick: () => logTopic(topic, date, note) },
    });
  }
}

/** Marks the topic worked on during a day, with the cue for it. */
export function checkTopic(topic: LogTopic, date: string) {
  playSound("complete");
  return logTopic(topic, date);
}
