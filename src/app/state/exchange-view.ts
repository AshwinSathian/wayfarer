import { parseJson, type BinaryBody, type ExchangeRecord, type PastRequest, type ResponseEnvelope } from "@wayfarer/core";
import type { SendTimings, TestResult } from "@wayfarer/core";
import type { ResponseExportContext } from "../shared/inspect/response-export-entry";
import type { ResponseInspection } from "../shared/inspect/response-inspector";
import type { ShownEvent } from "./tab-state";

/**
 * What the Response view (and, later, the Sent view and History's detail) shows of one exchange. Two variants: a live
 * one is the response a tab holds, with the executor's result; a recorded one is a history entry with its exchange
 * record, and says what it does not hold in `notRecorded`. (A code name: the user's words are "Sent" and "Response".)
 *
 * A live view is made from the tab that made the send, never from `tabs.active()`: the composer's signals are the open
 * tab's, which may be another's by the time a send ends.
 */
export interface ExchangeView {
  kind: "live" | "recorded";
  statusCode?: number;
  statusText?: string;
  headers: { name: string; value: string }[];
  /** The browser withheld some response headers (a direct answer from another origin). */
  headersLimited: boolean;
  isError: boolean;
  /** The body of a success; "" for an error status. */
  data: string;
  /** The body (or the app's words) of an error status or of no response. */
  error: string;
  bodyIsJson: boolean;
  binary: BinaryBody | null;
  contentType: string;
  contentLength?: number;
  redirectedTo?: string;
  redirects?: ResponseEnvelope["redirects"];
  tlsInsecure: boolean;
  route: "direct" | "bridge" | null;
  record: ExchangeRecord | null;
  inspection: ResponseInspection | null;
  timings: SendTimings | null;
  testResults: TestResult[];
  scriptLogs: string[];
  scriptsSkipped: boolean;
  events: ShownEvent[];
  eventCount: number;
  eventsNote: string;
  exportContext: ResponseExportContext | null;
  /** A recorded exchange does not hold these parts: each is said to be "not recorded". */
  notRecorded: { body: boolean; timings: boolean; tests: boolean };
}

/** A live view: every part the tab holds, the rest absent. */
export function liveExchange(parts: Partial<Omit<ExchangeView, "kind" | "notRecorded">>): ExchangeView {
  return {
    headers: [],
    headersLimited: false,
    isError: false,
    data: "",
    error: "",
    bodyIsJson: false,
    binary: null,
    contentType: "",
    tlsInsecure: false,
    route: null,
    record: null,
    inspection: null,
    timings: null,
    testResults: [],
    scriptLogs: [],
    scriptsSkipped: false,
    events: [],
    eventCount: 0,
    eventsNote: "",
    exportContext: null,
    ...parts,
    kind: "live",
    notRecorded: { body: false, timings: false, tests: false },
  };
}

/** A recorded view: a history entry as it is stored (masked, with no body when none was kept) and its record. */
export function recordedExchange(entry: PastRequest): ExchangeView {
  const response = entry.response;
  const text = response?.body?.text ?? "";
  const isError = !response || response.status < 200 || response.status >= 300;
  return {
    ...liveExchange({
      statusCode: response?.status,
      statusText: response?.statusText,
      headers: (response?.headers ?? []).map(([name, value]) => ({ name, value })),
      isError,
      data: isError ? "" : text,
      error: isError ? text || entry.error || "" : "",
      bodyIsJson: !!text && parseJson(text).ok,
      contentType: response?.headers.find(([name]) => name.toLowerCase() === "content-type")?.[1] ?? "",
      route: entry.route,
      record: entry.record ?? null,
    }),
    kind: "recorded",
    // History keeps the phases of no send and the results of no test; a body only when kept (HISTORY_BODY_LIMIT).
    notRecorded: { body: !!response && !response.body, timings: true, tests: true },
  };
}
