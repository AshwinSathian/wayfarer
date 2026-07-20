/// <reference lib="webworker" />

/**
 * Executes user-authored pre/post-request scripts.
 *
 * This file runs inside a dedicated Worker realm, not the main thread. A dedicated
 * worker never has `window`, `document`, cookies, `localStorage`, or any reference to
 * the main thread's JS heap (where the secrets vault key and other app state live) —
 * that isolation is a browser guarantee, not something this file has to enforce.
 *
 * What this file *does* have to enforce is stripping the network/storage primitives a
 * worker realm is otherwise granted (`fetch`, `XMLHttpRequest`, `WebSocket`, ...), since
 * those would let a malicious script exfiltrate whatever environment variables were
 * handed to it. That stripping happens first, before any user code is ever evaluated.
 */

type WorkerGlobal = Record<string, unknown>;

const FORBIDDEN_GLOBALS = [
  "fetch",
  "XMLHttpRequest",
  "WebSocket",
  "EventSource",
  "importScripts",
  "Worker",
  "SharedWorker",
  "indexedDB",
  "caches",
  "navigator",
  "RTCPeerConnection",
  "BroadcastChannel",
  "SharedArrayBuffer",
  "eval",
] as const;

function stripDangerousGlobals(): void {
  const globalScope = self as unknown as WorkerGlobal;
  for (const key of FORBIDDEN_GLOBALS) {
    // `delete` alone is not enough: in Chrome, these globals are writable but
    // *non-configurable* own properties of the worker global object, so
    // `delete self.fetch` silently fails (throws in this always-strict module
    // worker, caught below) and the property survives untouched. Reassigning
    // to `undefined` does work, since the property is writable — that's what
    // actually removes `fetch`/`importScripts`/etc. from reach. Verified by
    // the regression suite in script-sandbox.service.spec.ts, which caught
    // delete-only stripping failing to block `Function('return fetch')()`.
    try {
      delete globalScope[key];
    } catch {
      // non-configurable; reassignment below is what actually matters.
    }
    try {
      globalScope[key] = undefined;
    } catch {
      // Non-writable in this engine too — realm-level isolation (no DOM,
      // cookies, localStorage, or main-thread heap access) still holds.
    }
  }
}

stripDangerousGlobals();

interface ScriptResponseContext {
  statusCode: number;
  statusText: string;
  body: unknown;
  headers: Record<string, string>;
  durationMs?: number;
}

interface TestResult {
  label: string;
  passed: boolean;
  actual?: unknown;
  expected?: unknown;
  error?: string;
  source: "assertion" | "script";
}

interface RunMessage {
  type: "run";
  runId: string;
  script: string;
  env: Record<string, string>;
  response?: ScriptResponseContext;
}

interface ResultMessage {
  type: "result";
  runId: string;
  logs: string[];
  envMutations: Record<string, string>;
  testResults: TestResult[];
  error?: string;
}

function buildExpect(actual: unknown) {
  const assert = (condition: boolean, message: string) => {
    if (!condition) {
      throw new Error(message);
    }
  };
  return {
    to: {
      equal: (expected: unknown) =>
        assert(actual === expected, `Expected ${JSON.stringify(actual)} to equal ${JSON.stringify(expected)}`),
      eql: (expected: unknown) =>
        assert(
          JSON.stringify(actual) === JSON.stringify(expected),
          `Expected ${JSON.stringify(actual)} to deep-equal ${JSON.stringify(expected)}`
        ),
      include: (expected: unknown) => {
        if (typeof actual === "string") {
          assert(actual.includes(String(expected)), `Expected "${actual}" to include "${expected}"`);
        } else if (Array.isArray(actual)) {
          assert(actual.includes(expected), `Expected array to include ${JSON.stringify(expected)}`);
        } else {
          assert(false, `Expected value to include ${JSON.stringify(expected)}`);
        }
      },
      be: {
        ok: () => assert(!!actual, `Expected ${JSON.stringify(actual)} to be truthy`),
        null: () => assert(actual === null, `Expected ${JSON.stringify(actual)} to be null`),
        undefined: () => assert(actual === undefined, `Expected value to be undefined`),
        a: (type: string) => assert(typeof actual === type, `Expected ${JSON.stringify(actual)} to be a ${type}`),
        an: (type: string) => assert(typeof actual === type, `Expected ${JSON.stringify(actual)} to be an ${type}`),
        below: (n: number) => assert((actual as number) < n, `Expected ${actual} to be below ${n}`),
        above: (n: number) => assert((actual as number) > n, `Expected ${actual} to be above ${n}`),
      },
      have: {
        status: (code: number) => {
          const resp = actual as { code?: number };
          assert(resp?.code === code, `Expected status ${resp?.code} to equal ${code}`);
        },
        property: (key: string) => {
          const obj = actual as Record<string, unknown>;
          assert(key in obj, `Expected object to have property "${key}"`);
        },
      },
      not: {
        equal: (expected: unknown) =>
          assert(actual !== expected, `Expected ${JSON.stringify(actual)} to not equal ${JSON.stringify(expected)}`),
        include: (expected: unknown) => {
          if (typeof actual === "string") {
            assert(!actual.includes(String(expected)), `Expected "${actual}" to not include "${expected}"`);
          }
        },
      },
    },
  };
}

function buildPmApi(
  env: Record<string, string>,
  envMutations: Record<string, string>,
  testResults: TestResult[],
  response?: ScriptResponseContext
) {
  const responseApi = response
    ? {
        code: response.statusCode,
        status: response.statusText,
        json: () => {
          if (typeof response.body === "string") {
            try {
              return JSON.parse(response.body);
            } catch {
              return null;
            }
          }
          return response.body ?? null;
        },
        text: () => {
          if (typeof response.body === "string") {
            return response.body;
          }
          try {
            return JSON.stringify(response.body);
          } catch {
            return "";
          }
        },
        headers: {
          get: (name: string) => response.headers[name] ?? response.headers[name.toLowerCase()] ?? null,
        },
        responseTime: response.durationMs ?? 0,
      }
    : null;

  return {
    environment: {
      get: (key: string) => (key in envMutations ? envMutations[key] : env[key]) ?? null,
      set: (key: string, value: unknown) => {
        envMutations[String(key)] = String(value ?? "");
      },
      unset: (key: string) => {
        envMutations[String(key)] = "";
      },
    },
    response: responseApi,
    test: (label: string, fn: () => void) => {
      try {
        fn();
        testResults.push({ label: String(label ?? ""), passed: true, source: "script" });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        testResults.push({ label: String(label ?? ""), passed: false, error: message, source: "script" });
      }
    },
    expect: (actual: unknown) => buildExpect(actual),
  };
}

function buildConsoleApi(logs: string[]) {
  const format = (...args: unknown[]) =>
    args
      .map((a) => {
        if (typeof a === "string") {
          return a;
        }
        try {
          return JSON.stringify(a);
        } catch {
          return String(a);
        }
      })
      .join(" ");
  return {
    log: (...args: unknown[]) => logs.push(format(...args)),
    warn: (...args: unknown[]) => logs.push(`[warn] ${format(...args)}`),
    error: (...args: unknown[]) => logs.push(`[error] ${format(...args)}`),
    info: (...args: unknown[]) => logs.push(format(...args)),
  };
}

function runScript(message: RunMessage): ResultMessage {
  const logs: string[] = [];
  const envMutations: Record<string, string> = {};
  const testResults: TestResult[] = [];

  if (!message.script?.trim()) {
    return { type: "result", runId: message.runId, logs, envMutations, testResults };
  }

  const pmApi = buildPmApi(message.env, envMutations, testResults, message.response);
  const consoleApi = buildConsoleApi(logs);

  try {
    // Belt-and-suspenders local shadowing on top of the realm-level deletion above —
    // it doesn't add real protection on its own (Function() only resolves free
    // variables through the global object, never through this closure), but it costs
    // nothing and narrows the surface further for anything not already stripped.
    const wrappedCode = `
      "use strict";
      (function(
        window, self, globalThis,
        document, location, history, navigator, screen,
        fetch, XMLHttpRequest, WebSocket, EventSource,
        Worker, SharedWorker, ServiceWorker,
        importScripts, require, module, exports,
        __proto__
      ) {
        ${message.script}
      })(
        undefined, undefined, undefined,
        undefined, undefined, undefined, undefined, undefined,
        undefined, undefined, undefined, undefined,
        undefined, undefined, undefined,
        undefined, undefined, undefined, undefined,
        undefined
      );
    `;

     
    const fn = new Function("pm", "console", wrappedCode);
    fn(pmApi, consoleApi);
  } catch (err) {
    const message2 = err instanceof Error ? err.message : String(err);
    return { type: "result", runId: message.runId, logs, envMutations, testResults, error: message2 };
  }

  return { type: "result", runId: message.runId, logs, envMutations, testResults };
}

addEventListener("message", ({ data }: MessageEvent<RunMessage>) => {
  if (!data || data.type !== "run") {
    return;
  }
  const result = runScript(data);
  postMessage(result);
});
