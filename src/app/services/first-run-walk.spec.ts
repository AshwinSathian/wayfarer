import { TestBed } from "@angular/core/testing";
import { beforeEach, describe, expect, it } from "vitest";
import { FirstRunWalk, WALK_STEPS } from "./first-run-walk";

describe("FirstRunWalk", () => {
  beforeEach(() => {
    localStorage.removeItem("wayfarer:first-walk");
    TestBed.resetTestingModule();
  });

  it("is inactive until the example starts it, goes through its stops, and ends once", () => {
    const walk = TestBed.inject(FirstRunWalk);
    expect(walk.active()).toBe(false);
    walk.start();
    expect(walk.active()).toBe(true);
    for (let i = 1; i < WALK_STEPS; i++) {
      walk.next();
      expect(walk.step()).toBe(i);
    }
    walk.next();
    expect(walk.active()).toBe(false);
    expect(localStorage.getItem("wayfarer:first-walk")).not.toBeNull();
  });

  it("does not start again in a profile that ended it", () => {
    TestBed.inject(FirstRunWalk).finish();
    TestBed.resetTestingModule();
    const walk = TestBed.inject(FirstRunWalk);
    walk.start();
    expect(walk.active()).toBe(false);
  });
});
