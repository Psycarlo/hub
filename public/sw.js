/*
 * The hub's service worker: it lets the installed app open without a
 * connection, and open fast with one. It never decides which version runs.
 * Pages come from the network first, so a deploy is live on the next load,
 * and src/lib/updates.ts reloads open ones. Only same-origin GETs are
 * handled: Convex, uploaded files and everything else cross-origin go
 * straight to the network and are never cached.
 *
 * To switch it off for everyone: remove `register()` from `startPwa` in
 * src/lib/pwa.ts, replace this file with a worker that deletes every cache
 * and calls `self.registration.unregister()` on activate, and release. Don't
 * reload clients from it: pages still registering it would loop.
 */

const SHELL_CACHE = "hub-shell-v1";
const ASSET_CACHE = "hub-assets-v1";
/** Built files pile up across deploys; past this many, the oldest go. */
const MAX_ASSETS = 200;
const ASSET_PATH = /\/assets\/[\w.-]+/gu;

/** Every route serves the same index.html, so one copy covers them all. */
const keepShell = async (response) => {
  const cache = await caches.open(SHELL_CACHE);
  await cache.put("/", response);
};

const trim = async () => {
  const cache = await caches.open(ASSET_CACHE);
  const keys = await cache.keys();
  const extra = keys.slice(0, Math.max(0, keys.length - MAX_ASSETS));
  await Promise.all(extra.map((key) => cache.delete(key)));
};

const keepAsset = async (request, response) => {
  const cache = await caches.open(ASSET_CACHE);
  await cache.put(request, response);
  await trim();
};

/**
 * The page that registered this worker loaded before it ran, so what it needs
 * to open offline gets cached here. Best effort: a miss only means it opens
 * offline after the next visit instead.
 */
const warm = async () => {
  try {
    const response = await fetch("/", { cache: "no-cache" });
    if (!response.ok) {
      return;
    }
    const html = await response.clone().text();
    await keepShell(response);
    const cache = await caches.open(ASSET_CACHE);
    const urls = [...new Set(html.match(ASSET_PATH))];
    // One by one, so a file that fails doesn't keep the rest out.
    await Promise.allSettled(urls.map((url) => cache.add(url)));
  } catch {
    // Offline, or mid-deploy: the next visit fills it in.
  }
};

const activate = async () => {
  const keep = new Set([SHELL_CACHE, ASSET_CACHE]);
  const names = await caches.keys();
  await Promise.all(
    names.filter((name) => !keep.has(name)).map((name) => caches.delete(name))
  );
  // Starts the page's request while the worker boots, where supported.
  await self.registration.navigationPreload?.enable();
  await self.clients.claim();
};

const isPage = (response) =>
  response.ok &&
  !response.redirected &&
  (response.headers.get("Content-Type") ?? "").includes("text/html");

/** From the network, so it's always the live build; offline, the last one seen. */
const page = async (event) => {
  try {
    const response =
      (await event.preloadResponse) ?? (await fetch(event.request));
    if (isPage(response)) {
      event.waitUntil(keepShell(response.clone()));
    }
    return response;
  } catch {
    const shell = await caches.match("/", { cacheName: SHELL_CACHE });
    return shell ?? Response.error();
  }
};

/** Built files are named by their content, so a cached copy is always right. */
const asset = async (event) => {
  const cached = await caches.match(event.request, { cacheName: ASSET_CACHE });
  if (cached) {
    return cached;
  }
  const response = await fetch(event.request);
  if (response.ok && response.type === "basic") {
    event.waitUntil(keepAsset(event.request, response.clone()));
  }
  return response;
};

self.addEventListener("install", (event) => {
  // Nothing here is tied to a build, so a new worker can take over at once.
  self.skipWaiting();
  event.waitUntil(warm());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(activate());
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  // Range requests want partial answers, which a cached whole can't give.
  if (request.method !== "GET" || request.headers.has("Range")) {
    return;
  }
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return;
  }
  if (request.mode === "navigate") {
    event.respondWith(page(event));
  } else if (url.pathname.startsWith("/assets/")) {
    event.respondWith(asset(event));
  }
});
