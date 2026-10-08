import { Injectable, InjectionToken, isDevMode } from "@angular/core";
import { ScriptExecutionResult } from "../../models/test-assertion.models";
import { newId } from "../id.util";

export interface ScriptResponseContext {
  statusCode: number;
  statusText: string;
  body: unknown;
  headers: Record<string, string>;
  durationMs?: number;
}

const DEFAULT_TIMEOUT_MS = 5000;

/**
 * Whether pre/post-request scripts run at all. False in production builds:
 * the worker below evaluates scripts with `new Function`, which production's
 * CSP (`script-src 'self'`, no `'unsafe-eval'`) blocks, so every script
 * failed there without a word (F01, #58). Scripts come back with the QuickJS
 * sandbox (P3.1), which deletes this token. Dev builds keep the old worker
 * so its spec suite still runs.
 */
export const SCRIPTS_ENABLED = new InjectionToken<boolean>("SCRIPTS_ENABLED", {
  providedIn: "root",
  factory: () => isDevMode(),
});

/** GitHub issue tracking the disabled script sandbox; shown in the Scripts tab banner. */
export const SCRIPTS_DISABLED_ISSUE = 58;

/**
 * Runs user-authored pre/post-request scripts in an isolated Web Worker
 * (`script-runner.worker.ts`) rather than on the main thread.
 *
 * Why a worker and not main-thread `Function()` shadowing: a dedicated worker is a
 * separate realm that never has `window`/`document`/cookies/`localStorage`, and has no
 * reference back to this thread's memory (the secrets vault key, other requests'
 * headers, etc.) — postMessage only carries structured-clone data, never live
 * references or functions. See docs/scripts.md for the full threat model and
 * `script-sandbox.service.spec.ts` for the regression suite proving escape attempts
 * (Function-based global re-acquisition, DOM/window access, network access) fail.
 *
 * A fresh worker is spawned per execution and terminated immediately after, so scripts
 * never share state across runs and a hung script (e.g. an infinite loop) is bounded by
 * `timeoutMs` rather than freezing anything.
 */
@Injectable({ providedIn: "root" })
export class ScriptSandboxService {
  execute(
    script: string,
    env: Record<string, string>,
    response?: ScriptResponseContext,
    timeoutMs: number = DEFAULT_TIMEOUT_MS
  ): Promise<ScriptExecutionResult> {
    if (!script?.trim()) {
      return Promise.resolve({ logs: [], envMutations: {}, testResults: [] });
    }

    if (typeof Worker === "undefined") {
      return Promise.resolve({
        logs: [],
        envMutations: {},
        testResults: [],
        error: "Scripts are unavailable: Web Workers are not supported in this browser.",
      });
    }

    return new Promise<ScriptExecutionResult>((resolve) => {
      const runId = newId();
      const worker = new Worker(new URL("./script-runner.worker", import.meta.url), {
        type: "module",
      });

      let settled = false;
      const finish = (result: ScriptExecutionResult) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        worker.removeEventListener("message", onMessage);
        worker.removeEventListener("error", onError);
        worker.terminate();
        resolve(result);
      };

      const onMessage = (event: MessageEvent) => {
        const data = event.data;
        if (!data || data.type !== "result" || data.runId !== runId) {
          return;
        }
        finish({
          logs: data.logs ?? [],
          envMutations: data.envMutations ?? {},
          testResults: data.testResults ?? [],
          error: data.error,
        });
      };

      const onError = (event: ErrorEvent) => {
        finish({
          logs: [],
          envMutations: {},
          testResults: [],
          error: event.message || "Script execution failed.",
        });
      };

      const timer = setTimeout(() => {
        finish({
          logs: [],
          envMutations: {},
          testResults: [],
          error: `Script timed out after ${timeoutMs}ms.`,
        });
      }, timeoutMs);

      worker.addEventListener("message", onMessage);
      worker.addEventListener("error", onError);
      worker.postMessage({ type: "run", runId, script, env, response });
    });
  }
}
