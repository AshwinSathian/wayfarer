import { TestBed } from "@angular/core/testing";
import { ScriptSandboxService } from "./script-sandbox.service";
import { describe, it, beforeEach, expect } from "vitest";

describe("ScriptSandboxService", () => {
  let service: ScriptSandboxService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [ScriptSandboxService] });
    service = TestBed.inject(ScriptSandboxService);
  });

  function runAssertionScript(script: string) {
    return service.execute(script, {});
  }

  it("runs a benign script and reports its pm.test results", async () => {
    const result = await runAssertionScript(`
      pm.test("addition works", () => {
        if (1 + 1 !== 2) { throw new Error("math is broken"); }
      });
    `);
    expect(result.error).toBeUndefined();
    expect(result.testResults.length).toBe(1);
    expect(result.testResults[0].passed).toBe(true);
  });

  it("gives scripts read/write access to the environment it was handed", async () => {
    const result = await service.execute(
      `
        pm.test("reads env", () => {
          if (pm.environment.get("API_KEY") !== "abc123") { throw new Error("env not visible"); }
        });
        pm.environment.set("TOKEN", "minted-by-script");
      `,
      { API_KEY: "abc123" }
    );
    expect(result.testResults[0].passed).toBe(true);
    expect(result.envMutations["TOKEN"]).toBe("minted-by-script");
  });

  // --- Regression suite for the Part B3 sandbox-escape finding -------------------
  //
  // The original implementation ran scripts via `new Function(...)` directly on the
  // main thread and tried to block dangerous globals by shadowing them as local
  // function parameters. That doesn't work: `Function`-constructed code only resolves
  // free variables through the realm's *global* object, never through the lexical
  // scope of whoever called `new Function` — so `Function('return fetch')()` walks
  // straight past the shadowing and re-acquires the real `fetch`, `document`, etc.
  // These tests assert that class of escape is unreachable now that scripts run inside
  // a dedicated Worker realm with the network/DOM-adjacent globals stripped.

  it("cannot reach window/self/globalThis from script scope", async () => {
    const result = await runAssertionScript(`
      pm.test("window unreachable", () => { if (typeof window !== "undefined") throw new Error("window visible"); });
      pm.test("self unreachable", () => { if (typeof self !== "undefined") throw new Error("self visible"); });
      pm.test("globalThis has no window", () => {
        if (typeof globalThis !== "undefined" && typeof globalThis.window !== "undefined") throw new Error("globalThis.window visible");
      });
    `);
    expect(result.error).toBeUndefined();
    for (const test of result.testResults) {
      if (!test.passed) { throw new Error(test.label + ": " + test.error); } expect(test.passed).toBe(true);
    }
  });

  it("cannot reach document, cookies, or localStorage from script scope", async () => {
    const result = await runAssertionScript(`
      pm.test("document unreachable", () => { if (typeof document !== "undefined") throw new Error("document visible"); });
      pm.test("localStorage unreachable", () => { if (typeof localStorage !== "undefined") throw new Error("localStorage visible"); });
    `);
    expect(result.error).toBeUndefined();
    for (const test of result.testResults) {
      if (!test.passed) { throw new Error(test.label + ": " + test.error); } expect(test.passed).toBe(true);
    }
  });

  it("cannot re-acquire fetch/XMLHttpRequest via Function() global-scope lookup — the exact exploit from the audit", async () => {
    const result = await runAssertionScript(`
      pm.test("Function('return fetch') yields nothing usable", () => {
        var reacquired;
        try { reacquired = Function("return typeof fetch")(); } catch (e) { reacquired = "threw"; }
        if (reacquired !== "undefined" && reacquired !== "threw") {
          throw new Error("fetch was reacquired: " + reacquired);
        }
      });
      pm.test("Function('return XMLHttpRequest') yields nothing usable", () => {
        var reacquired;
        try { reacquired = Function("return typeof XMLHttpRequest")(); } catch (e) { reacquired = "threw"; }
        if (reacquired !== "undefined" && reacquired !== "threw") {
          throw new Error("XMLHttpRequest was reacquired: " + reacquired);
        }
      });
      pm.test("direct fetch identifier is not defined", () => {
        var direct;
        try { direct = typeof fetch; } catch (e) { direct = "threw"; }
        if (direct !== "undefined" && direct !== "threw") {
          throw new Error("fetch identifier resolved: " + direct);
        }
      });
    `);
    expect(result.error).toBeUndefined();
    for (const test of result.testResults) {
      if (!test.passed) { throw new Error(test.label + ": " + test.error); } expect(test.passed).toBe(true);
    }
  });

  it("cannot spawn nested workers or reach WebSocket/EventSource/importScripts", async () => {
    const result = await runAssertionScript(`
      function reacquire(name) {
        try { return Function("return typeof " + name)(); } catch (e) { return "threw"; }
      }
      pm.test("Worker unreachable", () => {
        const r = reacquire("Worker");
        if (r !== "undefined" && r !== "threw") throw new Error("Worker visible: " + r);
      });
      pm.test("WebSocket unreachable", () => {
        const r = reacquire("WebSocket");
        if (r !== "undefined" && r !== "threw") throw new Error("WebSocket visible: " + r);
      });
      pm.test("EventSource unreachable", () => {
        const r = reacquire("EventSource");
        if (r !== "undefined" && r !== "threw") throw new Error("EventSource visible: " + r);
      });
      pm.test("importScripts unreachable", () => {
        const r = reacquire("importScripts");
        if (r !== "undefined" && r !== "threw") throw new Error("importScripts visible: " + r);
      });
    `);
    expect(result.error).toBeUndefined();
    for (const test of result.testResults) {
      if (!test.passed) { throw new Error(test.label + ": " + test.error); } expect(test.passed).toBe(true);
    }
  });

  it("only exposes the env keys it was explicitly handed, nothing else from the app", async () => {
    const result = await service.execute(
      `
        pm.test("only given key is present", () => {
          if (pm.environment.get("VISIBLE") !== "yes") throw new Error("expected key missing");
          if (pm.environment.get("SECRET_NOT_PASSED") !== null) throw new Error("leaked something not passed in");
        });
      `,
      { VISIBLE: "yes" }
    );
    expect(result.testResults.every((t) => t.passed)).toBe(true);
  });

  it("surfaces a script's own runtime errors instead of throwing out of the service", async () => {
    const result = await runAssertionScript(`throw new Error("boom");`);
    expect(result.error).toContain("boom");
  });

  it("times out a hung script instead of hanging the caller forever", async () => {
    const result = await service.execute(`while (true) {}`, {}, undefined, 300);
    expect(result.error).toContain("timed out");
  });

  it("resolves immediately for an empty script without spawning a worker", async () => {
    const result = await service.execute("", {});
    expect(result).toEqual({ logs: [], envMutations: {}, testResults: [] });
  });
});
