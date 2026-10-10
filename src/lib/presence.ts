import { api } from "@convex/_generated/api";
import { useEffect } from "react";

import { convex, convexUrl } from "@/lib/convex";
import { readStorage, writeStorage } from "@/lib/utils";

/**
 * Who has Hub open. Each browser keeps one session, whatever its tabs: the
 * tab holding a Web Lock sends the heartbeats, and the tabs tell each other
 * over a BroadcastChannel whether they're in view and on the Office page, so
 * it speaks for them all. When it closes, the next tab takes the lock and
 * carries on in the same session; when the last one closes, a beacon ends it
 * at once rather than leaving it to time out.
 */

/** How often the browser says it's still here, with a tab in view or none. */
const VISIBLE_EVERY = 30_000;
const HIDDEN_EVERY = 60_000;
/** Every tab hidden this long is away. */
const AWAY_AFTER = 2 * 60_000;
/** How often tabs tell each other they're still open. */
const ROLL_CALL = 30_000;
/** A tab not heard from in this long went without saying, like a crash. */
const GONE_AFTER = 150_000;

const SESSION_KEY = "hub-presence-session";

interface TabState {
  visible: boolean;
  office: boolean;
}

/** What ends the browser's sessions: in the hub's room, and the office's. */
interface Tokens {
  hub: string | null;
  office: string | null;
}

type Message =
  | { type: "hello" | "state"; id: string; state: TabState }
  | { type: "bye"; id: string }
  | { type: "tokens"; tokens: Partial<Tokens> };

const tabId = crypto.randomUUID();
const me: TabState = { office: false, visible: !document.hidden };
const others = new Map<string, TabState & { seen: number }>();
let tokens: Tokens = { hub: null, office: null };
let channel: BroadcastChannel | null = null;

/** The heartbeats, while this tab holds the lock. */
const lead = {
  /** A change came in while a heartbeat was on its way. */
  again: false,
  /** Away as last sent; null before the first heartbeat. */
  away: null as boolean | null,
  /** Counting down to away; -1 once away. */
  awayTimer: 0,
  beating: false,
  on: false,
  /** What the last heartbeat said. */
  sent: { office: false, visible: false },
  timer: 0,
};

/**
 * The browser's session: one id for all its tabs, read each time so tabs
 * that made theirs at once settle on the same.
 */
export function browserSession(): string {
  const stored = readStorage(SESSION_KEY);
  if (stored) {
    return stored;
  }
  const made = crypto.randomUUID();
  writeStorage(SESSION_KEY, made);
  return made;
}

function timeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function post(message: Message) {
  // oxlint-disable-next-line unicorn/require-post-message-target-origin -- a BroadcastChannel, not a window
  channel?.postMessage(message);
}

function live(): (TabState & { seen: number })[] {
  const now = Date.now();
  for (const [id, tab] of others) {
    if (now - tab.seen > GONE_AFTER) {
      others.delete(id);
    }
  }
  return [...others.values()];
}

function anyVisible(): boolean {
  return me.visible || live().some((tab) => tab.visible);
}

function anyOffice(): boolean {
  return me.office || live().some((tab) => tab.office);
}

/** Whether another tab in this browser is on the Office page. */
export function officeElsewhere(): boolean {
  return live().some((tab) => tab.office);
}

function share(next: Partial<Tokens>) {
  tokens = { ...tokens, ...next };
  post({ tokens: next, type: "tokens" });
}

/** Keeps the office session's token, from entering the office, for the beacon. */
export function shareOfficeToken(token: string) {
  share({ office: token });
}

/** Ends a session with a request that outlives the page. */
function beacon(sessionToken: string) {
  if (!convexUrl) {
    return;
  }
  const body = new Blob(
    [JSON.stringify({ args: { sessionToken }, path: "presence:disconnect" })],
    { type: "application/json" }
  );
  navigator.sendBeacon(`${convexUrl.replace(/\/$/u, "")}/api/mutation`, body);
}

async function beat(): Promise<void> {
  if (!lead.on) {
    return;
  }
  if (lead.beating) {
    lead.again = true;
    return;
  }
  lead.beating = true;
  clearTimeout(lead.timer);
  const visible = anyVisible();
  const office = anyOffice();
  const away = lead.awayTimer === -1;
  try {
    const result = await convex.mutation(api.presence.heartbeat, {
      away: away === lead.away ? undefined : away,
      interval: visible ? VISIBLE_EVERY : HIDDEN_EVERY,
      office,
      officeToken: office ? undefined : (tokens.office ?? undefined),
      session: browserSession(),
      timeZone: timeZone(),
    });
    lead.away = away;
    lead.sent = { office, visible };
    share(result);
  } catch {
    // Offline, or signed out: the next heartbeat tries again.
  }
  lead.beating = false;
  if (lead.again) {
    lead.again = false;
    beat();
  } else if (lead.on) {
    lead.timer = window.setTimeout(
      beat,
      anyVisible() ? VISIBLE_EVERY : HIDDEN_EVERY
    );
  }
}

/** Heartbeats at once for what's worth saying now, and keeps time for away. */
function update() {
  if (!lead.on) {
    return;
  }
  const visible = anyVisible();
  if (visible) {
    clearTimeout(lead.awayTimer);
    lead.awayTimer = 0;
  } else if (lead.awayTimer === 0) {
    lead.awayTimer = window.setTimeout(() => {
      lead.awayTimer = -1;
      beat();
    }, AWAY_AFTER);
  }
  const away = lead.awayTimer === -1;
  if (
    anyOffice() !== lead.sent.office ||
    (visible && !lead.sent.visible) ||
    (lead.away !== null && away !== lead.away)
  ) {
    beat();
  }
}

function receive({ data }: MessageEvent<Message>) {
  if (data.type === "tokens") {
    tokens = { ...tokens, ...data.tokens };
    return;
  }
  if (data.type === "bye") {
    others.delete(data.id);
  } else {
    others.set(data.id, { ...data.state, seen: Date.now() });
    if (data.type === "hello") {
      post({ id: tabId, state: me, type: "state" });
      if (lead.on) {
        post({ tokens, type: "tokens" });
      }
    }
  }
  update();
}

/** Set as the page goes: it's gone, whatever it does on the way out. */
let leaving = false;

function announce() {
  if (leaving) {
    return;
  }
  post({ id: tabId, state: me, type: "state" });
  update();
}

function onVisibility() {
  me.visible = !document.hidden;
  announce();
}

/**
 * Tells the other tabs, and ends what no tab is left to keep. Browsers hide a
 * closing page after this, which mustn't announce it again.
 */
function onPageHide() {
  leaving = true;
  post({ id: tabId, type: "bye" });
  const left = live();
  if (left.length === 0 && tokens.hub) {
    beacon(tokens.hub);
  }
  if (!left.some((tab) => tab.office) && tokens.office) {
    beacon(tokens.office);
  }
}

/** Back from the browser's cache of pages left: here again. */
function onPageShow(event: PageTransitionEvent) {
  if (event.persisted) {
    leaving = false;
    post({ id: tabId, state: me, type: "hello" });
    update();
  }
}

/** Says whether this tab is on the Office page. */
export function setOnOffice(on: boolean) {
  me.office = on;
  announce();
}

/** Heartbeats until stopped, while holding the lock. */
async function leadUntil(signal: AbortSignal): Promise<void> {
  const stopped = Promise.withResolvers<boolean>();
  signal.addEventListener("abort", () => stopped.resolve(true), {
    once: true,
  });
  lead.on = true;
  lead.away = null;
  lead.sent = { office: false, visible: false };
  update();
  // In view, that's already sent one; hidden, it says it's here all the same.
  if (!lead.beating) {
    beat();
  }
  await stopped.promise;
  lead.on = false;
  clearTimeout(lead.timer);
  clearTimeout(lead.awayTimer);
  lead.awayTimer = 0;
}

/** Waits for the browser's lock, then heartbeats until stopped. */
async function lock(userId: string, signal: AbortSignal) {
  try {
    await navigator.locks.request(`hub-presence:${userId}`, { signal }, () =>
      leadUntil(signal)
    );
  } catch {
    // Stopped while waiting for it.
  }
}

/** Joins the browser's tabs, and heartbeats when this one gets the lock. */
function start(userId: string): () => void {
  const stop = new AbortController();
  channel = new BroadcastChannel(`hub-presence:${userId}`);
  channel.addEventListener("message", receive);
  post({ id: tabId, state: me, type: "hello" });
  const roll = window.setInterval(announce, ROLL_CALL);
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pagehide", onPageHide);
  window.addEventListener("pageshow", onPageShow);
  if ("locks" in navigator) {
    lock(userId, stop.signal);
  } else {
    // Without locks, every tab speaks for itself.
    leadUntil(stop.signal);
  }
  return () => {
    stop.abort();
    clearInterval(roll);
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pagehide", onPageHide);
    window.removeEventListener("pageshow", onPageShow);
    post({ id: tabId, type: "bye" });
    channel?.close();
    channel = null;
    others.clear();
  };
}

/** Keeps the signed-in person online while Hub is open, from the app shell. */
export function usePresence(userId: string) {
  useEffect(() => start(userId), [userId]);
}
