import { TestBed } from "@angular/core/testing";
import { ScriptSandbox } from "./script-sandbox";
import { afterEach, describe, it, beforeEach, expect, vi } from "vitest";

describe("ScriptSandbox", () => {
  let service: ScriptSandbox;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [ScriptSandbox] });
    service = TestBed.inject(ScriptSandbox);
  });

  function runAssertionScript(script: string) {
    return service.execute(script, {});
  }

  it("@claim:C-040 runs a benign script and reports its pm.test results", async () => {
    const result = await runAssertionScript(`
      pm.test("addition works", () => {
        if (1 + 1 !== 2) { throw new Error("math is broken"); }
      });
    `);
    expect(result.error).toBeUndefined();
    expect(result.testResults.length).toBe(1);
    expect(result.testResults[0].passed).toBe(true);
  });

  it("require gives a library, fetched by the worker when the script names it, and refuses any other module", async () => {
    const result = await runAssertionScript(`
      const CryptoJS = require("crypto-js");
      console.log(require("lodash").chunk([1, 2, 3], 2).length, CryptoJS.SHA256("abc").toString().slice(0, 8), require("uuid").validate(require("uuid").v4()));
      require("cheerio");
    `);
    expect(result.logs).toEqual(["2 ba7816bf true"]);
    expect(result.error).toBe("require('cheerio') is not supported — see docs/postman-compatibility.md#require");
  });

  it("@claim:C-040 gives scripts read/write access to the environment it was handed", async () => {
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

  describe("when the worker does not behave (P3.6)", () => {
    /** A worker that says the engine is loaded and then does what the test tells it. */
    class FakeWorker extends EventTarget {
      static made: FakeWorker[] = [];
      terminated = false;
      runs: string[] = [];
      constructor() {
        super();
        FakeWorker.made.push(this);
      }
      postMessage(message: { id: string }): void {
        this.runs.push(message.id);
        queueMicrotask(() => this.say({ id: message.id, type: "started" }));
      }
      say(data: unknown): void {
        this.dispatchEvent(new MessageEvent("message", { data }));
      }
      terminate(): void {
        this.terminated = true;
      }
    }

    beforeEach(() => {
      FakeWorker.made = [];
      vi.stubGlobal("Worker", FakeWorker);
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    });

    it("ends a run itself one second after the script's deadline, ends the worker, and starts a new one for the next run", async () => {
      let settled = false;
      const run = service.execute("neverAnswers()", {}, undefined, 300).then((result) => {
        settled = true;
        return result;
      });
      await vi.advanceTimersByTimeAsync(1299);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(2);
      expect(await run).toEqual({ logs: [], envMutations: {}, testResults: [], error: "Script timed out after 300 ms", limit: "timeout" });
      expect(FakeWorker.made).toHaveLength(1);
      expect(FakeWorker.made[0].terminated).toBe(true);

      const next = service.execute("next()", {});
      await vi.advanceTimersByTimeAsync(0);
      expect(FakeWorker.made).toHaveLength(2);
      FakeWorker.made[1].say({ id: FakeWorker.made[1].runs[0], type: "result", result: { logs: ["ran"], envMutations: {}, testResults: [] } });
      expect((await next).logs).toEqual(["ran"]);
      // A run that ended normally keeps its worker.
      expect(FakeWorker.made[1].terminated).toBe(false);
    });

    it("ends the worker after a run that hit a limit, and every run still waiting on it", async () => {
      const first = service.execute("hitsALimit()", {});
      const second = service.execute("waiting()", {});
      await vi.advanceTimersByTimeAsync(0);
      const worker = FakeWorker.made[0];
      expect(FakeWorker.made).toHaveLength(1);
      worker.say({ id: worker.runs[0], type: "result", result: { logs: [], envMutations: {}, testResults: [], error: "Script exceeded memory limit (64 MB)", limit: "memory" } });
      expect((await first).limit).toBe("memory");
      expect(worker.terminated).toBe(true);
      expect((await second).error).toBe("Script execution was stopped.");
    });

    it("ignores a message that names no run of its own", async () => {
      const run = service.execute("real()", {});
      await vi.advanceTimersByTimeAsync(0);
      const worker = FakeWorker.made[0];
      worker.say({ id: "forged", type: "result", result: { logs: ["forged"], envMutations: { token: "forged" }, testResults: [] } });
      worker.say({ id: worker.runs[0], type: "result", result: { logs: ["real"], envMutations: {}, testResults: [] } });
      expect((await run).logs).toEqual(["real"]);
    });
  });

  it("resolves immediately for an empty script without spawning a worker", async () => {
    const result = await service.execute("", {});
    expect(result).toEqual({ logs: [], envMutations: {}, testResults: [] });
  });
});
