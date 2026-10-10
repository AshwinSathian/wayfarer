import type { QuickJSContext, QuickJSHandle, QuickJSRuntime, QuickJSWASMModule } from "quickjs-emscripten-core";
import { VM_BOOTSTRAP } from "./vm-bootstrap";

/** What a run may use before it is stopped. */
export interface ScriptLimits {
  timeoutMs: number;
  memoryBytes: number;
  stackBytes: number;
  /** How much console output is kept, in characters and in lines. More is dropped, with one line that says so. */
  maxLogBytes: number;
  maxLogLines: number;
  /** How much a script may write as test results and variables together, in characters. More ends the script. */
  maxOutputBytes: number;
}

export const SCRIPT_LIMITS: ScriptLimits = {
  timeoutMs: 5000,
  memoryBytes: 64 * 2 ** 20,
  // About 1,500 calls deep. QuickJS counts its own stack and throws a
  // "stack overflow" a script can catch, when it gets there before the
  // browser's own stack under the engine runs out. Measured in a worker
  // (plan section 16, v1.2.5): Firefox lets QuickJS reach 256 KB, Chromium
  // 128 KB, WebKit not even that. Where the browser's stack ends first, the
  // run ends with the same message (see `runScript`). A larger number here
  // changes nothing in any of them.
  stackBytes: 256 * 2 ** 10,
  maxLogBytes: 2 ** 20,
  maxLogLines: 1000,
  // The engine's memory limit does not count what the host keeps for a
  // script: without this a loop of pm.test() calls fills the worker instead.
  maxOutputBytes: 2 ** 20,
};

/** The line that stands for the console output that was dropped. */
export const LOG_TRUNCATED = "[console output truncated]";

export interface ScriptResponse {
  code: number;
  status: string;
  /** By name; a script looks a name up as written, then in lower case. */
  headers: Record<string, string>;
  /** The body as text. `pm.response.json()` parses it inside the VM. */
  body: string;
  responseTime: number;
}

export interface ScriptContext {
  /** The variables the script may read, by name. Nothing else of the app is visible to it. */
  environment: [string, string][];
  /** Absent for a pre-request script: `pm.response` is then `null`. */
  response?: ScriptResponse;
}

export interface ScriptTestResult {
  label: string;
  passed: boolean;
  error?: string;
  source: "script";
}

export interface ScriptResult {
  logs: string[];
  /** Name and new value of every variable the script set. An empty value removes the variable. */
  envMutations: Record<string, string>;
  testResults: ScriptTestResult[];
  error?: string;
  /**
   * Set when the run was stopped by a limit. The caller must not use the
   * QuickJS module again after one: a run stopped at the stack limit may
   * have left it unusable.
   */
  limit?: "timeout" | "memory" | "stack";
}

interface RunState {
  logs: string[];
  /** Characters of console output kept so far; -1 once the cap was reached. */
  logged: number;
  /** Characters of test results and variables kept so far. */
  written: number;
  changes: Map<string, string>;
  tests: ScriptTestResult[];
  /** Timer id to the time it is due. */
  timers: Map<number, number>;
}

function limitMessage(limit: NonNullable<ScriptResult["limit"]>, limits: ScriptLimits): string {
  if (limit === "timeout") return `Script timed out after ${limits.timeoutMs} ms`;
  if (limit === "memory") return `Script exceeded memory limit (${Math.round(limits.memoryBytes / 2 ** 20)} MB)`;
  return "Script exceeded the stack limit (too much recursion)";
}

/**
 * Runs one script in a new QuickJS runtime and returns what it did.
 *
 * The VM starts with the ECMAScript built-ins and nothing of the host: no
 * `fetch`, no `self`, no timers, no module loader. This function adds `pm`,
 * `console`, `atob`, `btoa` and `setTimeout` (see `vm-bootstrap.ts`), and
 * that is all a script can reach. Only strings, numbers and booleans cross
 * in either direction.
 *
 * The QuickJS module is an argument, so the same code runs in the app's
 * worker and in Node.
 */
export async function runScript(quickjs: QuickJSWASMModule, source: string, context: ScriptContext, limits: ScriptLimits = SCRIPT_LIMITS): Promise<ScriptResult> {
  const state: RunState = { logs: [], logged: 0, written: 0, changes: new Map(), tests: [], timers: new Map() };
  const result = (error?: string, limit?: ScriptResult["limit"]): ScriptResult => ({
    logs: state.logs,
    envMutations: Object.fromEntries(state.changes),
    testResults: state.tests,
    ...(limit ? { error: limitMessage(limit, limits), limit } : error !== undefined && { error }),
  });

  const deadline = Date.now() + limits.timeoutMs;
  const runtime = quickjs.newRuntime();
  runtime.setMemoryLimit(limits.memoryBytes);
  runtime.setMaxStackSize(limits.stackBytes);
  runtime.setInterruptHandler(() => Date.now() >= deadline);
  const vm = runtime.newContext();

  let failure: Failure | undefined;
  try {
    failure = await evaluate(vm, runtime, source, context, state, deadline, limits);
  } catch (error) {
    // The browser's stack ran out under QuickJS before QuickJS's own count
    // did: a RangeError in V8 and JavaScriptCore, an InternalError in
    // SpiderMonkey. The engine is left as it is, not disposed: it would
    // abort. The caller discards the module.
    if (error instanceof RangeError || (error instanceof Error && error.name === "InternalError")) return result(undefined, "stack");
    throw error;
  }
  vm.dispose();
  runtime.dispose();
  return failure ? result(failure.message, failure.limit) : result();
}

interface Failure {
  message: string;
  limit?: ScriptResult["limit"];
}

async function evaluate(
  vm: QuickJSContext,
  runtime: QuickJSRuntime,
  source: string,
  context: ScriptContext,
  state: RunState,
  deadline: number,
  limits: ScriptLimits
): Promise<Failure | undefined> {
  /** What a script threw, as text, and whether it was a limit. Consumes the handle. */
  const failed = (error: QuickJSHandle): Failure => {
    try {
      if (Date.now() >= deadline) return { message: "", limit: "timeout" };
      const kind = vm.typeof(error);
      if (kind === "string") return { message: vm.getString(error) };
      if (kind !== "object") return { message: "Script failed." };
      const name = property(vm, error, "name");
      const message = property(vm, error, "message") ?? "Script failed.";
      if (name === "InternalError" && message === "out of memory") return { message, limit: "memory" };
      if (name === "InternalError" && message === "stack overflow") return { message, limit: "stack" };
      return { message };
    } finally {
      error.dispose();
    }
  };

  const environment = new Map(context.environment);
  const host = vm.newObject();
  const bind = (name: string, fn: (...args: QuickJSHandle[]) => QuickJSHandle | undefined) => {
    const handle = vm.newFunction(name, fn);
    vm.setProp(host, name, handle);
    handle.dispose();
  };
  const text = (handle: QuickJSHandle | undefined): string => {
    if (!handle || vm.typeof(handle) !== "string") throw new TypeError("Expected a string.");
    return vm.getString(handle);
  };
  const number = (handle: QuickJSHandle | undefined): number => {
    if (!handle || vm.typeof(handle) !== "number") throw new TypeError("Expected a number.");
    return vm.getNumber(handle);
  };

  bind("envGet", (key) => {
    const name = text(key);
    const value = state.changes.get(name) ?? environment.get(name);
    return value === undefined ? undefined : vm.newString(value);
  });
  /** Counts what a script makes the host keep. Thrown into the script, and thrown again at its next write. */
  const charge = (...written: string[]) => {
    state.written += written.reduce((sum, part) => sum + part.length, 0);
    if (state.written > limits.maxOutputBytes) throw new RangeError("Script wrote too many test results and variables.");
  };

  bind("envSet", (key, value) => {
    const [name, next] = [text(key), text(value)];
    charge(name, next);
    state.changes.set(name, next);
    return undefined;
  });
  bind("test", (label, passed, error) => {
    const ok = passed !== undefined && vm.typeof(passed) === "boolean" && vm.dump(passed) === true;
    const [name, message] = [text(label), ok ? "" : text(error)];
    charge(name, message);
    state.tests.push({ label: name, passed: ok, ...(!ok && { error: message }), source: "script" });
    return undefined;
  });
  bind("log", (line) => {
    const written = text(line);
    if (state.logged < 0) return undefined;
    const room = limits.maxLogBytes - state.logged;
    if (state.logs.length >= limits.maxLogLines || written.length > room) {
      // The last line is kept as far as there is room, and nothing after it.
      if (state.logs.length < limits.maxLogLines && room > 0) state.logs.push(written.slice(0, room));
      state.logs.push(LOG_TRUNCATED);
      state.logged = -1;
      return undefined;
    }
    state.logs.push(written);
    state.logged += written.length;
    return undefined;
  });
  bind("atob", (encoded) => vm.newString(atob(text(encoded))));
  bind("btoa", (binary) => vm.newString(btoa(text(binary))));
  bind("timer", (id, delay) => {
    state.timers.set(number(id), Date.now() + Math.max(0, number(delay)));
    return undefined;
  });

  const bootstrap = vm.evalCode(VM_BOOTSTRAP, "wayfarer.js");
  if (bootstrap.error) {
    host.dispose();
    return failed(bootstrap.error);
  }
  const response = context.response === undefined ? vm.undefined : vm.newString(JSON.stringify(context.response));
  const installed = vm.callFunction(bootstrap.value, vm.undefined, host, response);
  bootstrap.value.dispose();
  host.dispose();
  response.dispose();
  if (installed.error) return failed(installed.error);
  const fire = installed.value;

  try {
    const ran = vm.evalCode(source, "script.js");
    if (ran.error) return failed(ran.error);
    ran.value.dispose();

    // Promise reactions, then timers as they fall due, until neither is left.
    for (;;) {
      const jobs = runtime.executePendingJobs();
      if (jobs.error) return failed(jobs.error);
      if (!state.timers.size) return undefined;
      const [id, due] = [...state.timers].reduce((first, timer) => (timer[1] < first[1] ? timer : first));
      // A timer due after the deadline is never run: the script is out of time.
      if (due >= deadline) return { message: "", limit: "timeout" };
      await new Promise((resolve) => setTimeout(resolve, Math.max(0, due - Date.now())));
      state.timers.delete(id);
      const handle = vm.newNumber(id);
      const fired = vm.callFunction(fire, vm.undefined, handle);
      handle.dispose();
      if (fired.error) return failed(fired.error);
      fired.value.dispose();
    }
  } finally {
    fire.dispose();
  }
}

/** A string property of something a script threw, or undefined. */
function property(vm: QuickJSContext, object: QuickJSHandle, name: string): string | undefined {
  const handle = vm.getProp(object, name);
  try {
    return vm.typeof(handle) === "string" ? vm.getString(handle) : undefined;
  } finally {
    handle.dispose();
  }
}
