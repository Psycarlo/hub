import { toast } from "sonner";

import { APP_NAME } from "@/lib/brand";
import { convex } from "@/lib/convex";
import { uploadingToDrive } from "@/lib/drive-upload";
import { saveAll } from "@/lib/leaving";
import { sendingUploads } from "@/lib/upload";

/** How often an open hub asks whether a newer build went live. */
const CHECK_EVERY_MS = 5 * 60 * 1000;
/** Coming back to the hub asks too, but no more often than this. */
const MIN_GAP_MS = 30 * 1000;
/** How long uploads and saves get to finish before the reload gives up. */
const SETTLE_MS = 5000;
const SETTLE_POLL_MS = 100;
const TOAST_ID = "update";

/** What asking for an update found. */
export type UpdateCheck = "latest" | "updating" | "failed";

let ready = false;
let lastCheck = 0;
/** Whether anything was tapped or typed since the hub came back into view. */
let touched = true;
/**
 * Whether a file picker is open. On phones it leaves the page, which looks
 * like leaving the hub, but a reload then would lose what gets picked.
 */
let picking = false;

function touch(): void {
  touched = true;
  // Tapping again means any picker is long closed.
  picking = false;
}

/**
 * A picker opens with a click on its input. A pick keeps it counting until
 * the next tap, while the file gets on its way; a cancel ends it at once.
 */
function watchPicker(event: Event): void {
  if (
    event.target instanceof HTMLInputElement &&
    event.target.type === "file"
  ) {
    picking = event.type === "click";
  }
}

/**
 * Whether /version.json names a build other than this one (newer, or rolled
 * back), or null when it can't be read, like offline.
 */
async function changed(): Promise<boolean | null> {
  try {
    const response = await fetch("/version.json", { cache: "no-store" });
    if (!response.ok) {
      return null;
    }
    const { build } = (await response.json()) as { build?: unknown };
    return typeof build === "string" ? build !== __BUILD_ID__ : null;
  } catch {
    return null;
  }
}

/** The worker itself changes rarely, but an app open for days would miss it. */
async function refreshWorker(): Promise<void> {
  try {
    const registration = await navigator.serviceWorker?.getRegistration();
    await registration?.update();
  } catch {
    // Offline, or no worker: the next check tries again.
  }
}

/** Whether a file is on its way up, which a reload would drop. */
function uploading(): boolean {
  return uploadingToDrive() || sendingUploads();
}

/** Whether something typed sits in a field that only it holds. */
function typing(): boolean {
  const field = document.activeElement;
  return (
    (field instanceof HTMLInputElement ||
      field instanceof HTMLTextAreaElement) &&
    field.value !== ""
  );
}

/**
 * Whether a reload nobody asked for would lose nothing: no dialog, sheet or
 * file picker open, nothing typed in a field, nothing uploading. Changes
 * still on their way are waited for in `reload`.
 */
function idle(): boolean {
  return !(
    document.querySelector('[role="dialog"], [role="alertdialog"]') ||
    typing() ||
    picking ||
    uploading()
  );
}

/**
 * Saves what's waiting on a pause in typing, then reloads into the new build
 * once every upload and change has finished, or calls `stuck` if they take
 * too long.
 */
function reload(stuck: () => void): void {
  saveAll();
  const deadline = Date.now() + SETTLE_MS;
  const poll = () => {
    if (!uploading() && convex.connectionState().inflightMutations === 0) {
      location.reload();
    } else if (Date.now() > deadline) {
      stuck();
    } else {
      setTimeout(poll, SETTLE_POLL_MS);
    }
  };
  poll();
}

/** Offers the reload; `waiting` says why the last one didn't happen. */
function offer(waiting = false): void {
  toast(`A new version of ${APP_NAME} is ready`, {
    action: { label: "Reload", onClick: () => reload(() => offer(true)) },
    // It stays until it's acted on, so there's no time left to show.
    className: "toast-sticky",
    description: waiting
      ? "Waiting for uploads and changes to finish. Try again in a moment."
      : "Reload now, or it loads by itself next time you come back.",
    duration: Number.POSITIVE_INFINITY,
    id: TOAST_ID,
  });
}

/**
 * Takes the new build at a moment nobody notices: while the hub is out of
 * view, or right as it comes back, before anything is tapped. Otherwise it
 * offers a reload and tries again next time the hub is left.
 */
function apply(resumed: boolean): void {
  const unseen = document.visibilityState === "hidden" || (resumed && !touched);
  if (unseen && idle()) {
    reload(() => offer());
  } else {
    offer();
  }
}

async function check(resumed: boolean): Promise<void> {
  if (ready) {
    // Already offered: only coming back gets another go at it.
    if (resumed) {
      apply(true);
    }
    return;
  }
  if (Date.now() - lastCheck < MIN_GAP_MS) {
    return;
  }
  lastCheck = Date.now();
  refreshWorker();
  ready = (await changed()) === true;
  if (ready) {
    apply(resumed);
  }
}

/** The update check, asked for: reloads into a newer build once nothing would be lost. */
export async function checkForUpdate(): Promise<UpdateCheck> {
  // Development always runs the code as it is now.
  if (!import.meta.env.PROD) {
    return "latest";
  }
  if (!ready) {
    const found = await changed();
    if (found === null) {
      return "failed";
    }
    ready = found;
  }
  if (!ready) {
    return "latest";
  }
  reload(() => offer(true));
  return "updating";
}

/**
 * Keeps an open hub on the live build. Deploys are frequent, and installed
 * apps rarely reload by themselves, so it checks every few minutes and
 * whenever the hub comes back into view. Loads always get the live build:
 * the service worker serves pages from the network.
 */
export function startUpdates(): void {
  if (!import.meta.env.PROD) {
    return;
  }
  addEventListener("pointerdown", touch, { capture: true, passive: true });
  addEventListener("keydown", touch, { capture: true, passive: true });
  addEventListener("click", watchPicker, { capture: true, passive: true });
  addEventListener("cancel", watchPicker, { capture: true, passive: true });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      touched = false;
      check(true);
    } else if (ready) {
      apply(false);
    }
  });
  // Back from another site, out of the back-forward cache.
  addEventListener("pageshow", (event) => {
    if (event.persisted) {
      touched = false;
      check(true);
    }
  });
  addEventListener("online", () => check(false));
  setInterval(() => {
    if (document.visibilityState === "visible") {
      check(false);
    }
  }, CHECK_EVERY_MS);
}
