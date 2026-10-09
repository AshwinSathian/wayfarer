import { TestBed } from "@angular/core/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RequestSettings } from "./request-settings";

const KEY = "wayfarer:request-timeout-ms";

describe("RequestSettings", () => {
  beforeEach(() => localStorage.removeItem(KEY));
  afterEach(() => localStorage.removeItem(KEY));

  it("has no timeout until one is set, and keeps the one set", () => {
    const settings = TestBed.inject(RequestSettings);
    expect(settings.timeoutMs()).toBe(0);

    settings.setTimeoutMs(1500.7);

    expect(settings.timeoutMs()).toBe(1500);
    expect(localStorage.getItem(KEY)).toBe("1500");
  });

  it("reads the stored timeout, and treats anything that is not a positive number as none", () => {
    localStorage.setItem(KEY, "2000");
    expect(TestBed.inject(RequestSettings).timeoutMs()).toBe(2000);

    const settings = TestBed.inject(RequestSettings);
    for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      settings.setTimeoutMs(bad);
      expect(settings.timeoutMs()).toBe(0);
      expect(localStorage.getItem(KEY)).toBeNull();
    }

    localStorage.setItem(KEY, "soon");
    TestBed.resetTestingModule();
    expect(TestBed.inject(RequestSettings).timeoutMs()).toBe(0);
  });

  it("history keeps 500 entries and their bodies, and a variable without a value holds a request back, until set otherwise", () => {
    for (const key of ["wayfarer:history-cap", "wayfarer:history-bodies", "wayfarer:block-unresolved"]) localStorage.removeItem(key);
    TestBed.resetTestingModule();
    const settings = TestBed.inject(RequestSettings);
    expect([settings.historyCap(), settings.historyBodies(), settings.blockUnresolved()]).toEqual([500, true, true]);

    settings.setHistoryCap(5.9);
    settings.setHistoryBodies(false);
    settings.setBlockUnresolved(false);
    expect([settings.historyCap(), settings.historyBodies(), settings.blockUnresolved()]).toEqual([5, false, false]);

    // Kept over a reload.
    TestBed.resetTestingModule();
    const reloaded = TestBed.inject(RequestSettings);
    expect([reloaded.historyCap(), reloaded.historyBodies(), reloaded.blockUnresolved()]).toEqual([5, false, false]);

    // A cap is 1 to 5000; anything else is the default. Switching back on removes the key.
    reloaded.setHistoryCap(99_999);
    expect(reloaded.historyCap()).toBe(5000);
    for (const bad of [0, -1, Number.NaN]) {
      reloaded.setHistoryCap(bad);
      expect(reloaded.historyCap()).toBe(500);
    }
    reloaded.setHistoryBodies(true);
    reloaded.setBlockUnresolved(true);
    expect(localStorage.getItem("wayfarer:history-bodies")).toBeNull();
    expect(localStorage.getItem("wayfarer:block-unresolved")).toBeNull();
    localStorage.removeItem("wayfarer:history-cap");
  });
});
