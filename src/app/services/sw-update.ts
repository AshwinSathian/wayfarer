import { Injectable, inject, isDevMode, signal } from "@angular/core";
import { Diagnostics } from "./diagnostics";

/**
 * Registers the service worker (src/sw.ts, built to /sw.js by
 * scripts/build-sw.mjs) in production builds, and offers a waiting new
 * version as "Update available" instead of switching under a running page.
 */
@Injectable({ providedIn: "root" })
export class SwUpdate {
  private readonly diagnostics = inject(Diagnostics);
  readonly updateAvailable = signal(false);
  private waiting: ServiceWorker | null = null;
  private reloading = false;

  async register(): Promise<void> {
    if (isDevMode() || !("serviceWorker" in navigator)) return;
    const container = navigator.serviceWorker;
    try {
      this.watch(container, await container.register("/sw.js", { scope: "/", updateViaCache: "none" }));
    } catch (error) {
      this.diagnostics.record(error, "service worker: registration failed");
    }
  }

  /**
   * Offers a new version of this worker once it has installed. A first
   * install, or one replacing the pre-v1.1.0 worker, takes over by itself
   * (src/sw.ts) and is not an update.
   *
   * Which of the two it is, is read from the registration when the worker
   * starts to install, as src/sw.ts reads it. Read later, from the page's
   * controller when the "installed" event arrives, a first install could
   * look like an update: the worker can already have claimed the page.
   */
  watch(container: ServiceWorkerContainer, registration: ServiceWorkerRegistration): void {
    const ours = () => !!registration.active?.scriptURL.endsWith("/sw.js");
    const offer = (worker: ServiceWorker) => {
      this.waiting = worker;
      this.updateAvailable.set(true);
    };
    const track = (worker: ServiceWorker) => {
      if (!ours()) return;
      worker.addEventListener("statechange", () => worker.state === "installed" && offer(worker));
    };
    if (registration.waiting && ours()) offer(registration.waiting);
    if (registration.installing) track(registration.installing);
    registration.addEventListener("updatefound", () => registration.installing && track(registration.installing));
    container.addEventListener("controllerchange", () => this.reloading && location.reload());
  }

  /** Activates the waiting version; the page reloads once it takes control. */
  applyUpdate(): void {
    if (!this.waiting) return;
    this.reloading = true;
    this.waiting.postMessage("SKIP_WAITING");
  }
}
