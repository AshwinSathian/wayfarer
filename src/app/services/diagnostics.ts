import { Injectable } from "@angular/core";

interface DiagnosticEntry {
  at: number;
  context: string;
  message: string;
}

// ponytail: in-memory ring buffer + console only. P7.3 persists it to the
// `diagnostics` store and shows it in the Diagnostics view (redacted).
const MAX_ENTRIES = 200;
const entries: DiagnosticEntry[] = [];

/**
 * Records an error that the app handled but must not hide (P1.11, F36).
 * Usable outside Angular DI (plain utilities); Diagnostics wraps it.
 */
export function recordDiagnostic(error: unknown, context: string): void {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  entries.push({ at: Date.now(), context, message });
  if (entries.length > MAX_ENTRIES) entries.shift();
  console.warn(`[wayfarer] ${context}:`, error);
}

@Injectable({ providedIn: "root" })
export class Diagnostics {
  record(error: unknown, context: string): void {
    recordDiagnostic(error, context);
  }

  entries(): readonly DiagnosticEntry[] {
    return [...entries];
  }
}
