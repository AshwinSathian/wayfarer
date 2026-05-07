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

// Re-exported so callers can refer to MonacoTypes without importing monaco-editor directly.
export type { MonacoTypes };
