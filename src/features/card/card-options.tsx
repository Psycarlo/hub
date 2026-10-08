import type { ReactNode } from "react";

import { PRIORITY_STYLES, STATUS_STYLES } from "@/features/card/card-fields";
import { Muted } from "@/features/card/card-parts";
import type { Priority, Sprint, Status } from "@/lib/model";
import { PRIORITIES, STATUSES } from "@/lib/model";

/** One choice in a card property picker. */
export interface Option<T> {
  value: T;
  label: ReactNode;
}

export const STATUS_OPTIONS: Option<Status>[] = STATUSES.map(
  ({ id, label }) => {
    const { icon: Icon, className } = STATUS_STYLES[id];
    return {
      label: (
        <>
          <Icon className={className} />
          {label}
        </>
      ),
      value: id,
    };
  }
);

export const PRIORITY_OPTIONS: Option<Priority | null>[] = [
  { label: <Muted>No priority</Muted>, value: null },
  ...PRIORITIES.map(({ id, label }) => {
    const { icon: Icon, className } = PRIORITY_STYLES[id];
    return {
      label: (
        <>
          <Icon className={className} />
          {label}
        </>
      ),
      value: id,
    };
  }),
];

export function sprintOptions(sprints: Sprint[]): Option<string | null>[] {
  return [
    { label: <Muted>No sprint</Muted>, value: null },
    ...sprints.map((sprint) => ({
      label: (
        <>
          <span className="truncate">{sprint.title}</span>
          {sprint.status === "active" && <Muted>Active</Muted>}
        </>
      ),
      value: sprint._id as string,
    })),
  ];
}
