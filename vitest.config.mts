import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";

// Loaded by angular.json's "test" target ("runnerConfig").
//
// The unit-test builder bundles each spec and serves the result from memory,
// with web workers emitted at the workspace root as worker-<hash>.js. Vite
// then rewrites `new Worker(new URL("worker-<hash>.js", import.meta.url))`
// to `<spec directory>/worker-<hash>.js?worker_file&type=module`, and the
// builder's in-memory provider knows neither that directory nor the query,
// so the script sandbox worker 404s (@angular/build 21 and 22). This plugin
// maps such requests back to the root file and asks the builder's provider
// for its contents.
const root = fileURLToPath(new URL(".", import.meta.url));
const WORKER_REQUEST = /(?:^|\/)(worker-[A-Z0-9]+\.js)\?worker_file\b/;

// Vitest's browser mode rewrites every `import()` to go through a helper it
// installs on the page. A worker has no such helper, so a worker that
// imports on demand (the QuickJS engine does) would fail here and only here.
const DYNAMIC_IMPORT_IN_A_WORKER = "globalThis.__vitest_browser_runner__ ??= { wrapDynamicImport: (load) => load() };\n";

function builtWorkers(): Plugin {
  let provider: Plugin | undefined;
  return {
    name: "wayfarer:built-workers",
    enforce: "pre",
    configResolved(config) {
      provider = config.plugins.find((plugin) => plugin.name === "angular:test-in-memory-provider");
    },
    resolveId(id) {
      const match = WORKER_REQUEST.exec(id);
      return match ? `${root}${match[1]}?worker_file` : undefined;
    },
    async load(id) {
      const match = WORKER_REQUEST.exec(id);
      const load = provider?.load;
      if (!match || typeof load !== "function") return undefined;
      const built: unknown = await load.call(this, `${root}${match[1]}`);
      const code = typeof built === "string" ? built : (built as { code?: unknown } | null)?.code;
      return typeof code === "string" ? { code: `${DYNAMIC_IMPORT_IN_A_WORKER}${code}`, map: null } : undefined;
    },
  };
}

// The QuickJS worker imports the engine's .wasm file for its address, which
// the application builder provides (`loader` in angular.json). Here npm
// packages are served by Vite, which would instead try to run the file as a
// WebAssembly module with imports. This gives the worker the address.
const QUICKJS_WASM = "@jitl/quickjs-wasmfile-release-sync/wasm";

function quickjsWasmAddress(): Plugin {
  return {
    name: "wayfarer:quickjs-wasm",
    enforce: "pre",
    resolveId: (id) => (id === QUICKJS_WASM ? `\0${QUICKJS_WASM}` : undefined),
    load: (id) =>
      id === `\0${QUICKJS_WASM}`
        ? 'export default "/node_modules/@jitl/quickjs-wasmfile-release-sync/dist/emscripten-module.wasm";'
        : undefined,
  };
}

export default defineConfig({ plugins: [builtWorkers(), quickjsWasmAddress()] });
