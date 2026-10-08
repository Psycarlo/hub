import type { LucideIcon } from "lucide-react";

import {
  PriorityHighIcon,
  PriorityLowIcon,
  PriorityMediumIcon,
  PriorityUrgentIcon,
} from "@/features/card/priority-icons";
import {
  StatusBacklogIcon,
  StatusCanceledIcon,
  StatusDoneIcon,
  StatusDuplicateIcon,
  StatusProgressIcon,
  StatusReviewIcon,
  StatusTodoIcon,
  StatusTriageIcon,
} from "@/features/card/status-icons";
import type { BoardLabel, Priority, Sprint, Status, UserId } from "@/lib/model";
import type { Color } from "@/lib/palette";
import { COLORS } from "@/lib/palette";

interface IconStyle {
  icon: LucideIcon;
  className: string;
}

const CLOSED_GRAY = "text-neutral-400 dark:text-neutral-500";

/** Linear's colors, from our palette. */
export const STATUS_STYLES: Record<Status, IconStyle> = {
  backlog: { className: "text-muted-foreground", icon: StatusBacklogIcon },
  canceled: { className: CLOSED_GRAY, icon: StatusCanceledIcon },
  done: { className: "text-blue-500", icon: StatusDoneIcon },
  duplicate: { className: CLOSED_GRAY, icon: StatusDuplicateIcon },
  progress: { className: "text-yellow-500", icon: StatusProgressIcon },
  review: { className: "text-green-500", icon: StatusReviewIcon },
  todo: { className: "text-foreground/75", icon: StatusTodoIcon },
  triage: { className: "text-orange-500", icon: StatusTriageIcon },
};

export const PRIORITY_STYLES: Record<Priority, IconStyle> = {
  high: { className: "text-muted-foreground", icon: PriorityHighIcon },
  low: { className: "text-muted-foreground", icon: PriorityLowIcon },
  medium: { className: "text-muted-foreground", icon: PriorityMediumIcon },
  urgent: { className: "text-foreground", icon: PriorityUrgentIcon },
};

/** The labels a card wears, in the board's order, leaving out any since deleted. */
export function cardLabels(
  labels: readonly BoardLabel[],
  worn: readonly string[]
): BoardLabel[] {
  const ids = new Set(worn);
  return labels.filter(({ id }) => ids.has(id));
}

/** A new label's color: whichever the fewest labels have, so labels stay told apart. */
export function nextLabelColor(labels: readonly BoardLabel[]): Color {
  const uses = (color: Color) =>
    labels.filter((label) => label.color === color).length;
  // Sorting keeps ties in palette order.
  const [color = "gray"] = COLORS.filter((item) => item !== "gray").toSorted(
    (a, b) => uses(a) - uses(b)
  );
  return color;
}

/** Sprints a card can move to: any not yet ended, plus its current one. */
export function sprintChoices(sprints: Sprint[], current?: string): Sprint[] {
  return sprints.filter(
    (sprint) => sprint.status !== "ended" || sprint._id === current
  );
}

/** The project's people, plus anyone still assigned after leaving it. */
export function assignable(people: UserId[], assignees: UserId[]): UserId[] {
  const members = new Set(people);
  return [...people, ...assignees.filter((person) => !members.has(person))];
}

/** The people picked, in the order they're offered. */
export function inOfferedOrder(people: UserId[], picked: string[]): UserId[] {
  const chosen = new Set(picked);
  return people.filter((person) => chosen.has(person));
}
