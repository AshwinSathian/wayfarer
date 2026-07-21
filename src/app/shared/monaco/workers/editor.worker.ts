/// <reference lib="webworker" />
/**
 * Thin wrapper so Angular's esbuild builder can statically detect and
 * bundle this as a worker entry point via `new Worker(new URL(...))` (see
 * `monaco-loader.ts`). Monaco's own worker files are plain scripts meant to
 * run as a worker's global script — they aren't meant to be `import()`ed as
 * an ordinary ES module themselves, only referenced this way.
 */
import "monaco-editor/esm/vs/editor/editor.worker.js";
