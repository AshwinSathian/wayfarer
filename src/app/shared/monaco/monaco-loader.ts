import { recordDiagnostic } from "../../services/diagnostics";
/**
 * Shared Monaco loading state. All editor components import from here
 * so Monaco is initialised exactly once per session.
 */

export type MonacoEditorModule = typeof import("monaco-editor/editor");

declare const self: typeof globalThis & {
  MonacoEnvironment?: {
    getWorker?(moduleId: string, label: string): Worker;
  };
};

type WorkerFactory = () => Worker;

interface MonacoWorkerFactories {
  editor: WorkerFactory;
  json: WorkerFactory;
  typescript: WorkerFactory;
}

/**
 * Worker factories, built via Angular's own `new Worker(new URL(...))`
 * syntax (statically detected and bundled by the esbuild-based builder —
 * see `webWorkerTsConfig` in angular.json, the same mechanism
 * `script-sandbox.ts` already uses for its own worker) rather than
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
 * workers (JSON and TS validation and completion) had never actually
 * worked in the deployed app at all, not just under the rapid-transition
 * stress case that first surfaced it as an uncaught
 * `"... is not a constructor"` page error.
 *
 * Each `./workers/*.worker.ts` file is a thin wrapper (`import
 * "monaco-editor/.../*.worker.js"`) purely so Angular's builder has
 * a literal, statically-analyzable relative path to treat as a worker entry
 * point — the actual worker code is still monaco-editor's own.
 */
const workerFactories: MonacoWorkerFactories = {
  editor: () =>
    new Worker(new URL("./workers/editor.worker", import.meta.url), { type: "module" }),
  json: () =>
    new Worker(new URL("./workers/json.worker", import.meta.url), { type: "module" }),
  typescript: () =>
    new Worker(new URL("./workers/typescript.worker", import.meta.url), { type: "module" }),
};

let monacoLoader: Promise<MonacoEditorModule> | null = null;
let environmentConfigured = false;

export let loadedMonaco: MonacoEditorModule | null = null;
/** Diagnostics settings of the JSON language service; set once Monaco has loaded. */
export let jsonDefaults: typeof import("monaco-editor/languages/features/json/register").jsonDefaults | null = null;
let sandboxThemesDefined = false;

/**
 * Monaco's stylesheet (390 kB) is its own file, `monaco.css` (see "styles" in
 * angular.json), fetched with the editor instead of on first load. The
 * builder emits the CSS that Monaco's modules import but never loads it.
 */
function loadMonacoStyles(): Promise<void> {
  return new Promise((resolve) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "monaco.css";
    link.onload = () => resolve();
    link.onerror = () => {
      // The editor still works, unstyled; say so instead of never mounting it.
      recordDiagnostic(new Error("monaco.css failed to load"), "monaco: stylesheet");
      resolve();
    };
    document.head.append(link);
  });
}

export function loadMonaco(): Promise<MonacoEditorModule> {
  if (!monacoLoader) {
    monacoLoader = (async () => {
      // Only what the editors use: the core, the JSON service (JSON
      // editor), the TypeScript service plus JavaScript grammar (script
      // editor), and the XML and HTML grammars (raw bodies; no service, no worker).
      const [monaco, json] = await Promise.all([
        import("monaco-editor/editor"),
        import("monaco-editor/languages/features/json/register"),
        import("monaco-editor/languages/features/typescript/register"),
        import("monaco-editor/languages/definitions/javascript/register"),
        import("monaco-editor/languages/definitions/xml/register"),
        import("monaco-editor/languages/definitions/html/register"),
        loadMonacoStyles(),
      ]);
      jsonDefaults = json.jsonDefaults;

      if (!environmentConfigured) {
        self.MonacoEnvironment = {
          getWorker: (_: string, label: string): Worker => {
            switch (label) {
              case "json":
                return workerFactories.json();
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
 * Guards against a real failure mode: `@defer (on viewport)`
 * triggers Monaco's mount as soon as its placeholder intersects the
 * viewport, which can happen while the host is still laid out at (or
 * transitioning through) zero width, e.g. a container mid-flex-basis
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
