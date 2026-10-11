/**
 * System notifications on this device. With the deployment's VAPID keys set,
 * news is pushed even when the hub is closed; without them, the hub shows it
 * while it's open in the background. Either way, each person turns them on
 * per device.
 */
import { api } from "@convex/_generated/api";
import { useSyncExternalStore } from "react";
import { toast } from "sonner";
import { navigate } from "wouter/use-browser-location";

import { convex } from "@/lib/convex";
import {
  hasWorker,
  installed,
  installsFromShareSheet,
  workerRegistration,
} from "@/lib/pwa";
import { readStorage, writeStorage } from "@/lib/utils";

/**
 * - `unsupported`: this browser can't show notifications.
 * - `install`: iPhones and iPads only notify from the app on the Home Screen.
 * - `blocked`: the person said no; only the browser's settings can undo it.
 */
export type NotifyState = "unsupported" | "install" | "blocked" | "off" | "on";

export interface SystemNotification {
  title: string;
  body: string;
  /** A notification with the same tag replaces the last one. */
  tag: string;
  /** Where clicking it leads, as an app path. */
  path: string;
}

const listeners = new Set<() => void>();

function changed(): void {
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Permission can change in the browser's settings while the hub is away.
  document.addEventListener("visibilitychange", listener);
  return () => {
    listeners.delete(listener);
    document.removeEventListener("visibilitychange", listener);
  };
}

const onKey = (userId: string) => `notify:${userId}`;
/** The push address this device registered for the person, to take back when they turn it off. */
const pushKey = (userId: string) => `notify-push:${userId}`;

export function notifyState(userId: string): NotifyState {
  if (installsFromShareSheet && !installed) {
    return "install";
  }
  if (!("Notification" in globalThis)) {
    return "unsupported";
  }
  if (Notification.permission === "denied") {
    return "blocked";
  }
  return Notification.permission === "granted" &&
    readStorage(onKey(userId)) === "on"
    ? "on"
    : "off";
}

export function useNotifyState(userId: string): NotifyState {
  return useSyncExternalStore(subscribe, () => notifyState(userId));
}

/** Whether news is pushed to this device, so the hub needn't show it itself. */
export function pushesHere(userId: string): boolean {
  return notifyState(userId) === "on" && readStorage(pushKey(userId)) !== null;
}

function base64Url(buffer: ArrayBuffer | null): string {
  if (!buffer) {
    return "";
  }
  return btoa(String.fromCodePoint(...new Uint8Array(buffer)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

/** The push subscription for the deployment's key, made anew if the key changed. */
async function pushSubscription(
  registration: ServiceWorkerRegistration,
  vapidKey: string
): Promise<PushSubscription> {
  const current = await registration.pushManager.getSubscription();
  if (current && base64Url(current.options.applicationServerKey) === vapidKey) {
    return current;
  }
  await current?.unsubscribe();
  return registration.pushManager.subscribe({
    applicationServerKey: vapidKey,
    userVisibleOnly: true,
  });
}

/** The key to subscribe with, or null when the deployment can't push. */
async function deploymentKey(): Promise<string | null> {
  try {
    return await convex.query(api.push.config, {});
  } catch {
    return null;
  }
}

/**
 * Tells the hub where to push to on this device. Browsers renew push
 * subscriptions now and then, so this runs on start too. False when it
 * couldn't, null when the deployment doesn't push at all.
 */
async function registerDevice(userId: string): Promise<boolean | null> {
  const key = await deploymentKey();
  if (!key) {
    return null;
  }
  const registration = await workerRegistration();
  if (!(registration && "pushManager" in registration)) {
    return false;
  }
  try {
    const subscription = await pushSubscription(registration, key);
    const { endpoint, keys } = subscription.toJSON();
    if (!(endpoint && keys?.auth && keys.p256dh)) {
      return false;
    }
    await convex.mutation(api.push.register, {
      endpoint,
      keys: { auth: keys.auth, p256dh: keys.p256dh },
    });
    const before = readStorage(pushKey(userId));
    if (before && before !== endpoint) {
      await convex.mutation(api.push.unregister, { endpoint: before });
    }
    writeStorage(pushKey(userId), endpoint);
    return true;
  } catch {
    return false;
  }
}

/** Asks to show notifications, and on a yes, sets up pushes. Never throws. */
export async function turnOnNotifications(userId: string): Promise<void> {
  let permission: NotificationPermission;
  try {
    permission = await Notification.requestPermission();
  } catch {
    permission = "default";
  }
  if (permission !== "granted") {
    changed();
    return;
  }
  writeStorage(onKey(userId), "on");
  changed();
  if (hasWorker && (await registerDevice(userId)) === false) {
    toast("Notifications only show while the hub is open", {
      description:
        "This browser couldn’t set up notifications for when it’s closed.",
    });
  }
}

/**
 * Stops pushing to this device, keeping notifications on otherwise. Signing
 * out runs it, so a shared computer doesn't get the last person's news.
 */
export async function stopPushing(userId: string): Promise<void> {
  const endpoint = readStorage(pushKey(userId));
  if (!endpoint) {
    return;
  }
  writeStorage(pushKey(userId), null);
  try {
    const registration = await workerRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    await subscription?.unsubscribe();
  } catch {
    // Gone already; the hub forgets it once the push service says so.
  }
  try {
    await convex.mutation(api.push.unregister, { endpoint });
  } catch {
    // Offline: the push service says it's gone the next time something's pushed.
  }
}

/** Stops notifications on this device. Never throws. */
export async function turnOffNotifications(userId: string): Promise<void> {
  writeStorage(onKey(userId), null);
  changed();
  await stopPushing(userId);
}

/** Keeps this device's push subscription current, if notifications are on. */
export function startNotifications(userId: string): void {
  if (notifyState(userId) === "on" && hasWorker) {
    registerDevice(userId);
  }
}

/** Shows a notification from the hub itself, as a push would. */
export async function showNotification({
  title,
  body,
  tag,
  path,
}: SystemNotification): Promise<void> {
  const options = {
    body,
    data: { path },
    icon: "/icons/icon-192.png",
    tag,
  };
  const registration = await workerRegistration();
  if (registration) {
    await registration.showNotification(title, options);
    return;
  }
  const shown = new Notification(title, options);
  shown.addEventListener("click", () => {
    focus();
    navigate(path);
    shown.close();
  });
}
