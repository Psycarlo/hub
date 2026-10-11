import { api } from "@convex/_generated/api";
import { useQuery } from "convex/react";
import { useMemo } from "react";

import type { LogDay, LogOverview, LogTopic } from "@/lib/log";
import type { Project } from "@/lib/project";

/** What was logged, by day. */
export interface LogDays {
  /** Each day's entries, in the order topics were made. */
  on: (date: string) => readonly LogDay[];
  /** Days with anything logged, newest first. */
  dates: readonly string[];
  /** False until they're in. */
  loaded: boolean;
}

const NONE: readonly LogDay[] = [];

/**
 * What the project logged from `from` on, or only `topic`'s, kept live;
 * nothing while there's no project yet.
 */
export function useLogDays(
  project: Pick<Project, "_id"> | undefined,
  from: string,
  topics: readonly LogTopic[],
  topic?: Pick<LogTopic, "_id">
): LogDays {
  const days = useQuery(
    api.log.days,
    project ? { from, projectId: project._id, topicId: topic?._id } : "skip"
  );
  return useMemo(() => {
    const order = new Map(topics.map((item, index) => [item._id, index]));
    const byDate = new Map<string, LogDay[]>();
    for (const day of days ?? []) {
      // A topic just deleted can linger a moment in the days.
      if (order.has(day.topicId)) {
        byDate.set(day.date, [...(byDate.get(day.date) ?? []), day]);
      }
    }
    for (const entries of byDate.values()) {
      entries.sort(
        (a, b) => (order.get(a.topicId) ?? 0) - (order.get(b.topicId) ?? 0)
      );
    }
    return {
      dates: [...byDate.keys()].toSorted().toReversed(),
      loaded: days !== undefined,
      on: (date) => byDate.get(date) ?? NONE,
    };
  }, [days, topics]);
}

/** The project's run of days logged and its first day; undefined while loading, null once out of reach. */
export function useLogOverview(
  project: Pick<Project, "_id"> | undefined,
  today: string
): LogOverview | null | undefined {
  return useQuery(
    api.log.overview,
    project ? { projectId: project._id, today } : "skip"
  );
}
