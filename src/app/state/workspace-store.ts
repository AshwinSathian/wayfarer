import { Injectable, effect, inject, signal } from "@angular/core";
import {
  emptyRequest,
  newId,
  parseJson,
  type Draft,
  type RequestBody,
  type RequestContent,
  type Row,
} from "@wayfarer/core";
import { Idb } from "../data/idb";
import { PastRequest } from "../models/history";
import { TestResult } from "../models/test-assertion";
import { EnvironmentsStore } from "../services/environments-store";
import {
  BuiltRequest,
  RequestExecutionResponse,
  RequestExecutionResult,
  RequestExecutor,
  SendBlockedError,
} from "../services/request-executor";
import {
  VariableContext,
  VariableToken,
  collectVariableTokens,
  resolveTemplate,
  resolveTemplateDeep,
} from "../shared/environments/env-resolution";
import { writeToClipboard } from "../shared/http/clipboard";
import { bodyObjectFromRows, bodyRowsFromObject, isPlainObject } from "../shared/http/key-value";
import { buildAuthHeaders, buildAuthQueryParam, resolveAuth } from "../shared/http/request-auth";
import {
  appendQueryParam,
  buildUrlFromParams,
  normalizeUrl,
  parseParamsFromUrl,
  validateUrl,
} from "../shared/http/request-url";
import { BinaryBody } from "@wayfarer/core";
import { buildCurlCommand } from "../shared/inspect/export";
import { ResponseExportContext } from "../shared/inspect/response-export-entry";
import { ResponseInspector } from "../shared/inspect/response-inspector";

export type RowContext = "Body" | "Headers";
export interface BodyRow {
  key: string;
  value: unknown;
}

export const DEFAULT_HEADER_KEY = "Content-Type";
export const DEFAULT_HEADER_VALUE = "application/json";

const BODY_METHODS = new Set(["POST", "PUT", "PATCH"]);

export function isBodyMethod(method?: string): boolean {
  return !!method && BODY_METHODS.has(method);
}

const blankBodyRows = (): BodyRow[] => [{ key: "", value: "" }];
const blankParams = (): Row[] => [{ key: "", value: "", enabled: true }];
const defaultHeaders = (): Row[] => [{ key: DEFAULT_HEADER_KEY, value: DEFAULT_HEADER_VALUE, enabled: true }];

function emptyDraft(): Draft {
  return { ...emptyRequest(), params: blankParams(), headers: defaultHeaders() };
}

/** A JSON value as body text. The row editor and history hold values; P2.12 leaves only the text. */
function jsonBody(value: unknown): RequestBody {
  const text = value === undefined ? undefined : JSON.stringify(value, null, 2);
  return text === undefined ? { mode: "none" } : { mode: "raw", raw: { language: "json", text } };
}

/** The value a body's text stands for: its JSON, or the text itself when it is not JSON. */
export function bodyValue(body: RequestBody): unknown {
  if (body.mode === "none") return undefined;
  const parsed = parseJson(body.raw.text);
  return body.raw.language === "json" && parsed.ok ? parsed.value : body.raw.text;
}

/** The headers that are sent: enabled rows with a name, in order. */
export function sentHeaders(rows: Row[]): [string, string][] {
  return rows.filter((row) => row.enabled && row.key.trim()).map((row) => [row.key.trim(), row.value]);
}

/** A history entry as a request: it carries what was sent, so no auth, scripts or tests. */
export function requestFromHistory(entry: PastRequest): RequestContent {
  return {
    ...emptyRequest(),
    method: entry.method,
    url: entry.url,
    headers: Object.entries(entry.headers ?? {}).map(([key, value]) => ({ key, value: String(value ?? ""), enabled: true })),
    body: jsonBody(entry.body),
  };
}

/** Rows as they are saved: names trimmed, rows without a name (the editor's blank row) left out. */
function namedRows(rows: Row[]): Row[] {
  return rows.map((row) => ({ ...row, key: row.key.trim() })).filter((row) => row.key);
}

/**
 * The one request being composed, as a `Draft`, and the response it last
 * received. The composer's panels edit the draft; a saved request holds the
 * same fields.
 *
 * A row editor binds `[(ngModel)]` to a row's own fields, so rows change in
 * place: the panel then calls `refreshVariablePreview` (or `bodyRowsEdited`).
 */
@Injectable({ providedIn: "root" })
export class WorkspaceStore {
  private readonly idb = inject(Idb);
  private readonly responseInspector = inject(ResponseInspector);
  private readonly environments = inject(EnvironmentsStore);
  private readonly executor = inject(RequestExecutor);

  readonly draft = signal<Draft>(emptyDraft());
  /**
   * The Basic body editor's rows. The draft holds the body as JSON text,
   * which has no place for a row whose name is still empty.
   */
  readonly bodyRows = signal<BodyRow[]>(blankBodyRows());

  readonly endpointError = signal("");
  readonly loadingState = signal(false);
  readonly variableTokens = signal<VariableToken[]>([]);
  readonly missingVariableKeys = signal<string[]>([]);

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
  readonly responseInspection = this.responseInspector.latest;
  readonly responseExportContext = signal<ResponseExportContext | null>(null);
  readonly lastTestResults = signal<TestResult[]>([]);

  /** Request-scoped variables (distinct from environment vars). Never mutated post-construction today — a hook for a future "request variables" UI. */
  private readonly requestVariables: Record<string, string> = {};
  private previewFingerprint = "";
  /** Aborts the send in flight. */
  private inFlight: AbortController | null = null;

  constructor() {
    // Switching the active environment goes through no method here, so the
    // {{var}} preview needs its own trigger.
    effect(() => {
      this.environments.activeEnvironment();
      this.refreshVariablePreview();
    });
  }

  get shouldShowResponsePanel(): boolean {
    return (
      this.loadingState() ||
      this.responseStatusCode() !== undefined ||
      !!this.responseData() ||
      !!this.responseError() ||
      this.responseHeadersView().length > 0
    );
  }

  patch(change: Partial<Draft>): void {
    this.draft.update((draft) => ({ ...draft, ...change }));
  }

  /** The draft as it is saved: raw, with literal `{{var}}` text. */
  snapshot(): RequestContent {
    const { responseId: _response, ...content } = this.draft();
    return { ...content, params: namedRows(content.params), headers: namedRows(content.headers) };
  }

  setMethod(method: string): void {
    this.patch({ method });
    if (!isBodyMethod(method)) {
      this.setBodyRows(blankBodyRows());
    }
  }

  /** The URL field was edited: the Params rows mirror its query. */
  setUrl(url: string): void {
    this.patch({ url, params: parseParamsFromUrl(url) });
    this.refreshVariablePreview();
  }

  setBodyRows(rows: BodyRow[]): void {
    this.bodyRows.set(rows);
    this.patch({ body: jsonBody(bodyObjectFromRows(rows)) });
  }

  /** A body row was edited in place. */
  bodyRowsEdited(): void {
    this.setBodyRows(this.bodyRows());
    this.refreshVariablePreview();
  }

  /**
   * Replaces the draft with a saved request or a history entry. A history
   * entry carries no scripts or tests, so the composer keeps its own.
   * Returns whether the request has a body the row editor can show.
   */
  load(request: RequestContent, source: "collection" | "history"): boolean {
    const current = this.draft();
    this.draft.set({
      ...structuredClone(request),
      params: parseParamsFromUrl(request.url),
      ...(source === "history" ? { scripts: current.scripts, tests: current.tests } : {}),
      responseId: current.responseId,
    });
    // Only an object has rows. Any other body stays in the draft as its text.
    const body = bodyValue(request.body);
    const hasBody = isPlainObject(body);
    this.bodyRows.set(hasBody ? bodyRowsFromObject(body) : blankBodyRows());
    return hasBody;
  }

  /** A new request. Scripts, tests and the response on screen stay. */
  reset(): void {
    this.draft.update((draft) => ({
      ...emptyDraft(),
      scripts: draft.scripts,
      tests: draft.tests,
      responseId: draft.responseId,
    }));
    this.bodyRows.set(blankBodyRows());
    this.endpointError.set("");
    this.refreshVariablePreview();
  }

  addRow(ctx: RowContext): void {
    if (ctx === "Body") {
      this.setBodyRows([...this.bodyRows(), { key: "", value: "" }]);
    } else {
      this.patch({ headers: [...this.draft().headers, { key: "", value: "", enabled: true }] });
    }
    this.refreshVariablePreview();
  }

  removeRow(index: number, ctx: RowContext): void {
    if (ctx === "Body") {
      this.setBodyRows(this.bodyRows().filter((_, i) => i !== index));
    } else {
      this.patch({ headers: this.draft().headers.filter((_, i) => i !== index) });
    }
    this.refreshVariablePreview();
  }

  isAddDisabled(ctx: RowContext): boolean {
    const rows: BodyRow[] = ctx === "Body" ? this.bodyRows() : this.draft().headers;
    const last = rows[rows.length - 1];
    return !!last && (last.key === "" || last.value === "");
  }

  addParam(): void {
    this.patch({ params: [...this.draft().params, { key: "", value: "", enabled: true }] });
    this.refreshVariablePreview();
  }

  removeParam(index: number): void {
    const remaining = this.draft().params.filter((_, i) => i !== index);
    this.patch({ params: remaining.length ? remaining : blankParams() });
    this.paramsEdited();
  }

  isAddParamDisabled(): boolean {
    const items = this.draft().params;
    const last = items[items.length - 1];
    return !!last && (last.key === "" || last.value === "");
  }

  /** A Params row was edited in place: rewrite the URL's query from the rows. */
  paramsEdited(): void {
    const draft = this.draft();
    const next = buildUrlFromParams(draft.url, draft.params);
    if (next !== null) {
      this.patch({ url: next });
      this.refreshVariablePreview();
    }
  }

  addTest(): void {
    this.patch({
      tests: [...this.draft().tests, { id: newId(), target: "status", operator: "equals", expected: "" }],
    });
  }

  removeTest(index: number): void {
    this.patch({ tests: this.draft().tests.filter((_, i) => i !== index) });
  }

  /** Sends the draft. Resolves to true when the exchange was recorded in history. */
  async send(): Promise<boolean> {
    this.endpointError.set("");
    this.resetResponseState();
    this.lastTestResults.set([]);

    const draft = this.draft();
    const endpointText = draft.url;
    if (!endpointText) {
      this.endpointError.set("Endpoint is a Required value");
      return false;
    }

    const resolvedForValidation = resolveTemplate(endpointText.trim(), this.variableContext());
    if (!validateUrl(resolvedForValidation)) {
      this.endpointError.set("Please enter a valid URL");
      return false;
    }

    this.loadingState.set(true);
    const controller = new AbortController();
    this.inFlight = controller;

    let result: RequestExecutionResult;
    try {
      result = await this.executor.execute({
        preRequestScript: draft.scripts.pre,
        postRequestScript: draft.scripts.post,
        tests: draft.tests,
        buildRequest: () => this.buildRequestForExecution(endpointText),
        signal: controller.signal,
      });
    } catch (error) {
      this.loadingState.set(false);
      if (error instanceof SendBlockedError) {
        this.endpointError.set(error.message);
        return false;
      }
      throw error;
    }

    this.loadingState.set(false);
    this.lastTestResults.set(result.testResults);
    this.applyExecutionResponse(result.response);
    await this.idb.add(result.history);
    return true;
  }

  /** Gives up on the request in flight. The send then ends with "cancelled" instead of a response. */
  cancel(): void {
    this.inFlight?.abort();
  }

  async copyAsCurl(): Promise<void> {
    const endpoint = this.draft().url;
    if (!endpoint) {
      return;
    }
    const { method, url, headers, body } = this.resolveRequest(endpoint);
    await writeToClipboard(buildCurlCommand({ method, url, headers: Object.fromEntries(headers), body }));
  }

  refreshVariablePreview(): void {
    const activeEnv = this.environments.activeEnvironment();
    const { url: endpoint, headers } = this.draft();
    const body = this.bodyRows();
    const fingerprint = JSON.stringify({
      endpoint,
      headers,
      body,
      // The variables' values are part of it: editing a value in the same
      // environment must refresh a preview computed before the edit.
      env: activeEnv ? { id: activeEnv.meta.id, vars: activeEnv.vars } : null,
    });
    if (fingerprint === this.previewFingerprint) {
      return;
    }
    this.previewFingerprint = fingerprint;
    const tokens = collectVariableTokens(
      { url: endpoint, headers, body },
      { requestVars: this.requestVariables, environment: activeEnv, globals: {} }
    );
    this.variableTokens.set(tokens);
    this.missingVariableKeys.set(tokens.filter((token) => token.source === "missing").map((token) => token.key));
  }

  /**
   * Invoked by RequestExecutor *after* the pre-request script has run:
   * {{var}} resolution has to reflect any pm.environment.set() the script
   * just made, so it reads a fresh variable context.
   */
  private buildRequestForExecution(endpointText: string): BuiltRequest {
    const request = this.resolveRequest(endpointText);
    const id = newId();
    this.responseExportContext.set({
      id,
      method: request.method,
      url: request.url,
      headers: Object.fromEntries(request.headers),
      body: request.body,
    });
    this.patch({ responseId: id });
    return request;
  }

  /**
   * The draft with `{{var}}` placeholders substituted, as it is transmitted
   * or exported as a runnable command. The editors keep the literal template.
   */
  private resolveRequest(endpointText: string): BuiltRequest {
    const context = this.variableContext();
    const content = this.snapshot();
    const usesBody = isBodyMethod(content.method);
    const template = bodyValue(content.body);
    const auth = resolveAuth(content.auth, (text) => resolveTemplate(text, context));
    // One value per name, whatever its case, the later one winning: the auth
    // header replaces a row of the same name. A Map keeps a name such as
    // "__proto__" as data (F56).
    const byName = new Map<string, [string, string]>();
    for (const [key, value] of [...sentHeaders(content.headers), ...Object.entries(buildAuthHeaders(auth))]) {
      const name = resolveTemplate(key, context);
      byName.set(name.toLowerCase(), [name, resolveTemplate(value, context)]);
    }
    const headers = [...byName.values()];
    const body =
      usesBody && template ? (resolveTemplateDeep(template, context) as Record<string, unknown>) : undefined;
    // The Params rows are already in the URL field (they mirror its query).
    let url = normalizeUrl(resolveTemplate(endpointText.trim(), context));
    const authParam = buildAuthQueryParam(auth);
    if (authParam) {
      url = appendQueryParam(url, authParam.key, authParam.value);
    }
    return { method: content.method, url, headers, body, usesBody };
  }

  private variableContext(): VariableContext {
    return {
      requestVars: this.requestVariables,
      environment: this.environments.activeEnvironment(),
      globals: {},
    };
  }

  private applyExecutionResponse(response: RequestExecutionResponse): void {
    this.responseIsError.set(response.isError);
    this.responseStatusCode.set(response.statusCode);
    this.responseStatusText.set(response.statusText);
    this.responseBodyIsJson.set(response.bodyIsJson);
    this.responseHeadersView.set(response.headersView);
    this.responseContentLength.set(response.contentLength);
    this.responseBinary.set(response.binary ?? null);
    this.responseRedirectedTo.set(response.redirectedTo);
    this.responseTab.set("body");
    this.responseData.set(response.dataText);
    this.responseError.set(response.errorText);
  }

  private resetResponseState(): void {
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
    this.responseTab.set("body");
    this.responseExportContext.set(null);
  }
}
