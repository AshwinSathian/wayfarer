import { TestBed } from "@angular/core/testing";
import { describe, expect, it } from "vitest";
import { SwUpdate } from "./sw-update";

/** A service worker as the page sees it: a state, and an event when it changes. */
class FakeWorker extends EventTarget {
  state: ServiceWorkerState = "installing";
  readonly scriptURL = "https://app.test/sw.js";

  become(state: ServiceWorkerState): void {
    this.state = state;
    this.dispatchEvent(new Event("statechange"));
  }
}

class FakeRegistration extends EventTarget {
  active: { scriptURL: string } | null = null;
  waiting: FakeWorker | null = null;
  installing: FakeWorker | null = null;
  updates = 0;
  update(): Promise<void> {
    this.updates++;
    return Promise.resolve();
  }
}

class FakeContainer extends EventTarget {
  controller: { scriptURL: string } | null = null;
}

const OURS = { scriptURL: "https://app.test/sw.js" };

function watch(registration: FakeRegistration, container = new FakeContainer()) {
  const service = TestBed.inject(SwUpdate);
  service.watch(container as unknown as ServiceWorkerContainer, registration as unknown as ServiceWorkerRegistration);
  return { service, container };
}

describe("SwUpdate", () => {
  it("offers nothing on a first visit, even when the new worker has taken the page over before its 'installed' event arrives", () => {
    const registration = new FakeRegistration();
    const worker = (registration.installing = new FakeWorker());
    const { service, container } = watch(registration);

    // WebKit on a slow machine: the worker skips waiting, activates and claims
    // the page, and only then is the queued "installed" event delivered.
    container.controller = OURS;
    registration.active = OURS;
    worker.become("installed");

    expect(service.updateAvailable()).toBe(false);
  });

  it("offers a new version that finishes installing while this app's worker is in charge", () => {
    const registration = new FakeRegistration();
    registration.active = OURS;
    const { service, container } = watch(registration);
    container.controller = OURS;

    const worker = (registration.installing = new FakeWorker());
    registration.dispatchEvent(new Event("updatefound"));
    expect(service.updateAvailable()).toBe(false);
    worker.become("installed");

    expect(service.updateAvailable()).toBe(true);
  });

  it("offers a version that was already waiting when the page loaded", () => {
    const registration = new FakeRegistration();
    registration.active = OURS;
    registration.waiting = new FakeWorker();

    expect(watch(registration).service.updateAvailable()).toBe(true);
  });

  it("asks for a new build when the page comes back into view: a tab left open is told of a deploy", () => {
    const registration = new FakeRegistration();
    registration.active = OURS;
    watch(registration);
    expect(registration.updates).toBe(0);

    document.dispatchEvent(new Event("visibilitychange"));

    expect(document.visibilityState).toBe("visible");
    expect(registration.updates).toBe(1);
  });
});
