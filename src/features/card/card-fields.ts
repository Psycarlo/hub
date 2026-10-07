import type { LucideIcon } from "lucide-react";
import {
  ChevronDownIcon,
  ChevronsUpIcon,
  ChevronUpIcon,
  CircleCheckIcon,
  CircleDashedIcon,
  CircleDotIcon,
} from "lucide-react";

import type { Label, Priority, Sprint, Status, UserId } from "@/lib/model";

interface IconStyle {
  icon: LucideIcon;
  className: string;
}

export const STATUS_STYLES: Record<Status, IconStyle> = {
  done: { className: "text-emerald-500", icon: CircleCheckIcon },
  progress: { className: "text-amber-500", icon: CircleDotIcon },
  todo: { className: "text-muted-foreground", icon: CircleDashedIcon },
};

export const PRIORITY_STYLES: Record<Priority, IconStyle> = {
  high: { className: "text-red-500", icon: ChevronsUpIcon },
  low: { className: "text-sky-500", icon: ChevronDownIcon },
  medium: { className: "text-amber-500", icon: ChevronUpIcon },
};

export const LABEL_COLORS: Record<Label, string> = {
  blue: "text-blue-500",
  green: "text-green-500",
  orange: "text-orange-500",
  purple: "text-violet-500",
  red: "text-red-500",
  yellow: "text-yellow-400",
};

export function labelName(label: Label): string {
  return label.charAt(0).toUpperCase() + label.slice(1);
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
