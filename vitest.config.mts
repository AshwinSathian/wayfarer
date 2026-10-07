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
    load(id) {
      const match = WORKER_REQUEST.exec(id);
      const load = provider?.load;
      if (!match || typeof load !== "function") return undefined;
      return load.call(this, `${root}${match[1]}`);
    },
  };
}

export default defineConfig({ plugins: [builtWorkers()] });
