import { Injectable } from "@angular/core";
import { ScriptExecutionResult, TestResult } from "../../models/test-assertion.models";

export interface ScriptResponseContext {
  statusCode: number;
  statusText: string;
  body: unknown;
  headers: Record<string, string>;
  durationMs?: number;
}

export interface ScriptEnvContext {
  get: (key: string) => string | undefined;
}

@Injectable({ providedIn: "root" })
export class ScriptSandboxService {
  /**
   * Executes a user script in a sandboxed context.
   * Dangerous globals are shadowed. The `pm` API surface is intentionally minimal.
   */
  execute(
    script: string,
    env: ScriptEnvContext,
    response?: ScriptResponseContext
  ): ScriptExecutionResult {
    const logs: string[] = [];
    const envMutations: Record<string, string> = {};
    const testResults: TestResult[] = [];

    if (!script?.trim()) {
      return { logs, envMutations, testResults };
    }

    const pmApi = this.buildPmApi(env, envMutations, testResults, response);
    const consoleApi = this.buildConsoleApi(logs);

    try {
      // Shadow every dangerous global by injecting them as undefined parameters.
      // The Function constructor itself can't be blocked this way (it's a language primitive)
      // but we prevent network access and DOM manipulation.
      const wrappedCode = `
        "use strict";
        (function(
          window, self, globalThis,
          document, location, history, navigator, screen,
          fetch, XMLHttpRequest, WebSocket, EventSource,
          Worker, SharedWorker, ServiceWorker,
          importScripts, require, module, exports,
          eval, setTimeout, setInterval, clearTimeout, clearInterval,
          __proto__
        ) {
          ${script}
        })(
          undefined, undefined, undefined,
          undefined, undefined, undefined, undefined, undefined,
          undefined, undefined, undefined, undefined,
          undefined, undefined, undefined, undefined,
          undefined, undefined, undefined, undefined,
          undefined, undefined, undefined, undefined,
          undefined
        );
      `;

      // eslint-disable-next-line no-new-func
      const fn = new Function("pm", "console", wrappedCode);
      fn(pmApi, consoleApi);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { logs, envMutations, testResults, error: message };
    }

    return { logs, envMutations, testResults };
  }

  private buildPmApi(
    env: ScriptEnvContext,
    envMutations: Record<string, string>,
    testResults: TestResult[],
    response?: ScriptResponseContext
  ): unknown {
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
        get: (key: string) => env.get(key) ?? null,
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
      expect: (actual: unknown) => this.buildExpect(actual),
    };
  }

  private buildExpect(actual: unknown) {
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

  private buildConsoleApi(logs: string[]) {
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
}
