import { Injectable, computed, effect, inject, type WritableSignal } from "@angular/core";
import {
  FORBIDDEN_METHODS,
  RAW_CONTENT_TYPES,
  VariableNestingError,
  VariableResolver,
  browserLimits,
  buildAuthHeaders,
  buildCurl,
  buildAuthQueryParam,
  credentialsOf,
  effectiveAuth,
  exportBody,
  isCredentialHeader,
  isHttpMethod,
  newId,
  parseEventStream,
  redactExport,
  resolveAuth,
  signV4,
  type Ancestor,
  type AuthConfig,
  type BrowserLimits,
  type CodeTarget,
  type Draft,
  type ExportBody,
  type ExportSource,
  type FileRef,
  type MultipartPart,
  type RedactOptions,
  type RequestBody,
  type RequestContent,
  type Row,
  type RunIteration,
  type RunOutcome,
  type ScopeStack,
  type StreamEvent,
} from "@wayfarer/core";
import { Idb } from "../data/idb";
import { RequestDoc } from "../models/collections";
import { PastRequest } from "../models/history";
import { TestResult } from "../models/test-assertion";
import { BridgeSettings } from "../services/bridge-settings";
import { CollectionsStore } from "../services/collections-store";
import { EnvironmentsStore } from "../services/environments-store";
import { RequestFiles } from "../services/request-files";
import {
  BuiltRequest,
  PreRequestScriptError,
  RequestExecutionResponse,
  RequestExecutionSpec,
  RequestExecutionResult,
  RequestExecutor,
  RequestSkipped,
  SendBlockedError,
  SendDeclinedError,
} from "../services/request-executor";
import { OAuthTokens } from "../services/oauth-tokens";
import { RequestSave } from "../services/request-save";
import { RequestSettings } from "../services/request-settings";
import { SecretsVault } from "../services/secrets-vault";
import { TransportRouter } from "../services/transport-router";
import { writeToClipboard } from "../shared/http/clipboard";
import {
  appendQueryParam,
  buildUrlFromParams,
  normalizeUrl,
  parseParamsFromUrl,
  validateUrl,
} from "../shared/http/request-url";
import { OAuthError, oauthTokenKey, scriptsOf, type OAuth2Auth } from "@wayfarer/core";
import { ScriptTrust } from "../services/script-trust";
import { Confirm } from "../ui/confirm";
import { SHOWN_EVENTS, TabState, blankRow, contentOf, emptyDraft } from "./tab-state";
import { Tabs, forwarded, type Forwarded } from "./tabs";

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

/**
 * A body as it was sent, in the form an export writes: text and fields as
 * they went out (a vault secret in them is masked by the export), a file by
 * the name it was picked under.
 */
function sentExportBody(sent: BuiltRequest["body"], composed: RequestBody): ExportBody {
  if (sent === undefined) return { mode: "none" };
  if (typeof sent === "string") return composed.mode === "urlencoded" ? { mode: "urlencoded", fields: [...new URLSearchParams(sent)] } : { mode: "raw", text: sent };
  if (sent instanceof FormData) return { mode: "multipart", parts: [...sent].map(([name, value]) => (typeof value === "string" ? { name, value } : { name, fileName: value.name })) };
  return { mode: "binary", fileName: composed.binary?.fileName ?? "" };
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

/** A request as it was before its pre-request script ran: its address as composed, and the variables as they were. */
interface Composed {
  url: string;
  scopes: ScopeStack;
  /** In a run: the hosts the user has said yes to. A host is asked about once in a run. */
  accepted?: Set<string>;
}

/** What a run's requests share (P5.2): the variables as they were when the run started, and the hosts the user has said yes to. */
export interface RunSend {
  baseline: ScopeStack;
  acceptedHosts: Set<string>;
}

/** The host a request goes to: its name, and its port when that is not the scheme's own. An address that is no URL stands for itself. */
function hostOf(url: string, scopes: ScopeStack): string {
  const address = normalizeUrl(new VariableResolver(scopes).resolve(url.trim()));
  return URL.parse(address)?.host ?? address;
}

/** The `Content-Type` a body's mode implies, without reading a file: what a preflight is decided on. */
function bodyContentType(body: RequestBody): string | undefined {
  switch (body.mode) {
    case "raw":
      return body.raw?.text ? RAW_CONTENT_TYPES[body.raw.language] : undefined;
    case "urlencoded":
      return "application/x-www-form-urlencoded";
    case "multipart":
      return "multipart/form-data";
    case "binary":
      return body.binary?.contentType || "application/octet-stream";
    default:
      return undefined;
  }
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
  private readonly environments = inject(EnvironmentsStore);
  private readonly executor = inject(RequestExecutor);
  private readonly files = inject(RequestFiles);
  private readonly bridge = inject(BridgeSettings);
  private readonly collections = inject(CollectionsStore);
  private readonly saved = inject(RequestSave);
  private readonly vault = inject(SecretsVault);
  private readonly settings = inject(RequestSettings);
  private readonly router = inject(TransportRouter);
  private readonly trust = inject(ScriptTrust);
  private readonly confirm = inject(Confirm);
  private readonly oauthTokens = inject(OAuthTokens);
  private readonly tabs = inject(Tabs);

  /** A signal of the tab that is open (P5.1): every field below that is made with it is that tab's own. */
  private ofTab<T>(pick: (tab: TabState) => WritableSignal<T>): Forwarded<T> {
    return forwarded(() => pick(this.tabs.active()));
  }

  /** Whether the draft's scripts may run (`ScriptTrust`). */
  readonly scriptsAllowed = this.trust.allowed;
  /** The draft has a script that is waiting for the user's review. */
  readonly scriptsHeld = computed(() => !this.trust.allowed() && this.hasScripts(this.saved.ancestors(), this.draft()));
  /** The last send left the request's scripts out, for that reason. */
  readonly scriptsSkipped = this.ofTab((tab) => tab.scriptsSkipped);

  readonly draft = this.ofTab((tab) => tab.draft);

  readonly endpointError = this.ofTab((tab) => tab.endpointError);
  /** What a pasted cURL command asked for that the app does not do. Shown until the next send or the next request. */
  readonly pasteNotes = this.ofTab((tab) => tab.pasteNotes);
  readonly loadingState = this.ofTab((tab) => tab.loadingState);
  readonly variableTokens = this.ofTab((tab) => tab.variableTokens);
  readonly missingVariableKeys = this.ofTab((tab) => tab.missingVariableKeys);
  /** The variables without a value that held the last send back; the composer offers "Send anyway". */
  readonly unresolvedBlocked = this.ofTab((tab) => tab.unresolvedBlocked);

  readonly responseData = this.ofTab((tab) => tab.responseData);
  readonly responseError = this.ofTab((tab) => tab.responseError);
  readonly responseBodyIsJson = this.ofTab((tab) => tab.responseBodyIsJson);
  readonly responseHeadersView = this.ofTab((tab) => tab.responseHeadersView);
  readonly responseStatusCode = this.ofTab((tab) => tab.responseStatusCode);
  readonly responseStatusText = this.ofTab((tab) => tab.responseStatusText);
  readonly responseIsError = this.ofTab((tab) => tab.responseIsError);
  readonly responseTab = this.ofTab((tab) => tab.responseTab);
  readonly responseContentLength = this.ofTab((tab) => tab.responseContentLength);
  readonly responseBinary = this.ofTab((tab) => tab.responseBinary);
  readonly responseRedirectedTo = this.ofTab((tab) => tab.responseRedirectedTo);
  readonly responseRedirects = this.ofTab((tab) => tab.responseRedirects);
  readonly responseContentType = this.ofTab((tab) => tab.responseContentType);
  readonly responseHeadersLimited = this.ofTab((tab) => tab.responseHeadersLimited);
  readonly responseInspection = this.ofTab((tab) => tab.inspection);
  readonly responseExportContext = this.ofTab((tab) => tab.responseExportContext);
  readonly lastTestResults = this.ofTab((tab) => tab.lastTestResults);
  /** The console output of the last send's scripts. */
  readonly lastScriptLogs = this.ofTab((tab) => tab.lastScriptLogs);
  /** How long the last send's scripts and its request took, each by itself. */
  readonly lastTimings = this.ofTab((tab) => tab.lastTimings);
  /** The events of the open tab's response, when it is an event stream (P5.6). */
  readonly streamEvents = this.ofTab((tab) => tab.streamEvents);
  readonly streamCount = this.ofTab((tab) => tab.streamCount);
  readonly streamNote = this.ofTab((tab) => tab.streamNote);

  /**
   * Where a `{{variable}}` of the draft gets its value: the active
   * environment, then the folders the request was opened from (the nearest
   * first), then its collection, then the globals. A request not saved yet
   * has no collection.
   */
  private readonly scopes = computed<ScopeStack>(() => this.scopesOf(this.tabs.active()));

  /** The same for `tab`, open or not: a send reads its own tab's (session 5B). */
  private scopesOf(tab: TabState): ScopeStack {
    const [collection, ...folders] = this.saved.ancestorsFor(tab.bound());
    return {
      environment: this.environments.activeEnvironment()?.vars,
      // The outermost folder's rows first: a later row wins, so the nearest folder does.
      folder: folders.flatMap((folder) => folder.variables),
      collection: collection?.variables,
      global: this.environments.globals(),
      // A request of a run: the row of the run's data file (P5.2).
      ...(tab.iteration && { data: tab.iteration.data }),
    };
  }
  /** What the draft's auth is when it inherits, and from where (P4.9). */
  readonly inheritedAuth = computed(() => effectiveAuth({ type: "inherit" }, this.saved.ancestors()));
  /**
   * What the browser will do to the draft if it is sent now (plan P2.14):
   * the headers it drops, whether it asks the server first, mixed content.
   * Worked out from the draft as text: no secret is read and no file.
   */
  readonly browserLimits = computed<BrowserLimits>(() => {
    const draft = this.draft();
    const resolver = new VariableResolver(this.scopes());
    const resolve = (text: string): string => {
      try {
        return resolver.resolve(text);
      } catch (error) {
        // Variables in a circle: the send says so. Here the text stands as written.
        if (!(error instanceof VariableNestingError)) throw error;
        return text;
      }
    };
    const headers = [...sentHeaders(draft.headers), ...Object.entries(buildAuthHeaders(resolveAuth(this.sentAuth(draft.auth, this.tabs.active()), resolve)))].map(
      ([name, value]): [string, string] => [resolve(name), resolve(value)]
    );
    const contentType = isBodyMethod(draft.method) ? bodyContentType(draft.body) : undefined;
    if (contentType && !headers.some(([name]) => name.toLowerCase() === "content-type")) {
      headers.push(["Content-Type", contentType]);
    }
    const url = draft.url.trim();
    return browserLimits({ method: draft.method, url: url ? normalizeUrl(resolve(url)) : "", headers }, { origin: location.origin, route: this.router.route() });
  });

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
      this.streamEvents().length > 0 ||
      this.responseStatusCode() !== undefined ||
      !!this.responseData() ||
      !!this.responseError() ||
      this.responseHeadersView().length > 0 ||
      // A pre-request script that failed: there is no response, and there is what the script wrote.
      this.lastTestResults().length > 0
    );
  }

  patch(change: Partial<Draft>): void {
    this.draft.update((draft) => ({ ...draft, ...change }));
  }

  /** The draft as it is saved: raw, with literal `{{var}}` text. */
  snapshot(): RequestContent {
    return contentOf(this.draft());
  }

  /**
   * A row of the draft was edited in place (a form field, a part, an
   * assertion). The draft is replaced (its rows are not), so that what
   * follows the draft, the tab's unsaved mark among it, sees the change.
   */
  edited(): void {
    this.patch({});
    this.refreshVariablePreview();
  }

  /** Whether the route that follows redirects itself (the Local Bridge) follows this request's (P5.4). Following is the default and is not written down. */
  setFollowRedirects(follow: boolean): void {
    const { followRedirects: _was, ...settings } = this.draft().settings;
    this.patch({ settings: follow ? settings : { ...settings, followRedirects: false } });
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
    this.pasteNotes.set([]);
    this.unresolvedBlocked.set([]);
  }

  /** Shows the response a history entry recorded, in the open tab. */
  showRecorded(entry: PastRequest): void {
    this.tabs.active().showRecorded(entry);
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
   * Sends the open tab's draft. Resolves to true when the exchange was
   * recorded in history. `allowUnresolved` sends a `{{variable}}` that has no
   * value as that text: the user chose "Send anyway".
   *
   * The send holds its tab (session 5B): from here to its last step it reads
   * and writes `tab`, never "the open tab", which may be another by then.
   */
  async send(options: { allowUnresolved?: boolean; /** Reconnects an event stream: sent as `Last-Event-ID` (P5.6). */ lastEventId?: string } = {}): Promise<boolean> {
    const tab = this.tabs.active();
    tab.endpointError.set("");
    tab.pasteNotes.set([]);
    tab.unresolvedBlocked.set([]);
    tab.resetResponse();
    tab.lastTestResults.set([]);
    tab.lastScriptLogs.set([]);
    tab.lastTimings.set(null);
    tab.scriptsSkipped.set(false);

    const refusal = this.refusal(tab);
    if (refusal) {
      tab.endpointError.set(refusal);
      return false;
    }

    tab.loadingState.set(true);
    const controller = new AbortController();
    tab.inFlight = controller;

    // A reconnect names the last event it has, as a browser's EventSource does. `assemble` puts it in as it is.
    tab.lastEventId = options.lastEventId;
    let result: RequestExecutionResult;
    try {
      result = await this.exchange(tab, {
        allowUnresolved: options.allowUnresolved ?? false,
        signal: controller.signal,
        // An event stream is shown as it arrives (P5.6). The tab's list is the newest events; the count is all of them.
        onEvent: (event) => {
          tab.streamEvents.update((events) => [...events.slice(1 - SHOWN_EVENTS), event]);
          tab.streamCount.update((count) => count + 1);
          tab.responseTab.set("events");
        },
      });
    } catch (error) {
      tab.loadingState.set(false);
      // Variables that refer to each other in a circle: nothing is sent.
      if (error instanceof SendBlockedError || error instanceof VariableNestingError) {
        if (error instanceof PreRequestScriptError) {
          // There is no response. The Tests tab has what the script did before it failed.
          tab.lastTestResults.set(error.testResults);
          tab.lastScriptLogs.set(error.scriptLogs);
          tab.lastTimings.set(error.timings);
          tab.responseTab.set("tests");
        }
        tab.endpointError.set(error.message);
        tab.unresolvedBlocked.set(error instanceof UnresolvedVariablesError ? error.names : []);
        return false;
      }
      throw error;
    }

    tab.loadingState.set(false);
    tab.lastTestResults.set(result.testResults);
    tab.lastScriptLogs.set(result.scriptLogs);
    tab.lastTimings.set(result.timings);
    tab.inspection.set(result.inspection);
    this.applyExecutionResponse(tab, result.response);
    this.applyStream(tab, result);
    // Where the response is kept: a reload shows it again from there (P5.1).
    tab.historyKey.set((await this.idb.add(result.history, this.settings.historyCap())) ?? undefined);
    return true;
  }

  /** `text` with `tab`'s variables replaced. The vault is not read: a secret's reference stays as written. Throws `VariableNestingError`. */
  resolvePlain(tab: TabState, text: string): string {
    return new VariableResolver(this.scopesOf(tab)).resolve(text);
  }

  /** Why `tab`'s request cannot be sent as it is written, or "" when it can: no address, no method, an address that is no URL. */
  private refusal(tab: TabState): string {
    const { url, method } = tab.draft();
    if (!url) return "Endpoint is a Required value";
    const methodError = this.methodError(method);
    if (methodError) return methodError;
    try {
      return validateUrl(new VariableResolver(this.scopesOf(tab)).resolve(url.trim())) ? "" : "Please enter a valid URL";
    } catch (error) {
      if (!(error instanceof VariableNestingError)) throw error;
      return error.message;
    }
  }

  /**
   * One exchange for `tab`: its scripts checked and run, its request built
   * and sent. A send and a request of a run are both this. Throws what
   * `RequestExecutor.execute` throws.
   */
  private async exchange(tab: TabState, options: { allowUnresolved: boolean; signal: AbortSignal; run?: RunSend; onEvent?: (event: StreamEvent) => void }): Promise<RequestExecutionResult> {
    const draft = tab.draft();
    // What the request inherits, read once: these are the scripts that are checked, and the ones that run.
    const inherited = this.saved.ancestorsFor(tab.bound());
    // Asked of what is stored now, not of a signal that may be a moment behind.
    const allowed = this.trust.check(inherited, tab);
    const runScripts = allowed instanceof Promise ? await allowed : allowed;
    tab.scriptsSkipped.set(!runScripts && this.hasScripts(inherited, draft));
    // What a pre-request script may move the request away from (plan Q6): the request before the first of them, an inherited one included.
    // In a run it is the request under the variables the run started with: a script of an earlier request may have set the host of this one (C-053).
    const composed: Composed | undefined = options.run
      ? { url: draft.url, scopes: { ...options.run.baseline, folder: this.scopesOf(tab).folder, data: tab.iteration?.data }, accepted: options.run.acceptedHosts }
      : runScripts && [...inherited, draft].some((holder) => holder.scripts.pre.trim())
        ? { url: draft.url, scopes: this.scopesOf(tab) }
        : undefined;
    return this.executor.execute({
      runScripts,
      preRequestScript: draft.scripts.pre,
      postRequestScript: draft.scripts.post,
      tests: draft.tests,
      template: contentOf(tab.draft()),
      buildRequest: (request) => this.buildRequestForExecution(tab, request, options.allowUnresolved, composed),
      ...(options.onEvent && { onEvent: options.onEvent }),
      retryUnauthorized: (request) => this.withRenewedToken(tab, request, options.allowUnresolved),
      signal: options.signal,
      inherited,
      folderVariables: () => this.scopesOf(tab).folder ?? [],
      ...(tab.iteration && { iteration: tab.iteration }),
      ...this.scriptBinding(tab),
    });
  }

  /** The variables as they stand now, for a run of `collectionId` that is about to start, and the hosts the user has said yes to in it: none yet. */
  startRun(collectionId: string): RunSend {
    return {
      baseline: {
        environment: this.environments.activeEnvironment()?.vars,
        collection: this.collections.tree().find((entry) => entry.collection.meta.id === collectionId)?.collection.variables,
        global: this.environments.globals(),
      },
      acceptedHosts: new Set(),
    };
  }

  /**
   * Sends one saved request as a request of a collection run (P5.2), from a
   * tab of its own that is in no strip: with the scripts, the trust gate,
   * the vault and the wire check of a send, and nothing written to history.
   * Says how it went in the run's words, with the exchange as history would
   * have kept it (masked), for the run's HAR.
   */
  async sendForRun(doc: RequestDoc, iteration: RunIteration, signal: AbortSignal, run: RunSend): Promise<{ outcome: RunOutcome; exchange?: PastRequest; scriptsSkipped: boolean }> {
    const tab = new TabState();
    tab.draft.set({ ...structuredClone(doc), params: parseParamsFromUrl(doc.url) });
    tab.bound.set(doc);
    tab.iteration = iteration;
    const controller = new AbortController();
    signal.addEventListener("abort", () => controller.abort());
    tab.inFlight = controller;
    const tests = (rows: TestResult[]): RunOutcome["tests"] => rows.map((row) => ({ name: row.label, passed: row.passed, ...(row.error !== undefined && { error: row.error }) }));
    const said = (outcome: RunOutcome, exchange?: PastRequest) => ({ outcome, exchange, scriptsSkipped: tab.scriptsSkipped() });

    const refusal = this.refusal(tab);
    if (refusal) return said({ error: refusal, tests: [] });
    try {
      const result = await this.exchange(tab, { allowUnresolved: false, signal: controller.signal, run });
      const { response } = result;
      // No status, or the browser's 0: no response arrived, and the text says why.
      const failed = !response.statusCode;
      return said(
        {
          ...(response.statusCode !== undefined && { status: response.statusCode }),
          ...(response.statusText && { statusText: response.statusText }),
          durationMs: result.durationMs,
          ...(failed && { error: response.errorText }),
          tests: tests(result.testResults),
          ...(result.nextRequest !== undefined && { nextRequest: result.nextRequest }),
        },
        result.history
      );
    } catch (error) {
      if (error instanceof RequestSkipped) return said({ skipped: true, tests: tests(error.testResults), ...(error.nextRequest !== undefined && { nextRequest: error.nextRequest }) });
      if (error instanceof SendDeclinedError) return said({ error: error.message, tests: [], end: "You chose not to send a request with a vault secret to a host a script had changed." });
      if (error instanceof PreRequestScriptError) return said({ error: error.message, tests: tests(error.testResults) });
      if (error instanceof SendBlockedError || error instanceof VariableNestingError) return said({ error: error.message, tests: [] });
      throw error;
    }
  }

  /** What a script is told of the saved request in the composer, and the collection whose variables it may read and change. */
  private scriptBinding(tab: TabState): Partial<Pick<RequestExecutionSpec, "info" | "collection">> {
    const bound = tab.bound();
    if (!bound) return {};
    const { collectionId } = bound;
    return {
      info: { requestName: bound.name, requestId: bound.meta.id },
      collection: {
        variables: () => this.collections.tree().find((entry) => entry.collection.meta.id === collectionId)?.collection.variables ?? [],
        change: (changes) => this.collections.changeCollectionVariables(collectionId, changes),
      },
    };
  }

  /** `draft`, or something it inherits from, has a script. */
  private hasScripts(inherited: Ancestor[], draft: Draft): boolean {
    return [...inherited, draft].some((holder) => scriptsOf(holder).length > 0);
  }

  /** The auth that is sent for `auth` from `tab`: itself, or what the tab's saved request inherits. */
  private sentAuth(auth: AuthConfig, tab: TabState): AuthConfig {
    return effectiveAuth(auth, this.saved.ancestorsFor(tab.bound())).auth;
  }

  /**
   * The OAuth 2.0 auth the draft is sent with, its own or inherited, and the
   * name its token is kept under (`oauthTokenKey`): made with the variables
   * replaced and no vault secret read, so the name holds none.
   */
  readonly oauth = computed<{ auth: OAuth2Auth; key: string } | null>(() => this.oauthOf(this.draft().auth, this.tabs.active()));

  private oauthOf(own: AuthConfig, tab: TabState): { auth: OAuth2Auth; key: string } | null {
    const auth = this.sentAuth(own, tab);
    if (auth.type !== "oauth2") return null;
    const probe = new VariableResolver(this.scopesOf(tab));
    try {
      return { auth, key: oauthTokenKey(resolveAuth(auth, (text) => probe.resolve(text))) };
    } catch (error) {
      // Variables that refer to each other: the send says so. Such an auth has no token.
      if (!(error instanceof VariableNestingError)) throw error;
      return null;
    }
  }

  /**
   * Gets a token for the draft's OAuth 2.0 auth because the user asked
   * (P4.7): the auth's variables and vault secrets are read as a send reads
   * them, and a variable without a value stops it. Throws an `OAuthError` or
   * a `SendBlockedError` whose message says why there is no token.
   */
  async getOAuthToken(): Promise<void> {
    const oauth = this.oauth();
    if (!oauth) return;
    const probe = new VariableResolver(this.scopes());
    resolveAuth(oauth.auth, (text) => probe.resolve(text));
    const secrets = probe.lockedSecrets.size ? await this.readSecrets([...probe.lockedSecrets]) : new Map<string, string>();
    const resolver = new VariableResolver(this.scopes(), (id) => secrets.get(id));
    const auth = resolveAuth(oauth.auth, (text) => resolver.resolve(text));
    if (resolver.unresolved.size) throw new OAuthError(`${[...resolver.unresolved].map((name) => `{{${name}}}`).join(", ")} ${resolver.unresolved.size === 1 ? "has" : "have"} no value. No token was asked for.`);
    await this.oauthTokens.get(auth, oauth.key);
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

  /** Sends the open tab's request again as a reconnect of its event stream: with the last id the stream gave, as `Last-Event-ID`. */
  reconnect(): Promise<boolean> {
    const lastEventId = [...this.tabs.active().streamEvents()].reverse().find((event) => event.id)?.id;
    return this.send(lastEventId === undefined ? {} : { lastEventId });
  }

  /** Gives up on the request in flight. The send then ends with "cancelled" instead of a response. */
  cancel(): void {
    this.tabs.active().inFlight?.abort();
  }

  /**
   * Copies the draft as a cURL command, with its body in every mode: a
   * file is named, not read. Credentials are masked unless the user asks
   * for them. A vault secret is never read for this: its `{{$secret.…}}`
   * reference stays as written.
   */
  async copyAsCurl(options: RedactOptions = {}): Promise<void> {
    const source = this.exportSource();
    if (source) await writeToClipboard(buildCurl(redactExport(source, options)));
  }

  /**
   * Copies the draft as code for `target`, masked as the cURL command is.
   * The generators are fetched the first time code is asked for.
   */
  async copyAsCode(target: CodeTarget): Promise<void> {
    const source = this.exportSource();
    if (!source) return;
    const { generateCode } = await import("@wayfarer/core/codegen");
    await writeToClipboard(generateCode(target, redactExport(source)));
  }

  /** The draft as it would be built now, for an export: nothing is read from the vault or from a file. */
  private exportSource(): ExportSource | null {
    const endpoint = this.draft().url;
    if (!endpoint) return null;
    const content = this.snapshot();
    const resolver = new VariableResolver(this.scopes());
    try {
      const body = exportBody(content.body, content.method, (text) => resolver.resolve(text));
      // The type the body's mode implies, as a send adds it. A multipart form has none: its sender writes the boundary.
      const contentType = body.mode === "none" || body.mode === "multipart" || (body.mode === "raw" && !body.text) ? undefined : bodyContentType(content.body);
      const built = this.assemble(this.tabs.active(), endpoint, content, contentType ? { data: "", contentType } : undefined, resolver);
      return { method: built.method, url: built.url, headers: built.headers, body, secrets: built.secrets, credentials: built.credentials };
    } catch (error) {
      if (!(error instanceof VariableNestingError)) throw error;
      this.endpointError.set(error.message);
      return null;
    }
  }

  refreshVariablePreview(): void {
    const environmentId = this.environments.activeEnvironment()?.meta.id;
    const scopes = this.scopes();
    const { url: endpoint, headers } = this.draft();
    const body = bodyTexts(this.draft().body);
    // The variables' values are part of it: editing a value must refresh a
    // preview computed before the edit.
    const fingerprint = JSON.stringify({ endpoint, headers, body, environmentId, scopes });
    const tab = this.tabs.active();
    if (fingerprint === tab.previewFingerprint) {
      return;
    }
    tab.previewFingerprint = fingerprint;
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
  private buildRequestForExecution(tab: TabState, content: RequestContent, allowUnresolved: boolean, composed?: Composed, renewToken = false): BuiltRequest | Promise<BuiltRequest> {
    const built = this.resolveRequest(tab, content, allowUnresolved, composed, renewToken);
    return built instanceof Promise ? built.then((request) => this.recordForExport(tab, request, content)) : this.recordForExport(tab, built, content);
  }

  /**
   * The request built again with a renewed OAuth 2.0 token, for the one more
   * send a 401 gets when the auth asks for it. `null` when the auth does not,
   * or when no token could be had: the 401 is then the response.
   */
  private async withRenewedToken(tab: TabState, content: RequestContent, allowUnresolved: boolean): Promise<BuiltRequest | null> {
    const auth = this.sentAuth(content.auth, tab);
    if (auth.type !== "oauth2" || !auth.retryOn401) return null;
    try {
      return await this.buildRequestForExecution(tab, content, allowUnresolved, undefined, true);
    } catch (error) {
      if (!(error instanceof SendBlockedError)) throw error;
      return null;
    }
  }

  private recordForExport(tab: TabState, request: BuiltRequest, content: RequestContent): BuiltRequest {
    const id = newId();
    tab.responseExportContext.set({
      id,
      method: request.method,
      url: request.url,
      headers: Object.fromEntries(request.headers),
      body: textOf(request.body),
      exportBody: sentExportBody(request.body, content.body),
      secrets: request.secrets,
      credentials: request.credentials,
    });
    tab.draft.update((draft) => ({ ...draft, responseId: id }));
    return request;
  }

  /**
   * `content` (the draft, as a pre-request script may have changed it) with
   * `{{var}}` placeholders substituted, as it is transmitted. The editors
   * keep the literal template.
   *
   * `composed` is the request before its pre-request script ran. When the
   * script left it going to another host and it uses a vault secret, the
   * user is asked before the vault is read (plan Q6). One send is compared:
   * a variable a script set in an earlier send is not seen here.
   */
  private resolveRequest(tab: TabState, content: RequestContent, allowUnresolved: boolean, composed?: Composed, renewToken = false): BuiltRequest | Promise<BuiltRequest> {
    const endpointText = content.url;
    // Read at each use: a pre-request script, or a vault unlock, may have come between.
    const scopes = () => this.scopesOf(tab);
    // First without the vault: this pass says which secrets the request needs.
    const probe = new VariableResolver(scopes());
    for (const text of [endpointText, ...sentHeaders(content.headers).flat(), ...bodyTexts(content.body)]) {
      probe.resolve(text);
    }
    // Every field of the auth that is sent, not its credentials alone: a username or an access key may be a secret too (F81).
    resolveAuth(this.sentAuth(content.auth, tab), (text) => probe.resolve(text));
    const checked = (resolver: VariableResolver): BuiltRequest | Promise<BuiltRequest> => {
      const built = this.build(tab, endpointText, content, resolver, renewToken);
      const check = (request: BuiltRequest): BuiltRequest => {
        if (resolver.unresolved.size && this.settings.blockUnresolved() && !allowUnresolved) {
          throw new UnresolvedVariablesError([...resolver.unresolved]);
        }
        return request;
      };
      return built instanceof Promise ? built.then(check) : check(built);
    };
    // Nothing to read from the vault: the request is built at once, in the same task as the click.
    if (!probe.lockedSecrets.size) return checked(new VariableResolver(scopes()));
    const withSecrets = () => this.readSecrets([...probe.lockedSecrets]).then((secrets) => checked(new VariableResolver(scopes(), (id) => secrets.get(id))));
    const from = composed && hostOf(composed.url, composed.scopes);
    const to = hostOf(endpointText, scopes());
    if (from === undefined || from === to || composed?.accepted?.has(to)) return withSecrets();
    return this.confirm
      .confirm({
        title: "Send to a different host?",
        message: composed?.accepted
          ? `A script of this run changed where "${tab.bound()?.name ?? "this request"}" goes: from ${from} to ${to}. The request uses a vault secret, which would be sent there. Yes holds for ${to} until the run ends.`
          : `The pre-request script changed where this request goes: from ${from} to ${to}. The request uses a vault secret, which would be sent there.`,
        acceptLabel: "Send",
        rejectLabel: "Don't send",
      })
      .then((accepted) => {
        if (!accepted) throw new SendDeclinedError("The request was not sent, and what the pre-request script set was undone.");
        composed?.accepted?.add(to);
        return withSecrets();
      });
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
  private build(tab: TabState, endpointText: string, content: RequestContent, resolver: VariableResolver, renewToken = false): BuiltRequest | Promise<BuiltRequest> {
    const resolve = (text: string): string => resolver.resolve(text);
    const auth = resolveAuth(this.sentAuth(content.auth, tab), resolve);
    // Read before anything else is resolved: these are the auth's own.
    const withoutValue = [...resolver.unresolved];
    const sent = isBodyMethod(content.method) ? this.resolveBody(content.body, resolve) : undefined;
    const finish = (body: SentBody | undefined, token?: string): BuiltRequest | Promise<BuiltRequest> => this.sign(this.assemble(tab, endpointText, content, body, resolver, token), auth);
    const oauth = auth.type === "oauth2" ? this.oauthOf(content.auth, tab) : null;
    if (auth.type !== "oauth2" || !oauth) return sent instanceof Promise ? sent.then((body) => finish(body)) : finish(sent);
    // A token is not asked for with a variable's name where its value should be, whatever "Send anyway" says of the request itself.
    if (withoutValue.length) {
      throw new SendBlockedError(`The OAuth 2.0 auth uses ${withoutValue.map((name) => `{{${name}}}`).join(", ")}, which ${withoutValue.length === 1 ? "has" : "have"} no value. No token was asked for, and nothing was sent.`);
    }
    // OAuth 2.0 (P4.7): the token held, or a renewed one. Fetched before the request is put together, and never by a copy or an export.
    const token = this.oauthTokens.tokenFor(auth, oauth.key, { renew: renewToken, signal: tab.inFlight?.signal }).catch((error: unknown) => {
      throw error instanceof OAuthError ? new SendBlockedError(`${error.message} Nothing was sent.`) : error;
    });
    return Promise.all([sent, token]).then(([body, value]) => finish(body, value));
  }

  /**
   * AWS Signature Version 4 (P4.8), last of all: it signs the address, the
   * headers and the body as they will be sent. Signed besides `Host` and the
   * signer's own headers: `Content-Type` and any `x-amz-` header the request
   * sets. The hashes are WebCrypto's, which a page has only when it is
   * served over https or from localhost.
   */
  private sign(built: BuiltRequest, auth: AuthConfig): BuiltRequest | Promise<BuiltRequest> {
    if (auth.type !== "awsv4" || !URL.canParse(built.url)) return built;
    if (built.body instanceof FormData) {
      throw new SendBlockedError("AWS Signature cannot sign a multipart form: the browser writes the form's boundary as it sends, so the app does not have the bytes to sign. Send a file as a File body, or the fields as a URL-encoded form. Nothing was sent.");
    }
    if (!globalThis.crypto?.subtle) throw new SendBlockedError("AWS Signature needs the browser's cryptography, which a page has only over https or from localhost. Nothing was sent.");
    const add = async (body: string | Uint8Array | undefined): Promise<BuiltRequest> => {
      const own = built.headers.filter(([name]) => /^(content-type$|x-amz-)/i.test(name));
      const { headers: signature } = await signV4({ method: built.method, url: built.url, headers: own, body }, auth, new Date());
      const replaced = new Set(signature.map(([name]) => name.toLowerCase()));
      return {
        ...built,
        headers: [...built.headers.filter(([name]) => !replaced.has(name.toLowerCase())), ...signature],
        // The signature's header too: a server may send it back.
        credentials: [...built.credentials, ...signature.filter(([name]) => isCredentialHeader(name)).map(([, value]) => value)],
      };
    };
    if (built.body instanceof Blob) return built.body.arrayBuffer().then((bytes) => add(new Uint8Array(bytes)));
    return add(built.body);
  }

  private assemble(
    tab: TabState,
    endpointText: string,
    content: RequestContent,
    sent: SentBody | undefined,
    resolver: VariableResolver,
    /** An OAuth 2.0 token fetched for this send. It goes in as it is: a token is not a template. */
    token?: string
  ): BuiltRequest {
    const resolve = (text: string): string => resolver.resolve(text);
    const auth = resolveAuth(this.sentAuth(content.auth, tab), resolve);
    // One value per name, whatever its case, the later one winning: the auth
    // header replaces a row of the same name. A Map keeps a name such as
    // "__proto__" as data (F56).
    const byName = new Map<string, [string, string]>();
    for (const [key, value] of [...sentHeaders(content.headers), ...Object.entries(buildAuthHeaders(auth))]) {
      const name = resolve(key);
      byName.set(name.toLowerCase(), [name, resolve(value)]);
    }
    if (token) byName.set("authorization", ["Authorization", `Bearer ${token}`]);
    // The id of an event is the server's text, not a template: a `{{variable}}` in it is not replaced, or a server could name one and be sent its value.
    if (tab.lastEventId !== undefined) byName.set("last-event-id", ["Last-Event-ID", tab.lastEventId]);
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
      // An OAuth 2.0 token is kept like a vault secret and masked like one: in history, in every export, and in what a script is shown.
      secrets: [...resolver.taint, ...(token ? [token] : [])],
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

  /** What the Events tab shows of a response that was an event stream (P5.6), and what there is to say of it. */
  private applyStream(tab: TabState, result: RequestExecutionResult): void {
    const { response } = result;
    if (!/^text\/event-stream\b/i.test(response.contentType ?? "")) return;
    const notes: string[] = [];
    if (!response.stream) {
      // The route gave the body whole (the Local Bridge relays a response when it has ended): its events are read from it now.
      const events = parseEventStream(response.dataText || response.errorText);
      tab.streamEvents.set(events.slice(-SHOWN_EVENTS));
      tab.streamCount.set(events.length);
      if (result.history.route === "bridge") notes.push("Sent through the Local Bridge, which relays a response when it has ended: these events arrived together, and a stream that does not end is not shown.");
    }
    if (response.stream?.stopped) notes.push("You stopped the stream.");
    if (response.stream?.truncated) notes.push("The Body tab holds the first megabyte of the stream.");
    if (tab.streamCount() > tab.streamEvents().length) notes.push(`The list holds the newest ${tab.streamEvents().length} of ${tab.streamCount()} events.`);
    tab.streamNote.set(notes.join(" "));
    if (tab.streamCount()) tab.responseTab.set("events");
  }

  private applyExecutionResponse(tab: TabState, response: RequestExecutionResponse): void {
    tab.responseIsError.set(response.isError);
    tab.responseStatusCode.set(response.statusCode);
    tab.responseStatusText.set(response.statusText);
    tab.responseBodyIsJson.set(response.bodyIsJson);
    tab.responseHeadersView.set(response.headersView);
    tab.responseContentLength.set(response.contentLength);
    tab.responseBinary.set(response.binary ?? null);
    tab.responseRedirectedTo.set(response.redirectedTo);
    tab.responseRedirects.set(response.redirects);
    tab.responseContentType.set(response.contentType ?? "");
    tab.responseHeadersLimited.set(response.headersLimited ?? false);
    tab.responseTab.set("body");
    tab.responseData.set(response.dataText);
    tab.responseError.set(response.errorText);
  }
}
