import { DestroyRef, Injectable, inject } from "@angular/core";
import {
  SCRIPT_LIMITS,
  emptyChanges,
  newId,
  scriptResponse,
  type ScriptContext,
  type ScriptResponse,
  type ScriptResponseContext,
  type ScriptResult,
  type ScriptRunExtras,
  type ScriptSendRequest,
  type ScriptVariable,
} from "@wayfarer/core";

/** What the worker says about one run. */
type WorkerMessage = { id: string } & (
  | { type: "started" }
  | { type: "result"; result: ScriptResult }
  | { type: "failed"; message: string }
  | { type: "send"; call: number; request: ScriptSendRequest }
);

interface Run {
  /** The worker that runs this script, and no other at the same time. */
  worker: Worker;
  settle: (result: ScriptResult) => void;
  timeoutMs: number;
  watchdog?: ReturnType<typeof setTimeout>;
  send?: ScriptRunExtras["send"];
  /** Requests being made for the script. While there is one, the script is waiting and the watchdog is off. */
  inFlight: number;
}

/** How long after a script's own deadline the page waits for the worker before it ends the run itself. */
const WATCHDOG_GRACE_MS = 1000;

const nothing = (error?: string, limit?: ScriptResult["limit"]): ScriptResult => ({
  logs: [],
  changes: emptyChanges(),
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
 * A worker runs one script at a time, and one is kept between runs, so the
 * engine is compiled once for scripts that follow each other; each run gets
 * a new engine runtime, so no script sees another's state. Two scripts at
 * once have a worker each. A run that hits a limit ends its worker, and
 * the next run starts a new one.
 */
@Injectable({ providedIn: "root" })
export class ScriptSandbox {
  /** A worker whose script has ended, kept for the next one. */
  private idle: Worker | null = null;
  private readonly runs = new Map<string, Run>();

  constructor() {
    // In the app this service lives as long as the page. A unit test makes one per test: each left its worker running
    // with the engine's memory, and an engine past the hundred-and-twentieth found none ("WebAssembly.Memory(): could not allocate memory").
    inject(DestroyRef).onDestroy(() => {
      this.idle?.terminate();
      for (const run of this.runs.values()) run.worker.terminate();
    });
  }

  execute(
    script: string,
    env: Record<string, string> | ScriptVariable[],
    response?: ScriptResponseContext,
    timeoutMs: number = SCRIPT_LIMITS.timeoutMs,
    { send, ...extras }: ScriptRunExtras = {},
  ): Promise<ScriptResult> {
    if (!script?.trim()) {
      return Promise.resolve(nothing());
    }
    return new Promise<ScriptResult>((settle) => {
      const id = newId();
      const worker = this.take();
      this.runs.set(id, { worker, settle, timeoutMs, send, inFlight: 0 });
      const context: ScriptContext = {
        ...extras,
        environment: Array.isArray(env) ? env : Object.entries(env),
        ...(response && { response: scriptResponse(response) }),
      };
      worker.postMessage({ id, source: script, context, limits: { ...SCRIPT_LIMITS, timeoutMs } });
    });
  }

  /**
   * A worker for one script: the idle one, or a new one. Two scripts at
   * once (two tabs sending, a run beside a send) each have their own, so a
   * script that hits a limit, and the worker that is ended for it, takes
   * no other script with it.
   */
  private take(): Worker {
    const kept = this.idle;
    if (kept) {
      this.idle = null;
      return kept;
    }
    const worker = new Worker(new URL("./quickjs.worker", import.meta.url), { type: "module" });
    worker.addEventListener("message", ({ data }: MessageEvent<WorkerMessage>) => this.onMessage(data));
    worker.addEventListener("error", (event) =>
      this.discard(worker, event.message || "The script stopped with an error."),
    );
    return worker;
  }

  /** A worker whose script ended as it should: kept for the next script when none is kept yet, with the engine it has compiled. */
  private release(worker: Worker): void {
    if (this.idle) worker.terminate();
    else this.idle = worker;
  }

  private onMessage(message: WorkerMessage): void {
    const run = this.runs.get(message.id);
    if (!run) return;
    if (message.type === "started") {
      this.watch(message.id, run);
      return;
    }
    if (message.type === "send") {
      void this.sendFor(message.id, run, message.call, message.request);
      return;
    }
    if (message.type === "failed") {
      this.finish(message.id, nothing(message.message));
      this.discard(run.worker, "Script execution was stopped.");
      return;
    }
    this.finish(message.id, message.result);
    // After a limit the engine may be unusable: the next run gets a new worker.
    if (message.result.limit) this.discard(run.worker, "Script execution was stopped.");
    else this.release(run.worker);
  }

  /**
   * The engine stops a script at its deadline. Should the engine itself
   * hang, the page stops waiting a second later.
   */
  private watch(id: string, run: Run): void {
    clearTimeout(run.watchdog);
    run.watchdog = setTimeout(() => {
      this.finish(id, nothing(`Script timed out after ${run.timeoutMs} ms`, "timeout"));
      this.discard(run.worker, "Script execution was stopped.");
    }, run.timeoutMs + WATCHDOG_GRACE_MS);
  }

  /**
   * Makes a request a script asked for and tells the worker the answer.
   * The time it takes is not the script's: the watchdog is off until every
   * such request has ended, and starts again from the full time then.
   */
  private async sendFor(id: string, run: Run, call: number, request: ScriptSendRequest): Promise<void> {
    clearTimeout(run.watchdog);
    run.inFlight++;
    let answer: { response: ScriptResponse } | { error: { name: string; message: string } };
    try {
      if (!run.send) throw new Error("pm.sendRequest is not available here.");
      answer = { response: await run.send(request) };
    } catch (error) {
      answer = {
        error: {
          name: error instanceof Error ? error.name : "Error",
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
    // The run may have ended meanwhile, with its worker.
    if (this.runs.get(id) !== run) return;
    run.inFlight--;
    if (!run.inFlight) this.watch(id, run);
    run.worker.postMessage({ type: "sent", call, ...answer });
  }

  private finish(id: string, result: ScriptResult): void {
    const run = this.runs.get(id);
    if (!run) return;
    clearTimeout(run.watchdog);
    this.runs.delete(id);
    run.settle(result);
  }

  /** Ends `worker`. A run still waiting on it ends with `reason`; a worker has one run at most. */
  private discard(worker: Worker, reason: string): void {
    worker.terminate();
    if (this.idle === worker) this.idle = null;
    for (const [id, run] of [...this.runs]) {
      if (run.worker === worker) this.finish(id, nothing(reason));
    }
  }
}
