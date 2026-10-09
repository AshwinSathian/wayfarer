import { Injectable, computed, effect, inject, signal } from "@angular/core";
import {
  FORBIDDEN_METHODS,
  RAW_CONTENT_TYPES,
  VariableNestingError,
  VariableResolver,
  emptyRequest,
  isCredentialHeader,
  isHttpMethod,
  newId,
  parseJson,
  type Draft,
  type AuthConfig,
  type FileRef,
  type MultipartPart,
  type RedactOptions,
  type RequestBody,
  type RequestContent,
  type Row,
  type ScopeStack,
} from "@wayfarer/core";
import { Idb } from "../data/idb";
import { PastRequest } from "../models/history";
import { TestResult } from "../models/test-assertion";
import { BridgeSettings } from "../services/bridge-settings";
import { CollectionsStore } from "../services/collections-store";
import { EnvironmentsStore } from "../services/environments-store";
import { RequestFiles } from "../services/request-files";
import {
  BuiltRequest,
  RequestExecutionResponse,
  RequestExecutionResult,
  RequestExecutor,
  SendBlockedError,
} from "../services/request-executor";
import { RequestSave } from "../services/request-save";
import { RequestSettings } from "../services/request-settings";
import { SecretsVault } from "../services/secrets-vault";
import { VariableToken } from "../services/variable-focus";
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
import { buildCurlCommand, redactedRequest } from "../shared/inspect/export";
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

/** A request that has a `{{variable}}` with no value, held back until the user says to send it as written (plan D3). */
export class UnresolvedVariablesError extends SendBlockedError {
  constructor(readonly names: string[]) {
    super(`${names.map((name) => `{{${name}}}`).join(", ")} ${names.length === 1 ? "has" : "have"} no value. The request was not sent.`);
  }
}

/** The credentials of an Auth tab, as resolved: what a redactor must look for besides vault secrets. */
function credentialsOf(auth: AuthConfig): string[] {
  switch (auth.type) {
    case "bearer":
      return [auth.token];
    case "basic":
      return [auth.password];
    case "apikey":
      return [auth.value];
    case "none":
      return [];
  }
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
  private readonly collections = inject(CollectionsStore);
  private readonly saved = inject(RequestSave);
  private readonly vault = inject(SecretsVault);
  private readonly settings = inject(RequestSettings);

  readonly draft = signal<Draft>(emptyDraft());

  readonly endpointError = signal("");
  readonly loadingState = signal(false);
  readonly variableTokens = signal<VariableToken[]>([]);
  readonly missingVariableKeys = signal<string[]>([]);
  /** The variables without a value that held the last send back; the composer offers "Send anyway". */
  readonly unresolvedBlocked = signal<string[]>([]);

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

  /**
   * Where a `{{variable}}` of the draft gets its value: the active
   * environment, then the collection the request was opened from, then the
   * globals. A request not saved yet has no collection.
   */
  private readonly scopes = computed<ScopeStack>(() => {
    const collectionId = this.saved.loadedCollectionRequest()?.collectionId;
    return {
      environment: this.environments.activeEnvironment()?.vars,
      collection: this.collections.tree().find((entry) => entry.collection.meta.id === collectionId)?.collection.variables,
      global: this.environments.globals(),
    };
  });
  private previewFingerprint = "";
  /** Aborts the send in flight. */
  private inFlight: AbortController | null = null;

  constructor() {
    // A change of environment, of the open request's collection or of a
    // variable anywhere goes through no method here, so the {{var}} preview
    // needs its own trigger.
    effect(() => {
      this.scopes();
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

  /** Replaces the draft with a saved request, or with the request a history entry was sent from. */
  load(request: RequestContent): void {
    this.draft.set({
      ...structuredClone(request),
      params: parseParamsFromUrl(request.url),
      responseId: this.draft().responseId,
    });
    this.endpointError.set("");
    this.unresolvedBlocked.set([]);
  }

  /** Shows the response a history entry recorded, as it is stored: masked, and without a body when none was kept. */
  showRecorded(entry: PastRequest): void {
    this.resetResponseState();
    this.lastTestResults.set([]);
    const response = entry.response;
    const text = response?.body?.text ?? "";
    const isError = !response || response.status < 200 || response.status >= 300;
    this.responseIsError.set(isError);
    this.responseStatusCode.set(response?.status);
    this.responseStatusText.set(response?.statusText);
    this.responseHeadersView.set((response?.headers ?? []).map(([name, value]) => ({ name, value })));
    this.responseBodyIsJson.set(!!text && parseJson(text).ok);
    this.responseData.set(isError ? "" : text);
    this.responseError.set(isError ? text || entry.error || "" : "");
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

  /**
   * Sends the draft. Resolves to true when the exchange was recorded in
   * history. `allowUnresolved` sends a `{{variable}}` that has no value as
   * that text: the user chose "Send anyway".
   */
  async send(options: { allowUnresolved?: boolean } = {}): Promise<boolean> {
    this.endpointError.set("");
    this.unresolvedBlocked.set([]);
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

    try {
      if (!validateUrl(new VariableResolver(this.scopes()).resolve(endpointText.trim()))) {
        this.endpointError.set("Please enter a valid URL");
        return false;
      }
    } catch (error) {
      if (!(error instanceof VariableNestingError)) throw error;
      this.endpointError.set(error.message);
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
        template: this.snapshot(),
        buildRequest: () => this.buildRequestForExecution(endpointText, options.allowUnresolved ?? false),
        signal: controller.signal,
      });
    } catch (error) {
      this.loadingState.set(false);
      // Variables that refer to each other in a circle: nothing is sent.
      if (error instanceof SendBlockedError || error instanceof VariableNestingError) {
        this.endpointError.set(error.message);
        this.unresolvedBlocked.set(error instanceof UnresolvedVariablesError ? error.names : []);
        return false;
      }
      throw error;
    }

    this.loadingState.set(false);
    this.lastTestResults.set(result.testResults);
    this.applyExecutionResponse(result.response);
    await this.idb.add(result.history, this.settings.historyCap());
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

  /**
   * Copies the draft as a cURL command. Credentials are masked unless the
   * user asks for them. A vault secret is never read for this: its
   * `{{$secret.…}}` reference stays as written.
   */
  async copyAsCurl(options: RedactOptions = {}): Promise<void> {
    const endpoint = this.draft().url;
    if (!endpoint) {
      return;
    }
    let request: BuiltRequest;
    try {
      // Awaited only when the body has a file to read.
      request = await this.build(endpoint, this.snapshot(), new VariableResolver(this.scopes()));
    } catch (error) {
      if (!(error instanceof VariableNestingError)) throw error;
      this.endpointError.set(error.message);
      return;
    }
    await writeToClipboard(
      // A file or a form has no text to quote: the command is written without a body.
      buildCurlCommand(redactedRequest({ ...request, headers: Object.fromEntries(request.headers), body: textOf(request.body) }, options))
    );
  }

  refreshVariablePreview(): void {
    const environmentId = this.environments.activeEnvironment()?.meta.id;
    const scopes = this.scopes();
    const { url: endpoint, headers } = this.draft();
    const body = bodyTexts(this.draft().body);
    // The variables' values are part of it: editing a value must refresh a
    // preview computed before the edit.
    const fingerprint = JSON.stringify({ endpoint, headers, body, environmentId, scopes });
    if (fingerprint === this.previewFingerprint) {
      return;
    }
    this.previewFingerprint = fingerprint;
    const tokens = new VariableResolver(scopes)
      .tokens({ url: endpoint, headers, body })
      .map((token) => (token.source === "environment" ? { ...token, environmentId } : token));
    this.variableTokens.set(tokens);
    this.missingVariableKeys.set(tokens.filter((token) => token.source === "missing").map((token) => token.key));
  }

  /**
   * Invoked by RequestExecutor *after* the pre-request script has run:
   * {{var}} resolution has to reflect any pm.environment.set() the script
   * just made, so it reads a fresh variable context.
   */
  private buildRequestForExecution(endpointText: string, allowUnresolved: boolean): BuiltRequest | Promise<BuiltRequest> {
    const built = this.resolveRequest(endpointText, allowUnresolved);
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
      secrets: request.secrets,
      credentials: request.credentials,
    });
    this.patch({ responseId: id });
    return request;
  }

  /**
   * The draft with `{{var}}` placeholders substituted, as it is transmitted
   * or exported as a runnable command. The editors keep the literal template.
   */
  private resolveRequest(endpointText: string, allowUnresolved: boolean): BuiltRequest | Promise<BuiltRequest> {
    const content = this.snapshot();
    // First without the vault: this pass says which secrets the request needs.
    const probe = new VariableResolver(this.scopes());
    for (const text of [endpointText, ...sentHeaders(content.headers).flat(), ...bodyTexts(content.body), ...credentialsOf(content.auth)]) {
      probe.resolve(text);
    }
    const checked = (resolver: VariableResolver): BuiltRequest | Promise<BuiltRequest> => {
      const built = this.build(endpointText, content, resolver);
      const check = (request: BuiltRequest): BuiltRequest => {
        if (resolver.unresolved.size && this.settings.blockUnresolved() && !allowUnresolved) {
          throw new UnresolvedVariablesError([...resolver.unresolved]);
        }
        return request;
      };
      return built instanceof Promise ? built.then(check) : check(built);
    };
    // Nothing to read from the vault: the request is built at once, in the same task as the click.
    return probe.lockedSecrets.size ? this.readSecrets([...probe.lockedSecrets]).then((secrets) => checked(new VariableResolver(this.scopes(), (id) => secrets.get(id)))) : checked(new VariableResolver(this.scopes()));
  }

  /**
   * The plaintext of the secrets a request refers to. A locked vault asks
   * for the passphrase first; when the user closes that dialog, nothing is
   * sent (plan D4). A secret the vault does not have is left out: its
   * reference then stays in the request, and the wire check refuses it.
   */
  private async readSecrets(ids: string[]): Promise<Map<string, string>> {
    if (!(await this.vault.ensureUnlocked())) {
      throw new SendBlockedError("This request uses a vault secret and the vault is locked. Unlock it to send. Nothing was sent.");
    }
    const secrets = new Map<string, string>();
    for (const id of ids) {
      const plaintext = await this.vault.readSecret(id);
      if (plaintext !== null) secrets.set(id, plaintext);
    }
    return secrets;
  }

  /** A promise only when a file has to be read: everything else is built at once. */
  private build(endpointText: string, content: RequestContent, resolver: VariableResolver): BuiltRequest | Promise<BuiltRequest> {
    const resolve = (text: string): string => resolver.resolve(text);
    const sent = isBodyMethod(content.method) ? this.resolveBody(content.body, resolve) : undefined;
    const finish = (body: SentBody | undefined): BuiltRequest => this.assemble(endpointText, content, body, resolver);
    return sent instanceof Promise ? sent.then(finish) : finish(sent);
  }

  private assemble(
    endpointText: string,
    content: RequestContent,
    sent: SentBody | undefined,
    resolver: VariableResolver
  ): BuiltRequest {
    const resolve = (text: string): string => resolver.resolve(text);
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
    return {
      method: content.method,
      url,
      headers,
      body: sent?.data,
      secrets: [...resolver.taint],
      // Also what a credential header carries, typed by hand or built from the Auth tab: a server may send it back.
      credentials: [...credentialsOf(auth), ...headers.filter(([name]) => isCredentialHeader(name)).map(([, value]) => value)].filter((value) => value),
    };
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
