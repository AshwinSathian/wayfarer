import { TOKEN_COLOURS } from "../../../design-system/tokens";
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
  editor: () => new Worker(new URL("./workers/editor.worker", import.meta.url), { type: "module" }),
  json: () => new Worker(new URL("./workers/json.worker", import.meta.url), { type: "module" }),
  typescript: () => new Worker(new URL("./workers/typescript.worker", import.meta.url), { type: "module" }),
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
      // The core, the JSON service (JSON editor), the TypeScript service plus
      // JavaScript grammar (script editor), the XML and HTML grammars (raw
      // bodies and responses; no service, no worker), and every editor feature.
      //
      // Every feature, because Monaco brings them all anyway: a language
      // service's worker manager imports each contribution, when a model of
      // that language first needs it. That is after the first editor exists,
      // and a service registered then is never added, so a contribution that
      // asks for its own service threw "depends on UNKNOWN service" on a timer
      // (F71: code lens first, inlay hints after it). Registered here, before
      // the first editor, each finds its service. Find (Ctrl or Cmd+F, the
      // response viewer's search) is one of them.
      const [monaco, json] = await Promise.all([
        import("monaco-editor/editor"),
        import("monaco-editor/languages/features/json/register"),
        import("monaco-editor/languages/features/typescript/register"),
        import("monaco-editor/languages/definitions/javascript/register"),
        import("monaco-editor/languages/definitions/xml/register"),
        import("monaco-editor/languages/definitions/html/register"),
        // GraphQL's grammar (P5.5). Its completion and validation are the app's own (`graphql-tools.ts`), fetched with a schema.
        import("monaco-editor/languages/definitions/graphql/register"),
        import("monaco-editor/features/register.all"),
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

      // The app's monospace is measured once it has loaded; an editor made before then would keep its fallback's widths.
      void document.fonts.ready.then(() => monaco.editor.remeasureFonts());
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
  // Monaco cannot read CSS variables: its colours are the tokens' (packages/tokens), as hex.
  for (const theme of ["dark", "light"] as const) {
    const t = TOKEN_COLOURS[theme];
    const bare = (hex: string) => hex.slice(1, 7);
    monaco.editor.defineTheme(monacoThemeName(theme), {
      base: theme === "dark" ? "vs-dark" : "vs",
      inherit: true,
      rules: [
        { token: "string.key.json", foreground: bare(t["method-put-text"]) },
        { token: "string.value.json", foreground: bare(t["status-success-text"]) },
        { token: "number.json", foreground: bare(t["method-post-text"]) },
        { token: "keyword.json", foreground: bare(t["method-delete-text"]) },
      ],
      colors: {
        "editor.background": t["canvas-panel"],
        "editor.foreground": t["label-primary"],
        // Line numbers are text: 4.5:1 on the editor, as every label is.
        "editorLineNumber.foreground": t["label-tertiary"],
        "editorLineNumber.activeForeground": t["label-secondary"],
        "editor.selectionBackground": withAlpha(t["accent"], 0.25),
        "editor.inactiveSelectionBackground": withAlpha(t["accent"], 0.12),
        "editor.lineHighlightBackground":
          theme === "dark" ? withAlpha(t["canvas-elevated"], 0.5) : t["canvas-elevated"],
        "editorCursor.foreground": theme === "dark" ? t["accent-text"] : t["accent"],
        "scrollbarSlider.background": t["scrollbar-thumb"],
        "scrollbarSlider.hoverBackground": t["scrollbar-thumb-hover"],
        "scrollbarSlider.activeBackground": t["scrollbar-thumb-hover"],
        // The editor's host draws the app's focus ring (:focus-within); Monaco's own 1 px blue line is not drawn (U-052).
        focusBorder: "#00000000",
        // Brackets in the text's own colour (U-038), whichever depth: Monaco's were #0431fa, #319331 and #7b3814.
        ...Object.fromEntries(
          [1, 2, 3, 4, 5, 6].map((depth) => [`editorBracketHighlight.foreground${depth}`, t["label-primary"]]),
        ),
      },
    });
  }
}

/** `#RRGGBB` with an alpha, as Monaco writes it: `#RRGGBBAA`. */
function withAlpha(hex: string, alpha: number): string {
  return (
    hex.slice(0, 7) +
    Math.round(alpha * 255)
      .toString(16)
      .padStart(2, "0")
      .toUpperCase()
  );
}

/**
 * What every editor is set in (U-052, U-038): the app's monospace at its body
 * size, as every value a person types or a server sends is, and brackets in
 * the text's own colour. Monaco cannot read a CSS variable: the page's values
 * are read when an editor is made.
 */
export function editorText(): {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  fontLigatures: false;
  bracketPairColorization: { enabled: false };
} {
  const style = getComputedStyle(document.documentElement);
  const px = (name: string, fallback: number) => {
    const value = style.getPropertyValue(name).trim();
    const n = parseFloat(value);
    if (!Number.isFinite(n)) return fallback;
    return value.endsWith("rem") ? n * parseFloat(style.fontSize) : n;
  };
  return {
    fontFamily: style.getPropertyValue("--font-mono").trim() || "monospace",
    fontSize: px("--type-mono-body-size", 13),
    lineHeight: px("--type-mono-body-line", 20),
    fontLigatures: false,
    bracketPairColorization: { enabled: false },
  };
}

export function monacoThemeName(theme: "dark" | "light"): string {
  return theme === "dark" ? "sandbox-dark" : "sandbox-light";
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
export function waitForNonZeroWidth(host: HTMLElement, timeoutMs = 4000): Promise<void> {
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
      const width = entries[0]?.contentRect.width ?? host.getBoundingClientRect().width;
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
