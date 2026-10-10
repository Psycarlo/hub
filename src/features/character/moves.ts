/** What a character can do: each one an animation in character.glb. */
export const MOVES = ["idle", "walk", "run", "jump", "wave", "dance"] as const;

export type Move = (typeof MOVES)[number];

/** Moves that play once, then settle back to idle. The rest loop. */
export const ONCE: ReadonlySet<Move> = new Set<Move>(["jump", "wave"]);
