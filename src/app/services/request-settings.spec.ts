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
});
