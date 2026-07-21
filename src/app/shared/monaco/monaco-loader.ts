/**
 * Shared Monaco loading state. All editor components import from here
 * so Monaco is initialised exactly once per session.
 */
import type * as MonacoTypes from "monaco-editor";

export type MonacoEditorModule = typeof import("monaco-editor/esm/vs/editor/editor.api");

declare const self: typeof globalThis & {
  MonacoEnvironment?: {
    getWorker?(moduleId: string, label: string): Worker;
  };
};

type WorkerFactory = () => Worker;

interface MonacoWorkerFactories {
  editor: WorkerFactory;
  json: WorkerFactory;
  css: WorkerFactory;
  html: WorkerFactory;
  typescript: WorkerFactory;
}

/**
 * Worker factories, built via Angular's own `new Worker(new URL(...))`
 * syntax (statically detected and bundled by the esbuild-based builder —
 * see `webWorkerTsConfig` in angular.json, the same mechanism
 * `script-sandbox.service.ts` already uses for its own worker) rather than
 * Vite's `?worker`-suffixed dynamic-import convention this file used to use.
 *
 * That `?worker` suffix is Vite-specific: it happened to work under
 * `ng serve` only because Angular's dev server is Vite-based, but Angular's
 * production builder (`ng build`, also esbuild but not Vite) does not
 * implement it at all — it silently imports the worker file as an ordinary
 * module with no exports, so `.default` was always `undefined` in a
 * production build. Verified directly: a production build's every worker
 * resolved `.default === undefined`, while the exact same code under
 * `ng serve` resolved real constructors — meaning Monaco's background
 * workers (JSON/CSS/HTML/TS validation and completion) had never actually
 * worked in the deployed app at all, not just under the rapid-transition
 * stress case that first surfaced it as an uncaught
 * `"... is not a constructor"` page error.
 *
 * Each `./workers/*.worker.ts` file is a thin wrapper (`import
 * "monaco-editor/esm/vs/.../*.worker.js"`) purely so Angular's builder has
 * a literal, statically-analyzable relative path to treat as a worker entry
 * point — the actual worker code is still monaco-editor's own.
 */
const workerFactories: MonacoWorkerFactories = {
  editor: () =>
    new Worker(new URL("./workers/editor.worker", import.meta.url), { type: "module" }),
  json: () =>
    new Worker(new URL("./workers/json.worker", import.meta.url), { type: "module" }),
  css: () =>
    new Worker(new URL("./workers/css.worker", import.meta.url), { type: "module" }),
  html: () =>
    new Worker(new URL("./workers/html.worker", import.meta.url), { type: "module" }),
  typescript: () =>
    new Worker(new URL("./workers/typescript.worker", import.meta.url), { type: "module" }),
};

let monacoLoader: Promise<MonacoEditorModule> | null = null;
let environmentConfigured = false;

export let loadedMonaco: MonacoEditorModule | null = null;
export let sandboxThemesDefined = false;

export function loadMonaco(): Promise<MonacoEditorModule> {
  if (!monacoLoader) {
    monacoLoader = (async () => {
      const monacoImport = import("monaco-editor/esm/vs/editor/editor.api");

      await Promise.all([
        monacoImport,
        import("monaco-editor/esm/vs/language/json/monaco.contribution"),
        import("monaco-editor/esm/vs/language/css/monaco.contribution"),
        import("monaco-editor/esm/vs/language/html/monaco.contribution"),
        import("monaco-editor/esm/vs/language/typescript/monaco.contribution"),
      ]);

      const monaco = await monacoImport;

      if (!environmentConfigured) {
        self.MonacoEnvironment = {
          getWorker: (_: string, label: string): Worker => {
            switch (label) {
              case "json":
                return workerFactories.json();
              case "css":
              case "scss":
              case "less":
                return workerFactories.css();
              case "html":
              case "handlebars":
              case "razor":
                return workerFactories.html();
              case "typescript":
              case "javascript":
                return workerFactories.typescript();
              default:
                return workerFactories.editor();
            }
          },
        };
        environmentConfigured = true;
      }

      loadedMonaco = monaco;
      return monaco;
    })();
  }
  return monacoLoader;
}

export function defineSandboxThemes(monaco: MonacoEditorModule): void {
  if (sandboxThemesDefined) {
    return;
  }
  sandboxThemesDefined = true;
  monaco.editor.defineTheme("sandbox-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "string.key.json", foreground: "a5b4fc" },
      { token: "string.value.json", foreground: "22c55e" },
      { token: "number.json", foreground: "f59e0b" },
      { token: "keyword.json", foreground: "ef4444" },
    ],
    colors: {
      "editor.background": "#141720",
      "editor.foreground": "#e6e8f0",
      "editorLineNumber.foreground": "#4c5070",
      "editorLineNumber.activeForeground": "#8a8fa8",
      "editor.selectionBackground": "#6366f130",
      "editor.lineHighlightBackground": "#1a1d2880",
      "editorCursor.foreground": "#6366f1",
      "editor.inactiveSelectionBackground": "#6366f118",
      "scrollbarSlider.background": "#ffffff20",
      "scrollbarSlider.hoverBackground": "#ffffff38",
      "scrollbarSlider.activeBackground": "#ffffff50",
    },
  });
}

export function monacoThemeName(theme: "dark" | "light"): string {
  return theme === "dark" ? "sandbox-dark" : "vs";
}

/**
 * Resolves once `host` has a non-zero rendered width, resolving immediately
 * if it already does.
 *
 * Guards against a real failure mode (Part D of
 * docs/plans/plan-specimen-modernization.md): `@defer (on viewport)`
 * triggers Monaco's mount as soon as its placeholder intersects the
 * viewport, which can happen while the host is still laid out at (or
 * transitioning through) zero width — e.g. a container mid-flex-basis
 * animation, or a tab/accordion panel whose CSS visibility just flipped but
 * hasn't been laid out yet. Monaco computes its internal layout once at
 * construction time from the host's `getBoundingClientRect()`; if that's
 * zero, `automaticLayout: true`'s own ResizeObserver doesn't reliably
 * recover from a *0 -> non-zero* transition on every browser, leaving the
 * editor stuck rendering nothing. Waiting here, before `monaco.editor.create`
 * is ever called, sidesteps the failure structurally instead of trying to
 * patch it up after the fact.
 */
export function waitForNonZeroWidth(
  host: HTMLElement,
  timeoutMs = 4000
): Promise<void> {
  if (host.getBoundingClientRect().width > 0) {
    return Promise.resolve();
  }
  if (typeof ResizeObserver === "undefined") {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) {
        return;
      }
      settled = true;
      observer.disconnect();
      clearTimeout(timer);
      resolve();
    };
    const observer = new ResizeObserver((entries) => {
      const width =
        entries[0]?.contentRect.width ?? host.getBoundingClientRect().width;
      if (width > 0) {
        finish();
      }
    });
    observer.observe(host);
    // Timeout safety net: never leave the editor permanently stuck on the
    // "Loading editor…" placeholder if the host genuinely never resolves a
    // width (e.g. it's inside a permanently-hidden ancestor) — Monaco will
    // still get created, just without the zero-width guard.
    const timer = setTimeout(finish, timeoutMs);
  });
}

// Re-exported so callers can refer to MonacoTypes without importing monaco-editor directly.
export type { MonacoTypes };
