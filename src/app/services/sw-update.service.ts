import { Injectable, inject, isDevMode, signal } from "@angular/core";
import { DiagnosticsService } from "./diagnostics.service";

/**
 * Registers the service worker (src/sw.ts, built to /sw.js by
 * scripts/build-sw.mjs) in production builds, and offers a waiting new
 * version as "Update available" instead of switching under a running page.
 */
@Injectable({ providedIn: "root" })
export class SwUpdateService {
  private readonly diagnostics = inject(DiagnosticsService);
  readonly updateAvailable = signal(false);
  private waiting: ServiceWorker | null = null;
  private reloading = false;

  async register(): Promise<void> {
    if (isDevMode() || !("serviceWorker" in navigator)) return;
    const container = navigator.serviceWorker;
    try {
      const registration = await container.register("/sw.js", { scope: "/", updateViaCache: "none" });
      // Only a new version of this worker is an update; a first install, or
      // one replacing the pre-v1.1.0 worker, takes over by itself (src/sw.ts).
      const offer = (worker: ServiceWorker) => {
        if (!container.controller?.scriptURL.endsWith("/sw.js")) return;
        this.waiting = worker;
        this.updateAvailable.set(true);
      };
      const track = (worker: ServiceWorker) =>
        worker.addEventListener("statechange", () => worker.state === "installed" && offer(worker));
      if (registration.waiting) offer(registration.waiting);
      if (registration.installing) track(registration.installing);
      registration.addEventListener("updatefound", () => registration.installing && track(registration.installing));
      container.addEventListener("controllerchange", () => this.reloading && location.reload());
    } catch (error) {
      this.diagnostics.record(error, "service worker: registration failed");
    }
  }

  /** Activates the waiting version; the page reloads once it takes control. */
  applyUpdate(): void {
    if (!this.waiting) return;
    this.reloading = true;
    this.waiting.postMessage("SKIP_WAITING");
  }
}
