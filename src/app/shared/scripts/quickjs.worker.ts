/// <reference lib="webworker" />

/**
 * Runs pre-request and post-response scripts in QuickJS, a JavaScript engine
 * compiled to WebAssembly (P3.1).
 *
 * A script is text handed to that engine. It is never evaluated by the
 * browser, so the page's Content-Security-Policy needs no `'unsafe-eval'`,
 * and it never sees this worker's globals: the engine's own global object
 * holds only what `runScript` (`@wayfarer/core`) puts there. This file loads
 * the engine once, on the first run, and passes messages.
 */

import loadEngine from "@jitl/quickjs-wasmfile-release-sync/emscripten-module";
import { QuickJSFFI } from "@jitl/quickjs-wasmfile-release-sync/ffi";
import { newQuickJSWASMModuleFromVariant, newVariant, type QuickJSSyncVariant, type QuickJSWASMModule } from "quickjs-emscripten-core";
import { loadLibrary } from "@wayfarer/core/library-loader";
import { loadLibraries, runScript, scriptMemory, type ScriptContext, type ScriptLimits, type ScriptResponse, type ScriptSendRequest } from "@wayfarer/core";
// By its path, not by the package's "./wasm" entry: the development and
// unit-test servers hand an import that names a package to Vite, which tries
// to run a .wasm file as a module. A path is built with the worker, and the
// builder's file loader (angular.json) turns it into the file's address.
import wasmLocation from "../../../../node_modules/@jitl/quickjs-wasmfile-release-sync/dist/emscripten-module.wasm";

interface RunMessage {
  id: string;
  source: string;
  context: ScriptContext;
  limits: ScriptLimits;
}

/** The page's answer to a request it made for a script (`pm.sendRequest`). */
interface SentMessage {
  type: "sent";
  call: number;
  response?: ScriptResponse;
  error?: { name: string; message: string };
}

// The package's own variant object imports these two files on demand. Here
// they are part of the worker, which is itself loaded on demand: one file,
// one request.
const variant: QuickJSSyncVariant = {
  type: "sync",
  importFFI: () => Promise.resolve(QuickJSFFI),
  importModuleLoader: () => Promise.resolve(loadEngine),
};

let engine: Promise<QuickJSWASMModule> | undefined;
/** The text of each library a script has asked for with `require`, fetched once. */
const libraries = new Map<string, string>();
/** Requests the page is making for the script that is running, by the number the page answers with. */
const sent = new Map<number, { resolve: (response: ScriptResponse) => void; reject: (error: Error) => void }>();
let nextCall = 1;

/**
 * `pm.sendRequest`: this worker makes no request. It asks the page, which
 * sends it as it sends the user's own (`RequestExecutor`), and waits.
 */
function askThePage(id: string, request: ScriptSendRequest): Promise<ScriptResponse> {
  return new Promise((resolve, reject) => {
    const call = nextCall++;
    sent.set(call, { resolve, reject });
    postMessage({ id, type: "send", call, request });
  });
}

function answered({ call, response, error }: SentMessage): void {
  const waiting = sent.get(call);
  sent.delete(call);
  if (!waiting) return;
  if (response) waiting.resolve(response);
  else waiting.reject(Object.assign(new Error(error?.message ?? "The request failed."), { name: error?.name ?? "Error" }));
}

async function run({ id, source, context, limits }: RunMessage): Promise<void> {
  try {
    engine ??= newQuickJSWASMModuleFromVariant(newVariant(variant, { wasmLocation: new URL(wasmLocation, import.meta.url).href, wasmMemory: new WebAssembly.Memory(scriptMemory()) }));
    const quickjs = await engine;
    const required = await loadLibraries(source, loadLibrary, libraries);
    // The page's own clock for this run starts here, not at the downloads.
    postMessage({ id, type: "started" });
    postMessage({ id, type: "result", result: await runScript(quickjs, source, context, limits, { libraries: required, send: (request) => askThePage(id, request) }) });
  } catch (error) {
    postMessage({ id, type: "failed", message: error instanceof Error ? error.message : String(error) });
  }
}

// No origin check: a dedicated worker hears only the page that created it,
// and a message to one carries no origin to compare (CodeQL's
// js/missing-origin-check is about windows and frames).
addEventListener("message", ({ data }: MessageEvent<RunMessage | SentMessage>) => {
  if ("type" in data) answered(data);
  else void run(data);
});
