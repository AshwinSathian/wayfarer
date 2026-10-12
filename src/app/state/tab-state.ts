import { computed, signal } from "@angular/core";
import { emptyRequest, newId, type BinaryBody, type Draft, type RequestContent, type Row } from "@wayfarer/core";
import { RequestDoc } from "../models/collections";
import { TestResult } from "../models/test-assertion";
import type { SendTimings } from "../services/request-executor";
import { VariableToken } from "../services/variable-focus";
import { ResponseExportContext } from "../shared/inspect/response-export-entry";

export const blankRow = (): Row => ({ key: "", value: "", enabled: true });

export function emptyDraft(): Draft {
  return { ...emptyRequest(), params: [blankRow()], headers: [blankRow()] };
}

/** Rows as they are saved: names trimmed, rows without a name (the editor's blank row) left out. */
function namedRows<T extends { key: string }>(rows: T[]): T[] {
  return rows.map((row) => ({ ...row, key: row.key.trim() })).filter((row) => row.key);
}

/** A draft as it is saved: raw, with literal `{{var}}` text. */
export function contentOf(draft: Draft): RequestContent {
  const { responseId: _response, ...content } = draft;
  const body = { ...content.body };
  if (body.urlencoded) body.urlencoded = namedRows(body.urlencoded);
  if (body.multipart) body.multipart = namedRows(body.multipart);
  return { ...content, params: namedRows(content.params), headers: namedRows(content.headers), body };
}

/**
 * One tab of the composer (P5.1): the request being composed in it, what it
 * was opened from, and the response it last received. `WorkspaceStore`,
 * `RequestSave` and `ScriptTrust` read and write the tab that is open.
 */
export class TabState {
  readonly draft = signal<Draft>(emptyDraft());
  /** The saved request this tab was opened from or last saved to. Save writes back to it. */
  readonly bound = signal<RequestDoc | null>(null);
  /** Scripts that came from somewhere else (a history entry) and wait for a review (`ScriptTrust`). */
  readonly heldScripts = signal<RequestContent["scripts"] | null>(null);

  /** The draft as it was when the tab was opened, loaded or saved. */
  private readonly baseline = signal("");
  /** The draft differs from what it was opened from or last saved as. */
  readonly dirty = computed(() => JSON.stringify(contentOf(this.draft())) !== this.baseline());

  readonly endpointError = signal("");
  /** What a pasted cURL command asked for that the app does not do. Shown until the next send or the next request. */
  readonly pasteNotes = signal<string[]>([]);
  readonly loadingState = signal(false);
  readonly variableTokens = signal<VariableToken[]>([]);
  readonly missingVariableKeys = signal<string[]>([]);
  /** The variables without a value that held the last send back; the composer offers "Send anyway". */
  readonly unresolvedBlocked = signal<string[]>([]);
  /** The last send left the request's scripts out, because they wait for a review. */
  readonly scriptsSkipped = signal(false);

  readonly responseData = signal("");
  readonly responseError = signal("");
  readonly responseBodyIsJson = signal(false);
  readonly responseHeadersView = signal<{ name: string; value: string }[]>([]);
  readonly responseStatusCode = signal<number | undefined>(undefined);
  readonly responseStatusText = signal<string | undefined>(undefined);
  readonly responseIsError = signal(false);
  readonly responseTab = signal<"body" | "headers" | "timings" | "tests">("body");
  readonly responseContentLength = signal<number | undefined>(undefined);
  readonly responseBinary = signal<BinaryBody | null>(null);
  readonly responseRedirectedTo = signal<string | undefined>(undefined);
  readonly responseContentType = signal("");
  readonly responseHeadersLimited = signal(false);
  readonly responseExportContext = signal<ResponseExportContext | null>(null);
  readonly lastTestResults = signal<TestResult[]>([]);
  /** The console output of the last send's scripts. */
  readonly lastScriptLogs = signal<string[]>([]);
  /** How long the last send's scripts and its request took, each by itself. */
  readonly lastTimings = signal<SendTimings | null>(null);

  previewFingerprint = "";
  /** Aborts the send in flight. */
  inFlight: AbortController | null = null;

  constructor(readonly id: string = newId()) {
    this.markClean();
  }

  /** The draft as it is now is what the tab holds unchanged: it was just opened, loaded or saved. */
  markClean(): void {
    this.baseline.set(JSON.stringify(contentOf(this.draft())));
  }

  /** `saved` is what was written: an edit made while the write was under way is still unsaved. */
  markSaved(saved: RequestContent): void {
    this.baseline.set(JSON.stringify(saved));
  }

  /** A second tab with this one's request: the same draft, saved request and held scripts, so its scripts are trusted as this one's are. */
  copy(): TabState {
    const copy = new TabState();
    copy.draft.set(structuredClone(this.draft()));
    copy.bound.set(this.bound());
    copy.heldScripts.set(this.heldScripts());
    copy.baseline.set(this.baseline());
    return copy;
  }
}
