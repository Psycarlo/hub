import { api } from "@convex/_generated/api";

import { run } from "@/lib/actions";
import { convex } from "@/lib/convex";

import type { Sender } from "./self";

/** Sends something only for show, where missing one is fine: the next puts it right. */
export async function quietly(change: Promise<unknown>): Promise<void> {
  try {
    await change;
  } catch {
    // Not worth a word: the next change puts things right.
  }
}

/** What your character tells the server, as it goes. */
export const SEND: Sender = {
  emote: (name) => {
    quietly(convex.mutation(api.office.emote, { name }));
  },
  sit: async (seat) =>
    (await run(convex.mutation(api.office.sit, { seat: seat.id }))) !==
    undefined,
  stand: (to) => {
    quietly(convex.mutation(api.office.stand, { to }));
  },
  walk: (from, path, running, facing) => {
    quietly(convex.mutation(api.office.walk, { facing, from, path, running }));
  },
};
