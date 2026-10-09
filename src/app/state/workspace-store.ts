import { Injectable, effect, inject, signal } from "@angular/core";
import {
  FORBIDDEN_METHODS,
  RAW_CONTENT_TYPES,
  emptyRequest,
  isHttpMethod,
  newId,
  parseJson,
  type Draft,
  type FileRef,
  type MultipartPart,
  type RequestBody,
  type RequestContent,
  type Row,
} from "@wayfarer/core";
import { Idb } from "../data/idb";
import { PastRequest } from "../models/history";
import { TestResult } from "../models/test-assertion";
import { BridgeSettings } from "../services/bridge-settings";
import { EnvironmentsStore } from "../services/environments-store";
import { RequestFiles } from "../services/request-files";
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
} from "../shared/environments/env-resolution";
import { writeToClipboard } from "../shared/http/clipboard";
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

/** GET and HEAD cannot carry a body: `fetch` refuses one. */
export function isBodyMethod(method?: string): boolean {
  return !!method && method !== "GET" && method !== "HEAD";
}

/** A body as it is sent, with the `Content-Type` its mode implies. */
interface SentBody {
  data: string | Blob | FormData;
  contentType?: string;
}

/** A body as text, for the places that show or copy one. A file or a form has none. */
function textOf(body: BuiltRequest["body"]): string | undefined {
  return typeof body === "string" ? body : undefined;
}

const blankRow = (): Row => ({ key: "", value: "", enabled: true });

function emptyDraft(): Draft {
  return { ...emptyRequest(), params: [blankRow()], headers: [blankRow()] };
}

/** The headers that are sent: enabled rows with a name, in order. */
export function sentHeaders(rows: Row[]): [string, string][] {
  return rows.filter((row) => row.enabled && row.key.trim()).map((row) => [row.key.trim(), row.value]);
}

/** A history entry as a request: it carries what was sent, so no auth, scripts or tests. */
export function requestFromHistory(entry: PastRequest): RequestContent {
  const text = typeof entry.body === "string" ? entry.body : entry.body === undefined ? undefined : JSON.stringify(entry.body, null, 2);
  return {
    ...emptyRequest(),
    method: entry.method,
    url: entry.url,
    headers: Object.entries(entry.headers ?? {}).map(([key, value]) => ({ key, value: String(value ?? ""), enabled: true })),
    body: text === undefined ? { mode: "none" } : { mode: "raw", raw: { language: parseJson(text).ok ? "json" : "text", text } },
  };
}

/** Rows as they are saved: names trimmed, rows without a name (the editor's blank row) left out. */
function namedRows<T extends { key: string }>(rows: T[]): T[] {
  return rows.map((row) => ({ ...row, key: row.key.trim() })).filter((row) => row.key);
}

/** Every text of a body that may hold a `{{variable}}`. */
function bodyTexts(body: RequestBody): string[] {
  switch (body.mode) {
    case "raw":
      return [body.raw?.text ?? ""];
    case "urlencoded":
      return (body.urlencoded ?? []).flatMap((row) => [row.key, row.value]);
    case "multipart":
      return (body.multipart ?? []).flatMap((part) => [part.key, part.kind === "text" ? part.value : ""]);
    default:
      return [];
  }
}

/**
 * The one request being composed, as a `Draft`, and the response it last
 * received. The composer's panels edit the draft; a saved request holds the
 * same fields.
 *
 * A row editor binds `[(ngModel)]` to a row's own fields, so rows change in
 * place: the panel then calls `refreshVariablePreview`.
 */
@Injectable({ providedIn: "root" })
export class WorkspaceStore {
  private readonly idb = inject(Idb);
  private readonly responseInspector = inject(ResponseInspector);
  private readonly environments = inject(EnvironmentsStore);
  private readonly executor = inject(RequestExecutor);
  private readonly files = inject(RequestFiles);
  private readonly bridge = inject(BridgeSettings);

  readonly draft = signal<Draft>(emptyDraft());

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
    const body = { ...content.body };
    if (body.urlencoded) body.urlencoded = namedRows(body.urlencoded);
    if (body.multipart) body.multipart = namedRows(body.multipart);
    return { ...content, params: namedRows(content.params), headers: namedRows(content.headers), body };
  }

  /** The body is kept when the method changes: GET and HEAD send none, and it is there again for POST. */
  setMethod(method: string): void {
    this.patch({ method: method.trim().toUpperCase() });
  }

  /** Changes part of the body: its mode, or the content of one mode. */
  setBody(change: Partial<RequestBody>): void {
    this.patch({ body: { ...this.draft().body, ...change } });
    this.refreshVariablePreview();
  }

  /** The URL field was edited: the Params rows mirror its query. */
  setUrl(url: string): void {
    this.patch({ url, params: parseParamsFromUrl(url) });
    this.refreshVariablePreview();
  }

  /**
   * Replaces the draft with a saved request or a history entry. A history
   * entry carries no scripts or tests, so the composer keeps its own.
   */
  load(request: RequestContent, source: "collection" | "history"): void {
    const current = this.draft();
    this.draft.set({
      ...structuredClone(request),
      params: parseParamsFromUrl(request.url),
      ...(source === "history" ? { scripts: current.scripts, tests: current.tests } : {}),
      responseId: current.responseId,
    });
  }

  /** A new request. Scripts, tests and the response on screen stay. */
  reset(): void {
    this.draft.update((draft) => ({
      ...emptyDraft(),
      scripts: draft.scripts,
      tests: draft.tests,
      responseId: draft.responseId,
    }));
    this.endpointError.set("");
    this.refreshVariablePreview();
  }

  /**
   * A header row was edited in place. The list is replaced (its rows are
   * not), so that what is computed from the draft's headers runs again.
   */
  headersEdited(): void {
    this.patch({ headers: [...this.draft().headers] });
    this.refreshVariablePreview();
  }

  addHeader(): void {
    this.patch({ headers: [...this.draft().headers, blankRow()] });
  }

  removeHeader(index: number): void {
    this.patch({ headers: this.draft().headers.filter((_, i) => i !== index) });
    this.refreshVariablePreview();
  }

  addParam(): void {
    this.patch({ params: [...this.draft().params, blankRow()] });
    this.refreshVariablePreview();
  }

  removeParam(index: number): void {
    const remaining = this.draft().params.filter((_, i) => i !== index);
    this.patch({ params: remaining.length ? remaining : [blankRow()] });
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

    const methodError = this.methodError(draft.method);
    if (methodError) {
      this.endpointError.set(methodError);
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

  /** Why this method cannot be sent, or "" when it can. */
  private methodError(method: string): string {
    if (!method) {
      return "Enter a method, such as GET.";
    }
    if (!isHttpMethod(method)) {
      return `"${method}" is not an HTTP method. A method is one word of at most 32 characters: letters, digits and !#$%&'*+-.^_\`|~.`;
    }
    const bridge = this.bridge.config();
    if (FORBIDDEN_METHODS.includes(method) && !(bridge.enabled && bridge.url)) {
      return `Browsers do not send ${method} requests. Turn on the Local Bridge to send one.`;
    }
    return "";
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
    // Awaited only when the body has a file to read.
    const { method, url, headers, body } = await this.resolveRequest(endpoint);
    // A file or a form has no text to quote: the command is written without a body.
    await writeToClipboard(buildCurlCommand({ method, url, headers: Object.fromEntries(headers), body: textOf(body) }));
  }

  refreshVariablePreview(): void {
    const activeEnv = this.environments.activeEnvironment();
    const { url: endpoint, headers } = this.draft();
    const body = bodyTexts(this.draft().body);
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
  private buildRequestForExecution(endpointText: string): BuiltRequest | Promise<BuiltRequest> {
    const built = this.resolveRequest(endpointText);
    return built instanceof Promise ? built.then((request) => this.recordForExport(request)) : this.recordForExport(built);
  }

  private recordForExport(request: BuiltRequest): BuiltRequest {
    const id = newId();
    this.responseExportContext.set({
      id,
      method: request.method,
      url: request.url,
      headers: Object.fromEntries(request.headers),
      body: textOf(request.body),
    });
    this.patch({ responseId: id });
    return request;
  }

  /**
   * The draft with `{{var}}` placeholders substituted, as it is transmitted
   * or exported as a runnable command. The editors keep the literal template.
   */
  private resolveRequest(endpointText: string): BuiltRequest | Promise<BuiltRequest> {
    const context = this.variableContext();
    const resolve = (text: string): string => resolveTemplate(text, context);
    const content = this.snapshot();
    // A promise only when a file has to be read: everything else is built at once.
    const sent = isBodyMethod(content.method) ? this.resolveBody(content.body, resolve) : undefined;
    const finish = (body: SentBody | undefined): BuiltRequest => this.assemble(endpointText, content, body, resolve);
    return sent instanceof Promise ? sent.then(finish) : finish(sent);
  }

  private assemble(
    endpointText: string,
    content: RequestContent,
    sent: SentBody | undefined,
    resolve: (text: string) => string
  ): BuiltRequest {
    const auth = resolveAuth(content.auth, resolve);
    // One value per name, whatever its case, the later one winning: the auth
    // header replaces a row of the same name. A Map keeps a name such as
    // "__proto__" as data (F56).
    const byName = new Map<string, [string, string]>();
    for (const [key, value] of [...sentHeaders(content.headers), ...Object.entries(buildAuthHeaders(auth))]) {
      const name = resolve(key);
      byName.set(name.toLowerCase(), [name, resolve(value)]);
    }
    // The body's own type, unless the request names one.
    if (sent?.contentType && !byName.has("content-type")) {
      byName.set("content-type", ["Content-Type", sent.contentType]);
    }
    const headers = [...byName.values()];
    // The Params rows are already in the URL field (they mirror its query).
    let url = normalizeUrl(resolve(endpointText.trim()));
    const authParam = buildAuthQueryParam(auth);
    if (authParam) {
      url = appendQueryParam(url, authParam.key, authParam.value);
    }
    return { method: content.method, url, headers, body: sent?.data };
  }

  /**
   * The body as it is sent, by mode, with the `Content-Type` it implies. A
   * form has none here: `fetch` writes the multipart type with its boundary.
   */
  private resolveBody(body: RequestBody, resolve: (text: string) => string): SentBody | undefined | Promise<SentBody> {
    switch (body.mode) {
      case "none":
        return undefined;
      case "raw": {
        const text = resolve(body.raw?.text ?? "");
        return text ? { data: text, contentType: RAW_CONTENT_TYPES[body.raw?.language ?? "text"] } : undefined;
      }
      case "urlencoded": {
        const pairs = (body.urlencoded ?? []).filter((row) => row.enabled).map((row) => [resolve(row.key), resolve(row.value)]);
        return { data: new URLSearchParams(pairs).toString(), contentType: "application/x-www-form-urlencoded" };
      }
      case "multipart":
        return this.multipartForm((body.multipart ?? []).filter((item) => item.enabled), resolve);
      case "binary":
        return this.binaryFile(body.binary);
    }
  }

  private async multipartForm(parts: MultipartPart[], resolve: (text: string) => string): Promise<SentBody> {
    const form = new FormData();
    for (const part of parts) {
      if (part.kind === "text") {
        form.append(resolve(part.key), resolve(part.value));
      } else {
        form.append(resolve(part.key), await this.fileOf(part), part.fileName);
      }
    }
    return { data: form };
  }

  private async binaryFile(binary: RequestBody["binary"]): Promise<SentBody> {
    if (!binary) {
      throw new SendBlockedError("Choose a file for the body, or set the body to None.");
    }
    const file = await this.fileOf(binary);
    return { data: file, contentType: binary.contentType || file.type || "application/octet-stream" };
  }

  private async fileOf(ref: FileRef): Promise<Blob> {
    const file = await this.files.read(ref.fileId);
    if (!file) {
      throw new SendBlockedError(`The file "${ref.fileName}" is not stored in this browser. Choose it again.`);
    }
    return file;
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
