// Wayfarer: this file is deliberately Angular's safety worker, served at the
// old service-worker path so every browser that registered the Angular
// service worker before v1.1.0 picks it up on its next update check,
// unregisters, and deletes the ngsw caches. That worker answered failed
// cross-origin requests with a synthetic 504 (F06, #63). Keep this file at
// this path permanently (PLAN-airtight-remediation.md, P0.5 and P1.6 (e)).
// Source: @angular/service-worker/safety-worker.js (MIT, below).

/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */

// tslint:disable:no-console

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());

  event.waitUntil(
    self.registration.unregister().then(() => {
      console.log('NGSW Safety Worker - unregistered old service worker');
    }),
  );

  event.waitUntil(
    caches.keys().then((cacheNames) => {
      const ngswCacheNames = cacheNames.filter((name) => /^ngsw:/.test(name));
      return Promise.all(ngswCacheNames.map((name) => caches.delete(name)));
    }),
  );
});
