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

/** Longest board code. Boards made before the cap may keep codes of up to 10. */
export const MAX_CODE = 7;
export const CODE = /^[A-Z][A-Z0-9]{0,6}$/u;
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
    return `Up to ${MAX_CODE} letters or numbers, starting with a letter.`;
  }
  if (RESERVED_CODES.has(code)) {
    return "The app uses this code.";
  }
  return null;
}

const DIACRITICS = /\p{Diacritic}/gu;
const STARTS_WITH_LETTER = /^[A-Z]/u;
/** Words a code skips, unless the name is nothing else. */
const FILLER_WORDS: ReadonlySet<string> = new Set([
  "A",
  "AN",
  "AND",
  "FOR",
  "OF",
  "THE",
  "TO",
]);

/** A name as plain uppercase words that start with a letter, filler left out. */
function codeWords(name: string): string[] {
  const words = name
    .normalize("NFD")
    .replace(DIACRITICS, "")
    .toUpperCase()
    .split(/[^A-Z0-9]+/u)
    .filter((word) => STARTS_WITH_LETTER.test(word));
  const meaningful = words.filter((word) => !FILLER_WORDS.has(word));
  return meaningful.length > 0 ? meaningful : words;
}

/**
 * Codes worth trying for a name, best first: initials for several words
 * ("Website relaunch" → WR), a short word whole ("Spark" → SPARK), or the
 * start of a long one ("Marketing" → MAR).
 */
function codeCandidates(name: string): string[] {
  const words = codeWords(name);
  const [first = ""] = words;
  const candidates =
    words.length > 1
      ? [
          words
            .map((word) => word[0])
            .join("")
            .slice(0, 4),
          first.slice(0, 3),
          first.slice(0, 4),
        ]
      : [
          first.length <= 5 ? first : first.slice(0, 3),
          first.slice(0, 3),
          first.slice(0, 4),
        ];
  return candidates.filter(Boolean);
}

/**
 * A short, readable code for a board named `name` that no board in `taken`
 * has, numbered when every natural one is gone. Empty for a name without letters.
 */
export function suggestCode(
  name: string,
  taken: Pick<ReadonlySet<string>, "has">
): string {
  const free = (code: string) => codeProblem(code) === null && !taken.has(code);
  const candidates = codeCandidates(name);
  const natural = candidates.find(free);
  if (natural) {
    return natural;
  }
  const [base] = candidates;
  if (!base) {
    return "";
  }
  for (let number = 2; ; number += 1) {
    const suffix = String(number);
    const code = `${base.slice(0, MAX_CODE - suffix.length)}${suffix}`;
    if (free(code)) {
      return code;
    }
  }
}
