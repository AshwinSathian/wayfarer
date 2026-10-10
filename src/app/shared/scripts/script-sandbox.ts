import { Injectable } from "@angular/core";
import { BinaryBody, SCRIPT_LIMITS, newId, stringifyJson, type ScriptResult } from "@wayfarer/core";

export interface ScriptResponseContext {
  statusCode: number;
  statusText: string;
  body: unknown;
  headers: Record<string, string>;
  durationMs?: number;
}

/** What the worker says about one run. */
type WorkerMessage = { id: string } & ({ type: "started" } | { type: "result"; result: ScriptResult } | { type: "failed"; message: string });

interface Run {
  settle: (result: ScriptResult) => void;
  timeoutMs: number;
  watchdog?: ReturnType<typeof setTimeout>;
}

/** How long after a script's own deadline the page waits for the worker before it ends the run itself. */
const WATCHDOG_GRACE_MS = 1000;

const nothing = (error?: string, limit?: ScriptResult["limit"]): ScriptResult => ({
  logs: [],
  envMutations: {},
  testResults: [],
  ...(error !== undefined && { error }),
  ...(limit && { limit }),
});

/**
 * Runs user-written pre-request and post-response scripts in the QuickJS
 * worker (`quickjs.worker.ts`).
 *
 * A script is run by a JavaScript engine compiled to WebAssembly, not by the
 * browser: it has the engine's own global object, which holds the language
 * and the few names `runScript` (`@wayfarer/core`) adds, and nothing of the
 * worker or the page. See docs/scripts.md.
 *
 * The worker is kept between runs, so the engine is downloaded and compiled
 * once; each run gets a new engine runtime, so no script sees another's
 * state. A run that hits a limit ends the worker, and the next run starts a
 * new one.
 */
@Injectable({ providedIn: "root" })
export class ScriptSandbox {
  private worker: Worker | null = null;
  private readonly runs = new Map<string, Run>();

  execute(script: string, env: Record<string, string>, response?: ScriptResponseContext, timeoutMs: number = SCRIPT_LIMITS.timeoutMs): Promise<ScriptResult> {
    if (!script?.trim()) {
      return Promise.resolve(nothing());
    }
    return new Promise<ScriptResult>((settle) => {
      const id = newId();
      this.runs.set(id, { settle, timeoutMs });
      this.start().postMessage({
        id,
        source: script,
        context: {
          environment: Object.entries(env),
          ...(response && {
            response: {
              code: response.statusCode,
              status: response.statusText,
              headers: response.headers,
              body: bodyText(response.body),
              responseTime: response.durationMs ?? 0,
            },
          }),
        },
        limits: { ...SCRIPT_LIMITS, timeoutMs },
      });
    });
  }

  private start(): Worker {
    if (this.worker) return this.worker;
    const worker = new Worker(new URL("./quickjs.worker", import.meta.url), { type: "module" });
    worker.addEventListener("message", ({ data }: MessageEvent<WorkerMessage>) => this.onMessage(data));
    worker.addEventListener("error", (event) => this.discard(event.message || "Script execution failed."));
    this.worker = worker;
    return worker;
  }

  private onMessage(message: WorkerMessage): void {
    const run = this.runs.get(message.id);
    if (!run) return;
    if (message.type === "started") {
      // The engine stops a script at its deadline. Should the engine itself
      // hang, the page stops waiting a second later.
      run.watchdog = setTimeout(() => {
        this.finish(message.id, nothing(`Script timed out after ${run.timeoutMs} ms`, "timeout"));
        this.discard("Script execution was stopped.");
      }, run.timeoutMs + WATCHDOG_GRACE_MS);
      return;
    }
    if (message.type === "failed") {
      this.finish(message.id, nothing(message.message));
      this.discard("Script execution was stopped.");
      return;
    }
    this.finish(message.id, message.result);
    // After a limit the engine may be unusable: the next run gets a new worker.
    if (message.result.limit) this.discard("Script execution was stopped.");
  }

  private finish(id: string, result: ScriptResult): void {
    const run = this.runs.get(id);
    if (!run) return;
    clearTimeout(run.watchdog);
    this.runs.delete(id);
    run.settle(result);
  }

  /** Ends the worker. Every run still waiting on it ends with `reason`. */
  private discard(reason: string): void {
    this.worker?.terminate();
    this.worker = null;
    for (const id of [...this.runs.keys()]) this.finish(id, nothing(reason));
  }
}

/** A response body as the text a script reads: text as it is, parsed JSON written out again, nothing for bytes. */
function bodyText(body: unknown): string {
  if (typeof body === "string") return body;
  if (body === undefined || body === null || body instanceof BinaryBody) return "";
  return stringifyJson(body) ?? "";
}
