// Service-worker kill switch (plan R12). Deployed in place of sw.js when a
// broken worker ships: it takes over at once, deletes every cache this origin
// holds, unregisters itself, and reloads open tabs from the network.
// Procedure: docs/runbook.md#service-worker-kill-switch.
self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) await caches.delete(key);
      await self.registration.unregister();
      for (const client of await self.clients.matchAll({ type: "window" })) client.navigate(client.url);
    })()
  );
});
