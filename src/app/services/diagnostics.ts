import { ErrorHandler, Injectable, signal } from "@angular/core";

export interface DiagnosticEntry {
  at: number;
  context: string;
  /** Redacted when recorded: see `redactMessage`. */
  message: string;
}

/** One self-test of the Diagnostics view: what it checked, whether it passed, and what it found. */
export interface SelfTest {
  name: string;
  ok: boolean;
  detail: string;
}

// ponytail: in memory only, the last 200 of this page's life. An error of
// IndexedDB is the one most worth seeing, and it cannot be stored there.
const MAX_ENTRIES = 200;
const log = signal<readonly DiagnosticEntry[]>([]);

/**
 * An error's message as the app keeps it: no address, no quoted text and no
 * run of 20 or more letters, digits and token characters (a key, a token, a
 * value from a body), and at most 300 characters. What a request carried is
 * never written into the log, and a report copied from it holds none of it.
 */
export function redactMessage(message: string): string {
  return message
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s"'`<>]+/gi, "<address>")
    .replace(/(["'`])(?:(?!\1)[^\n])+\1/g, '"…"')
    .replace(/[A-Za-z0-9+/=_.-]{20,}/g, "<redacted>")
    .slice(0, 300);
}

/**
 * Records an error that the app handled but must not hide (P1.11, F36),
 * for the Diagnostics view (P7.3). Usable outside Angular DI.
 */
export function recordDiagnostic(error: unknown, context: string): void {
  keepDiagnostic(error, context);
  console.warn(`[wayfarer] ${context}:`, error);
}

/** Puts an error in the log without writing it to the console, for a caller that writes its own. */
export function keepDiagnostic(error: unknown, context: string): void {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  log.update((entries) => [
    ...entries.slice(1 - MAX_ENTRIES),
    { at: Date.now(), context, message: redactMessage(message) },
  ]);
}

/** The log, oldest first. */
export const diagnosticEntries = log.asReadonly();

/** Records what the Content-Security-Policy blocks. Called once, before the app starts. */
export function listenForCspViolations(): void {
  document.addEventListener("securitypolicyviolation", (event) =>
    recordDiagnostic(`${event.effectiveDirective} blocked ${event.blockedURI || "inline"}`, "csp"),
  );
}

/**
 * Angular's errors, recorded as well as written to the console. With
 * `provideBrowserGlobalErrorListeners` these include the page's uncaught
 * errors and unhandled rejections.
 */
@Injectable()
export class RecordingErrorHandler extends ErrorHandler {
  override handleError(error: unknown): void {
    recordDiagnostic(error, "angular");
    super.handleError(error);
  }
}

/** The report the Diagnostics view copies, as markdown: no address, header or body of a request is in it. */
export function diagnosticsReport(
  facts: [string, string][],
  tests: SelfTest[],
  entries: readonly DiagnosticEntry[],
): string {
  const line = (entry: DiagnosticEntry) => `- ${new Date(entry.at).toISOString()} ${entry.context}: ${entry.message}`;
  const errors = entries.filter((entry) => entry.context !== "csp");
  const csp = entries.filter((entry) => entry.context === "csp");
  return [
    "## Wayfarer diagnostics",
    "",
    "| | |",
    "|---|---|",
    ...facts.map(([name, value]) => `| ${name} | ${value} |`),
    "",
    "## Self-tests",
    "",
    ...(tests.length ? tests.map((test) => `- [${test.ok ? "x" : " "}] ${test.name}: ${test.detail}`) : ["Not run."]),
    "",
    "## Errors",
    "",
    ...(errors.length ? errors.map(line) : ["None."]),
    "",
    "## Content-Security-Policy violations",
    "",
    ...(csp.length ? csp.map(line) : ["None."]),
    "",
  ].join("\n");
}

@Injectable({ providedIn: "root" })
export class Diagnostics {
  readonly entries = diagnosticEntries;

  record(error: unknown, context: string): void {
    recordDiagnostic(error, context);
  }
}
