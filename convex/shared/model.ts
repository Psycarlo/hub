/** Boards, cards and sprints: what both the server and the app know about them. */

export const STATUSES = [
  { id: "todo", label: "To do" },
  { id: "progress", label: "In progress" },
  { id: "done", label: "Done" },
] as const;

export const PRIORITIES = [
  { id: "high", label: "High" },
  { id: "medium", label: "Medium" },
  { id: "low", label: "Low" },
] as const;

export const SPRINT_STATUSES = ["future", "active", "ended"] as const;

export const LABELS = [
  "red",
  "orange",
  "yellow",
  "green",
  "blue",
  "purple",
] as const;

export type Status = (typeof STATUSES)[number]["id"];
export type Priority = (typeof PRIORITIES)[number]["id"];
export type Label = (typeof LABELS)[number];
export type SprintStatus = (typeof SPRINT_STATUSES)[number];

/** Global roles: admins run the hub, members see the projects they're on. */
export const APP_ROLES = ["admin", "member"] as const;
export type AppRole = (typeof APP_ROLES)[number];

/**
 * Roles on a project. Owners change its settings and people, editors change
 * what's in it, viewers can only read it. Admins act as owners everywhere.
 */
export const PROJECT_ROLES = ["owner", "editor", "viewer"] as const;
export type ProjectRole = (typeof PROJECT_ROLES)[number];

export const CODE = /^[A-Z][A-Z0-9]{0,9}$/u;
/** Codes taken by app pages, which share the top-level path with boards. */
export const RESERVED_CODES: ReadonlySet<string> = new Set([
  "ADMIN",
  "INBOX",
  "SETTINGS",
]);

export function canEditRole(role: ProjectRole | null | undefined): boolean {
  return role === "owner" || role === "editor";
}

export function canManageRole(role: ProjectRole | null | undefined): boolean {
  return role === "owner";
}

export function statusLabel(status: Status): string {
  return STATUSES.find(({ id }) => id === status)?.label ?? status;
}

/** A rank between two neighbours, or past whichever end is open. */
export function rankBetween(before?: number, after?: number): number {
  if (before === undefined) {
    return after === undefined ? 1 : after - 1;
  }
  return after === undefined ? before + 1 : (before + after) / 2;
}

/** Why a board code can't be used, or null when it can. */
export function codeProblem(code: string): string | null {
  if (!CODE.test(code)) {
    return "Start with a letter, then letters or numbers.";
  }
  if (RESERVED_CODES.has(code)) {
    return "The app uses this code.";
  }
  return null;
}
