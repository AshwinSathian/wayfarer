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

type WorkerFactory = new () => Worker;

interface MonacoWorkerModules {
  editor: WorkerFactory;
  json: WorkerFactory;
  css: WorkerFactory;
  html: WorkerFactory;
  typescript: WorkerFactory;
}

let monacoLoader: Promise<MonacoEditorModule> | null = null;
let environmentConfigured = false;
let workerModules: MonacoWorkerModules | null = null;

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

      const [
        editorWorkerModule,
        jsonWorkerModule,
        cssWorkerModule,
        htmlWorkerModule,
        tsWorkerModule,
      ] = await Promise.all([
        import("monaco-editor/esm/vs/editor/editor.worker?worker"),
        import("monaco-editor/esm/vs/language/json/json.worker?worker"),
        import("monaco-editor/esm/vs/language/css/css.worker?worker"),
        import("monaco-editor/esm/vs/language/html/html.worker?worker"),
        import("monaco-editor/esm/vs/language/typescript/ts.worker?worker"),
      ]);

      const monaco = await monacoImport;

      if (!workerModules) {
        workerModules = {
          editor: editorWorkerModule.default as WorkerFactory,
          json: jsonWorkerModule.default as WorkerFactory,
          css: cssWorkerModule.default as WorkerFactory,
          html: htmlWorkerModule.default as WorkerFactory,
          typescript: tsWorkerModule.default as WorkerFactory,
        };
      }

      if (!environmentConfigured && workerModules) {
        self.MonacoEnvironment = {
          getWorker: (_: string, label: string): Worker => {
            switch (label) {
              case "json":
                return new workerModules!.json();
              case "css":
              case "scss":
              case "less":
                return new workerModules!.css();
              case "html":
              case "handlebars":
              case "razor":
                return new workerModules!.html();
              case "typescript":
              case "javascript":
                return new workerModules!.typescript();
              default:
                return new workerModules!.editor();
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
