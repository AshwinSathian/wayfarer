import { computed, signal } from "@angular/core";
import { emptyRequest, newId, parseJson, type BinaryBody, type Draft, type RequestContent, type ResponseEnvelope, type Row, type RunIteration, type StreamEvent } from "@wayfarer/core";
import { RequestDoc } from "../models/collections";
import { PastRequest, PastRequestKey } from "../models/history";
import { TestResult } from "../models/test-assertion";
import type { SendTimings } from "../services/request-executor";
import { VariableToken } from "../services/variable-focus";
import { ResponseExportContext } from "../shared/inspect/response-export-entry";
import { ResponseInspection } from "../shared/inspect/response-inspector";
import { RunState } from "./run-state";
import { SocketState } from "./socket-state";

/** An event of a stream as the list shows it. */
export type ShownEvent = Omit<StreamEvent, "timeMs"> & { timeMs?: number };
// ponytail: the list is the newest 500 events, each arrival copying the list. A table of every event of a long stream needs a virtual list.
export const SHOWN_EVENTS = 500;

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

/** Scripts that wait for a review, and what the review calls them when they are not a history entry's. */
export type HeldScripts = RequestContent["scripts"] & { name?: string };

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
  readonly heldScripts = signal<HeldScripts | null>(null);
  /** The history entry of the tab's last send, or the one it was opened from: where its response is kept (P5.1). */
  readonly historyKey = signal<PastRequestKey | undefined>(undefined);

  /** The draft as it was when the tab was opened, loaded or saved. */
  readonly baseline = signal("");
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
  readonly responseTab = signal<"body" | "headers" | "timings" | "tests" | "events">("body");
  readonly responseContentLength = signal<number | undefined>(undefined);
  readonly responseBinary = signal<BinaryBody | null>(null);
  readonly responseRedirectedTo = signal<string | undefined>(undefined);
  /** The redirects followed for the last response through the Local Bridge (P5.4), and why no more were. Not stored. */
  readonly responseRedirects = signal<ResponseEnvelope["redirects"]>(undefined);
  /** The last response was got with the server's certificate not verified. Not stored. */
  readonly responseTlsInsecure = signal(false);
  /** Where the response came from (P6.4's badge); null with no response. */
  readonly responseRoute = signal<"direct" | "bridge" | null>(null);
  readonly responseContentType = signal("");
  readonly responseHeadersLimited = signal(false);
  readonly responseExportContext = signal<ResponseExportContext | null>(null);
  readonly lastTestResults = signal<TestResult[]>([]);
  /** The console output of the last send's scripts. */
  readonly lastScriptLogs = signal<string[]>([]);
  /** How long the last send's scripts and its request took, each by itself. */
  readonly lastTimings = signal<SendTimings | null>(null);
  /**
   * The events of the last response when it was an event stream (P5.6), the
   * newest `SHOWN_EVENTS` of them: as they arrived, or read from the body
   * when the route gave it whole (the Local Bridge; they then have no time).
   */
  readonly streamEvents = signal<ShownEvent[]>([]);
  /** How many events the stream gave in all. */
  readonly streamCount = signal(0);
  /** What there is to say of the stream: it was stopped, it arrived whole, its body is cut. */
  readonly streamNote = signal("");
  /** The phases and sizes of the last send's request, as the browser measured them. */
  readonly inspection = signal<ResponseInspection | null>(null);

  /** The tab's WebSocket (P5.7), for an address that starts with `ws:` or `wss:`. */
  readonly socket = new SocketState();
  /** A tab that holds a collection run instead of a request (P5.2). It is one from the moment it is opened, and it is not stored. */
  run: RunState | null = null;
  /** Set on the tab a request of a collection run is sent from (P5.2): which iteration, and the data file's row. Such a tab is in no strip. */
  iteration?: RunIteration;
  /** Set for a send that reconnects an event stream (P5.6): the last id the stream gave, sent as `Last-Event-ID` as the server wrote it. */
  lastEventId?: string;
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

  /** Shows the response a history entry recorded, as it is stored: masked, and without a body when none was kept. */
  showRecorded(entry: PastRequest): void {
    this.resetResponse();
    this.lastTestResults.set([]);
    this.lastScriptLogs.set([]);
    this.lastTimings.set(null);
    const response = entry.response;
    const text = response?.body?.text ?? "";
    const isError = !response || response.status < 200 || response.status >= 300;
    this.responseIsError.set(isError);
    this.responseStatusCode.set(response?.status);
    this.responseStatusText.set(response?.statusText);
    this.responseHeadersView.set((response?.headers ?? []).map(([name, value]) => ({ name, value })));
    this.responseContentType.set(response?.headers.find(([name]) => name.toLowerCase() === "content-type")?.[1] ?? "");
    this.responseBodyIsJson.set(!!text && parseJson(text).ok);
    this.responseData.set(isError ? "" : text);
    this.responseError.set(isError ? text || entry.error || "" : "");
  }

  resetResponse(): void {
    this.responseData.set("");
    this.responseError.set("");
    this.responseBodyIsJson.set(false);
    this.responseHeadersView.set([]);
    this.responseStatusCode.set(undefined);
    this.responseStatusText.set(undefined);
    this.responseIsError.set(false);
    this.responseContentLength.set(undefined);
    this.responseBinary.set(null);
    this.responseRedirectedTo.set(undefined);
    this.responseRedirects.set(undefined);
    this.responseTlsInsecure.set(false);
    this.responseRoute.set(null);
    this.responseContentType.set("");
    this.responseHeadersLimited.set(false);
    this.responseTab.set("body");
    this.responseExportContext.set(null);
    this.inspection.set(null);
    this.streamEvents.set([]);
    this.streamCount.set(0);
    this.streamNote.set("");
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
    // A second tab of a run is a run of the same requests, not yet started.
    if (this.run) copy.run = new RunState(this.run.target);
    return copy;
  }
}
