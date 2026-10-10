import type { QuickJSContext, QuickJSHandle, QuickJSRuntime, QuickJSWASMModule } from "quickjs-emscripten-core";
import { isHttpMethod } from "../model/request";
import type { VariableChange } from "../model/variables";
import { VARIABLE_SCOPES, VariableResolver, type ScopeStack, type VariableScope } from "../variables/resolver";
import { VM_LIBRARIES } from "./libraries";
import { VM_BOOTSTRAP } from "./vm-bootstrap";
import { VM_ENCODINGS, isVmHash, vmDecode, vmEncode, vmHash, vmHmac, vmRandom, type VmEncoding, type VmHash } from "./vm-crypto";

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
  /** How many requests a script may make with `pm.sendRequest`. One more is answered with an error. */
  maxSendRequests: number;
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
  maxSendRequests: 10,
};

const WASM_PAGE = 65536;
/** What the engine's module asks for at the start: 16 MB. */
const ENGINE_INITIAL_PAGES = 256;

/**
 * The size of the memory the engine must be loaded with: the caller makes
 * `new WebAssembly.Memory(scriptMemory())` and gives it to `newVariant` as
 * `wasmMemory`. It cannot grow past the memory limit, and that is what
 * makes the limit hold (F66). (A description, not the object: this package
 * has neither the DOM's nor a worker's types, where `WebAssembly` is.)
 *
 * QuickJS's own `setMemoryLimit` does not: built for WebAssembly it counts 8
 * bytes for an allocation of any size, so it refuses one allocation larger
 * than the limit and nothing else. Under it a script held 1,840 MB of typed
 * arrays, 8 MB at a time, and the engine's memory grew to its 2 GB maximum.
 * With this memory, growth past the limit fails in the browser, the engine's
 * allocator has nothing to give, and QuickJS throws "out of memory".
 *
 * The limit is on the whole engine, its own few hundred kilobytes included,
 * and on every runtime in it: one script runs at a time.
 */
export function scriptMemory(limits: ScriptLimits = SCRIPT_LIMITS): { initial: number; maximum: number } {
  return { initial: ENGINE_INITIAL_PAGES, maximum: Math.max(ENGINE_INITIAL_PAGES, Math.floor(limits.memoryBytes / WASM_PAGE)) };
}

/** The line that stands for the console output that was dropped. */
export const LOG_TRUNCATED = "[console output truncated]";

export interface ScriptResponse {
  code: number;
  status: string;
  /** By name. A script looks a name up without regard to case. */
  headers: Record<string, string>;
  /** The body as text. `pm.response.json()` parses it inside the VM. */
  body: string;
  responseTime: number;
  /** The size of the body in bytes. */
  responseSize: number;
}

/** The body of a request as a script sees it. Only text and form fields can be read and changed; of a file or a multipart form a script sees the mode. */
export type ScriptBody = { mode: "raw"; raw: string } | { mode: "urlencoded"; urlencoded: [string, string][] } | { mode: "none" | "multipart" | "binary" };

/** The request as a script sees it in `pm.request`, and as a pre-request script left it. */
export interface ScriptRequest {
  method: string;
  /** Text: it may hold `{{variables}}`. */
  url: string;
  headers: [string, string][];
  body: ScriptBody;
}

/** A request a script asks the host to make with `pm.sendRequest`, its variables already replaced. */
export interface ScriptSendRequest {
  method: string;
  url: string;
  headers: [string, string][];
  body?: string;
}

/** The scopes a script can write to and the app stores. */
export type ScriptScope = "environment" | "collection" | "global";

export interface ScriptContext {
  /** The variables of the active environment, by name. Nothing else of the app is visible to a script but what this context holds. */
  environment: [string, string][];
  environmentName?: string;
  /** The variables of the folders the request is in, the nearest folder's value for a name. A script reads them through `pm.variables`; Postman has no folder scope to write to. */
  folder?: [string, string][];
  collection?: [string, string][];
  globals?: [string, string][];
  /** Absent for a pre-request script: `pm.response` is then `null`. */
  response?: ScriptResponse;
  /** The request being sent. Absent: `pm.request` is `null`. */
  request?: ScriptRequest;
  /** Which script this is, and of which request. A script without it is a post-response script of no request. */
  info?: { eventName: "prerequest" | "test"; requestName: string; requestId: string };
}

/** What the host of a run provides besides the context. */
export interface ScriptServices {
  /** The text of each library the script may `require`, by name (`loadLibraries`). */
  libraries?: ReadonlyMap<string, string>;
  /** Makes a request for `pm.sendRequest`. Absent: a script that calls it is told it cannot. A rejection reaches the script as its error. */
  send?: (request: ScriptSendRequest) => Promise<ScriptResponse>;
}

export interface ScriptTestResult {
  label: string;
  passed: boolean;
  error?: string;
  source: "script";
}

export interface ScriptResult {
  logs: string[];
  /** What the script set and removed, per scope, in the order it first named each variable. */
  changes: Record<ScriptScope, VariableChange[]>;
  testResults: ScriptTestResult[];
  error?: string;
  /**
   * Set when the run was stopped by a limit. The caller must not use the
   * QuickJS module again after one: a run stopped at the stack limit may
   * have left it unusable.
   */
  limit?: "timeout" | "memory" | "stack";
  /** The request as a pre-request script left it. Absent when the script ended in an error before it could be read. */
  request?: ScriptRequest;
  /** What the script gave `pm.execution.setNextRequest`: a name, or null to stop a run. It has an effect in a collection run only. */
  nextRequest?: string | null;
  /** The script called `pm.execution.skipRequest()`. It has an effect in a collection run only. */
  skipRequest?: true;
}

/** A result with nothing in it. */
export function emptyChanges(): ScriptResult["changes"] {
  return { environment: [], collection: [], global: [] };
}

type Scope = VariableScope;

interface RunState {
  /** Every scope as the script sees it now, nearest first when a name is looked up in all of them. */
  values: Record<Scope, Map<string, string>>;
  /** What was changed in each scope: a value, or null for a removal. */
  changes: Record<Scope, Map<string, string | null>>;
  request?: ScriptRequest;
  nextRequest?: string | null;
  skipRequest?: true;
  /** How many requests the script has asked for. */
  sends: number;
  /** Requests the host is making for the script right now. */
  inFlight: number;
  /** Answers that have arrived and the script has not been given yet: the call, whether it succeeded, and the answer as JSON. */
  answers: [call: number, ok: boolean, text: string][];
  /** Ends the wait of the event loop when an answer arrives. */
  wake?: () => void;
  logs: string[];
  /** Characters of console output kept so far; -1 once the cap was reached. */
  logged: number;
  /** Characters of test results and variables kept so far. */
  written: number;
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
 * `console`, `atob`, `btoa`, `setTimeout` and `require` (see
 * `vm-bootstrap.ts`), and that is all a script can reach. Only strings,
 * numbers and booleans cross in either direction.
 *
 * `libraries` holds the text of the libraries the script may `require`, by
 * name (`loadLibraries`): a library is more script, run by the same engine
 * under the same limits.
 *
 * The QuickJS module is an argument, so the same code runs in the app's
 * worker and in Node. Whoever loads it gives it a memory of `scriptMemory()`:
 * the memory limit is the size that memory may reach.
 */
export async function runScript(
  quickjs: QuickJSWASMModule,
  source: string,
  context: ScriptContext,
  limits: ScriptLimits = SCRIPT_LIMITS,
  services: ScriptServices = {}
): Promise<ScriptResult> {
  const scope = (rows: [string, string][] = []) => new Map(rows);
  const state: RunState = {
    values: { local: scope(), data: scope(), environment: scope(context.environment), folder: scope(context.folder), collection: scope(context.collection), global: scope(context.globals) },
    changes: { local: new Map(), data: new Map(), environment: new Map(), folder: new Map(), collection: new Map(), global: new Map() },
    sends: 0,
    inFlight: 0,
    answers: [],
    logs: [],
    logged: 0,
    written: 0,
    tests: [],
    timers: new Map(),
  };
  const changed = (name: ScriptScope): VariableChange[] => [...state.changes[name]].map(([key, value]) => ({ key, value }));
  const result = (error?: string, limit?: ScriptResult["limit"]): ScriptResult => ({
    logs: state.logs,
    changes: { environment: changed("environment"), collection: changed("collection"), global: changed("global") },
    testResults: state.tests,
    ...(state.request && { request: state.request }),
    ...(state.nextRequest !== undefined && { nextRequest: state.nextRequest }),
    ...(state.skipRequest && { skipRequest: true }),
    ...(limit ? { error: limitMessage(limit, limits), limit } : error !== undefined && { error }),
  });

  // The time a script waits for the answer to pm.sendRequest is not its own: the deadline moves by it.
  const deadline = { at: Date.now() + limits.timeoutMs };
  const runtime = quickjs.newRuntime();
  runtime.setMemoryLimit(limits.memoryBytes);
  runtime.setMaxStackSize(limits.stackBytes);
  runtime.setInterruptHandler(() => Date.now() >= deadline.at);
  const vm = runtime.newContext();

  let failure: Failure | undefined;
  try {
    failure = await evaluate(vm, runtime, source, context, state, deadline, limits, services);
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
  deadline: { at: number },
  limits: ScriptLimits,
  services: ScriptServices
): Promise<Failure | undefined> {
  /** What a script threw, as text, and whether it was a limit. Consumes the handle. */
  const failed = (error: QuickJSHandle): Failure => {
    try {
      if (Date.now() >= deadline.at) return { message: "", limit: "timeout" };
      const kind = vm.typeof(error);
      if (kind === "string") return { message: vm.getString(error) };
      if (kind !== "object") return { message: "Script failed." };
      // With no memory left QuickJS cannot make the error it wants to throw, and throws null.
      // Asked without `vm.dump`, which allocates in the engine and has nothing to allocate with.
      if (vm.sameValue(error, vm.null)) return { message: "", limit: "memory" };
      const name = property(vm, error, "name");
      const message = property(vm, error, "message") ?? "Script failed.";
      if (name === "InternalError" && message === "out of memory") return { message, limit: "memory" };
      if (name === "InternalError" && message === "stack overflow") return { message, limit: "stack" };
      return { message };
    } finally {
      error.dispose();
    }
  };

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
  const flag = (handle: QuickJSHandle | undefined): boolean => {
    if (!handle || vm.typeof(handle) !== "boolean") throw new TypeError("Expected a boolean.");
    return vm.sameValue(handle, vm.true);
  };
  /** Counts what a script makes the host keep. Thrown into the script, and thrown again at its next write. */
  const charge = (...written: string[]) => {
    state.written += written.reduce((sum, part) => sum + part.length, 0);
    if (state.written > limits.maxOutputBytes) throw new RangeError("Script wrote too many test results and variables.");
  };

  const scopeOf = (handle: QuickJSHandle | undefined): Scope => {
    const name = text(handle);
    if (!Object.hasOwn(state.values, name)) throw new TypeError("Expected a variable scope.");
    return name as Scope;
  };
  /** The value of a name: in one scope, or in the nearest that has it ("any"). */
  const lookUp = (where: QuickJSHandle | undefined, key: string): string | undefined => {
    if (where && vm.typeof(where) === "string" && vm.getString(where) === "any") {
      for (const name of VARIABLE_ORDER) {
        const value = state.values[name].get(key);
        if (value !== undefined) return value;
      }
      return undefined;
    }
    return state.values[scopeOf(where)].get(key);
  };
  bind("varGet", (where, key) => {
    const value = lookUp(where, text(key));
    return value === undefined ? undefined : vm.newString(value);
  });
  bind("varHas", (where, key) => (lookUp(where, text(key)) === undefined ? vm.false : vm.true));
  bind("varAll", (where) => {
    const entries = where && vm.typeof(where) === "string" && vm.getString(where) === "any" ? [...VARIABLE_ORDER].reverse().flatMap((name) => [...state.values[name]]) : [...state.values[scopeOf(where)]];
    return vm.newString(JSON.stringify(entries));
  });
  bind("varSet", (where, key, value) => {
    const [scope, name, next] = [scopeOf(where), text(key), text(value)];
    charge(name, next);
    state.values[scope].set(name, next);
    state.changes[scope].set(name, next);
    return undefined;
  });
  bind("varUnset", (where, key) => {
    const [scope, name] = [scopeOf(where), text(key)];
    charge(name);
    state.values[scope].delete(name);
    state.changes[scope].set(name, null);
    return undefined;
  });
  bind("varClear", (where) => {
    const scope = scopeOf(where);
    for (const name of state.values[scope].keys()) {
      charge(name);
      state.changes[scope].set(name, null);
    }
    state.values[scope].clear();
    return undefined;
  });
  // `{{names}}` replaced from the scopes as they are now. A vault secret's reference stays as written: a script is never given a secret.
  bind("replaceIn", (template) => {
    const rows = (name: Scope) => [...state.values[name]].map(([key, value]) => ({ key, value, enabled: true }));
    const stack: ScopeStack = Object.fromEntries(VARIABLE_ORDER.map((name) => [name, rows(name)]));
    return vm.newString(new VariableResolver(stack).resolve(text(template)));
  });
  bind("test", (label, passed, error) => {
    const ok = flag(passed);
    const [name, message] = [text(label), ok ? "" : text(error)];
    charge(name, message);
    state.tests.push({ label: name, passed: ok, ...(!ok && { error: message }), source: "script" });
    return undefined;
  });
  const logLine = (written: string): void => {
    if (state.logged < 0) return;
    const room = limits.maxLogBytes - state.logged;
    if (state.logs.length >= limits.maxLogLines || written.length > room) {
      // The last line is kept as far as there is room, and nothing after it.
      if (state.logs.length < limits.maxLogLines && room > 0) state.logs.push(written.slice(0, room));
      state.logs.push(LOG_TRUNCATED);
      state.logged = -1;
      return;
    }
    state.logs.push(written);
    state.logged += written.length;
  };
  bind("log", (line) => {
    logLine(text(line));
    return undefined;
  });
  bind("atob", (encoded) => vm.newString(atob(text(encoded))));
  bind("btoa", (binary) => vm.newString(btoa(text(binary))));
  // The text of a library, which the VM's `require` evaluates; undefined for a name that is no library.
  bind("library", (name) => {
    const id = text(name);
    const source = services.libraries?.get(id);
    if (source !== undefined) return vm.newString(source);
    if ((VM_LIBRARIES as readonly string[]).includes(id)) throw new Error(`require('${id}'): write the module's name out in the script, as require('${id}')`);
    return undefined;
  });
  const hash = (handle: QuickJSHandle | undefined): VmHash => {
    const name = text(handle);
    if (!isVmHash(name)) throw new TypeError("Expected MD5, SHA1 or SHA256.");
    return name;
  };
  const encoding = (handle: QuickJSHandle | undefined): VmEncoding => {
    const name = text(handle);
    const found = VM_ENCODINGS.find((known) => known === name);
    if (!found) throw new TypeError("Expected utf8, hex or base64.");
    return found;
  };
  bind("hash", (name, format, payload) => vm.newString(vmHash(hash(name), text(format), text(payload))));
  bind("hmac", (name, keyFormat, key, format, payload) => vm.newString(vmHmac(hash(name), text(keyFormat), text(key), text(format), text(payload))));
  bind("encode", (name, value) => vm.newString(vmEncode(encoding(name), text(value))));
  bind("decode", (name, words) => vm.newString(vmDecode(encoding(name), text(words))));
  bind("random", (count) => vm.newString(vmRandom(number(count))));
  bind("timer", (id, delay) => {
    state.timers.set(number(id), Date.now() + Math.max(0, number(delay)));
    return undefined;
  });
  bind("next", (name, none) => {
    state.nextRequest = flag(none) ? null : text(name);
    return undefined;
  });
  bind("skip", () => {
    state.skipRequest = true;
    return undefined;
  });
  bind("requestOut", (json) => {
    state.request = scriptRequest(text(json));
    return undefined;
  });

  /** An answer for the script: now, when the host refuses, or when the request has ended. */
  const answer = (call: number, ok: boolean, value: unknown) => {
    state.answers.push([call, ok, JSON.stringify(value)]);
    state.wake?.();
  };
  const refused = (error: unknown) => ({ name: error instanceof Error ? error.name : "Error", message: error instanceof Error ? error.message : String(error) });
  bind("sendFailed", (call, name, message) => {
    answer(number(call), false, { name: text(name), message: text(message) });
    return undefined;
  });
  bind("send", (call, json) => {
    const [id, body] = [number(call), text(json)];
    state.sends++;
    if (state.sends > limits.maxSendRequests) {
      answer(id, false, { name: "Error", message: `pm.sendRequest: a script may make ${limits.maxSendRequests} requests, and this is one more.` });
      return undefined;
    }
    const send = services.send;
    if (!send) {
      answer(id, false, { name: "Error", message: "pm.sendRequest is not available here." });
      return undefined;
    }
    let request: ScriptSendRequest;
    try {
      request = sendRequest(body);
    } catch (error) {
      answer(id, false, refused(error));
      return undefined;
    }
    state.inFlight++;
    const line = (outcome: string) => logLine(`[pm.sendRequest] ${request.method} ${request.url} → ${outcome}`);
    send(request).then(
      (response) => {
        state.inFlight--;
        line(String(response.code));
        answer(id, true, response);
      },
      (error: unknown) => {
        state.inFlight--;
        line(refused(error).message);
        answer(id, false, refused(error));
      }
    );
    return undefined;
  });

  const bootstrap = vm.evalCode(VM_BOOTSTRAP, "wayfarer.js");
  if (bootstrap.error) {
    host.dispose();
    return failed(bootstrap.error);
  }
  const given = vm.newString(
    JSON.stringify({
      response: context.response,
      request: context.request,
      info: context.info ?? { eventName: "test", requestName: "", requestId: "" },
      environmentName: context.environmentName ?? "",
    })
  );
  const installed = vm.callFunction(bootstrap.value, vm.undefined, host, given);
  bootstrap.value.dispose();
  host.dispose();
  given.dispose();
  if (installed.error) return failed(installed.error);
  const tellVm = installed.value;
  /** Tells the code in the VM that something happened. Undefined, or what it threw. */
  const tell = (what: string, id = 0, ok = false, value = ""): Failure | undefined => {
    const args = [vm.newString(what), vm.newNumber(id), ok ? vm.true : vm.false, vm.newString(value)];
    const told = vm.callFunction(tellVm, vm.undefined, ...args);
    args.forEach((arg) => arg.dispose());
    if (told.error) return failed(told.error);
    told.value.dispose();
    return undefined;
  };
  const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, Math.max(0, ms)));

  try {
    const ran = vm.evalCode(source, "script.js");
    if (ran.error) return failed(ran.error);
    ran.value.dispose();

    // Promise reactions, then answers and timers as they come, until nothing is left to wait for.
    for (;;) {
      const jobs = runtime.executePendingJobs();
      if (jobs.error) return failed(jobs.error);
      // A promise reaction that was stopped at the deadline rejects its own promise and nothing more: no error comes out of the engine (F68).
      if (Date.now() >= deadline.at) return { message: "", limit: "timeout" };
      const arrived = state.answers.shift();
      if (arrived) {
        const failure = tell("sent", ...arrived);
        if (failure) return failure;
        continue;
      }
      const timer = state.timers.size ? [...state.timers].reduce((first, next) => (next[1] < first[1] ? next : first)) : undefined;
      if (!timer && !state.inFlight) break;
      if (state.inFlight) {
        // Waiting for the host: this time is the network's, not the script's.
        const started = Date.now();
        const woken = new Promise<void>((resolve) => (state.wake = resolve));
        await (timer ? Promise.race([woken, sleep(timer[1] - started)]) : woken);
        state.wake = undefined;
        deadline.at += Date.now() - started;
        if (state.answers.length || !timer || timer[1] > Date.now()) continue;
      } else {
        // A timer due after the deadline is never run: the script is out of time.
        if (timer && timer[1] >= deadline.at) return { message: "", limit: "timeout" };
        await sleep((timer?.[1] ?? 0) - Date.now());
      }
      if (timer) {
        state.timers.delete(timer[0]);
        const failure = tell("timer", timer[0]);
        if (failure) return failure;
      }
    }
    return tell("end");
  } finally {
    tellVm.dispose();
  }
}

/** Nearest first. */
const VARIABLE_ORDER = VARIABLE_SCOPES;

const isPairs = (value: unknown): value is [string, string][] =>
  Array.isArray(value) && value.every((pair) => Array.isArray(pair) && pair.length === 2 && typeof pair[0] === "string" && typeof pair[1] === "string");

/** A request a script wrote out as JSON, checked field by field: the text is the script's. */
function parsed(json: string): Record<string, unknown> {
  const value: unknown = JSON.parse(json);
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Expected a request.");
  const request = value as Record<string, unknown>;
  if (typeof request["method"] !== "string" || !isHttpMethod(request["method"])) throw new TypeError("The request's method is not an HTTP method.");
  if (typeof request["url"] !== "string" || !request["url"].trim()) throw new TypeError("The request has no address.");
  if (!isPairs(request["headers"])) throw new TypeError("The request's headers are not a list of names and values.");
  return request;
}

function sendRequest(json: string): ScriptSendRequest {
  const request = parsed(json);
  const body = request["body"];
  if (body !== undefined && typeof body !== "string") throw new TypeError("The request's body is not text.");
  return { method: request["method"] as string, url: request["url"] as string, headers: request["headers"] as [string, string][], ...(body !== undefined && { body }) };
}

function scriptRequest(json: string): ScriptRequest {
  const request = parsed(json);
  const body = request["body"] as { mode?: unknown; raw?: unknown; urlencoded?: unknown } | null;
  const base = { method: request["method"] as string, url: request["url"] as string, headers: request["headers"] as [string, string][] };
  if (body?.mode === "raw" && typeof body.raw === "string") return { ...base, body: { mode: "raw", raw: body.raw } };
  if (body?.mode === "urlencoded" && isPairs(body.urlencoded)) return { ...base, body: { mode: "urlencoded", urlencoded: body.urlencoded } };
  if (body?.mode === "none" || body?.mode === "multipart" || body?.mode === "binary") return { ...base, body: { mode: body.mode } };
  throw new TypeError("The request's body is not one a script can set.");
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
