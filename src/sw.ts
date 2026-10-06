/// <reference lib="webworker" />

// Wayfarer's service worker (P1.6). Compiled and given its asset manifest by
// scripts/build-sw.mjs, served at /sw.js. It replaces @angular/service-worker,
// which answered failed cross-origin requests with a synthetic 504 (F06).
//
// Rules:
// - Cross-origin requests are never intercepted: the user's API calls go
//   straight to the network, and their failures reach the app unchanged.
// - Navigations are network-first, falling back to the cached app shell, so
//   the app loads offline after one visit.
// - Hashed same-origin assets are cache-first (their names change when their
//   content does). The initial ones are precached at install; lazy chunks are
//   cached the first time they load.
// - A new version waits until the page asks it to take over (the "Update
//   available" banner), so a running page never mixes old and new chunks.

declare const WAYFARER_SW: { version: string; precache: string[] };

// A classic worker script (not a module), so `self` keeps its global type.
const sw = self as unknown as ServiceWorkerGlobalScope;
const CACHE_PREFIX = "wayfarer-";
const CACHE = `${CACHE_PREFIX}${WAYFARER_SW.version}`;
const SHELL = "/";
// esbuild's output hashes: main-XU6HGUMA.js, media/inter-latin-…-B6TL4M5W.woff2
const HASHED = /-[A-Z0-9]{8}\.[a-z0-9]+$/;

sw.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(WAYFARER_SW.precache.map((path) => new Request(path, { cache: "reload" })));
      // Only a previous version of this worker waits for the page's go-ahead.
      // A foreign worker (the pre-v1.1.0 Angular one at /ngsw-worker.js, or
      // its safety replacement) is replaced at once: it is what caused F06.
      if (!sw.registration.active?.scriptURL.endsWith("/sw.js")) await sw.skipWaiting();
    })()
  );
});

sw.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Older Wayfarer versions, and the caches of the pre-v1.1.0 Angular
      // service worker ("ngsw:…").
      for (const key of await caches.keys()) {
        if ((key.startsWith(CACHE_PREFIX) && key !== CACHE) || key.startsWith("ngsw:")) await caches.delete(key);
      }
      await sw.clients.claim();
    })()
  );
});

sw.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") void sw.skipWaiting();
});

sw.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (url.origin !== sw.location.origin || request.method !== "GET") return;
  if (request.mode === "navigate") {
    event.respondWith(networkFirstShell(request));
  } else if (HASHED.test(url.pathname) || WAYFARER_SW.precache.includes(url.pathname)) {
    event.respondWith(cacheFirst(request));
  }
});

async function networkFirstShell(request: Request): Promise<Response> {
  try {
    const response = await fetch(request);
    // Only the SPA's index.html is the shell; a navigation to a text file
    // (THIRD_PARTY_NOTICES.md, security.txt) must not replace it.
    if (response.ok && isHtml(response)) await (await caches.open(CACHE)).put(SHELL, response.clone());
    return response;
  } catch (error) {
    // Offline or unreachable: serve the cached shell (every route is the SPA).
    const cached = await caches.match(SHELL);
    if (cached) return cached;
    throw error;
  }
}

async function cacheFirst(request: Request): Promise<Response> {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  // A missing asset gets the SPA's index.html with a 200 from the host; never
  // cache that under a script or font URL.
  if (response.ok && !isHtml(response)) await (await caches.open(CACHE)).put(request, response.clone());
  return response;
}

function isHtml(response: Response): boolean {
  return response.headers.get("content-type")?.includes("text/html") ?? false;
}
