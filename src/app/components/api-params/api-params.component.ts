import { CommonModule } from "@angular/common";
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Signal,
  effect,
  inject,
  signal,
  viewChild,
  output,
} from "@angular/core";
import { FormsModule, ReactiveFormsModule } from "@angular/forms";
import { AccordionModule } from "primeng/accordion";
import { ButtonModule } from "primeng/button";
import { ChipModule } from "primeng/chip";
import { DialogModule } from "primeng/dialog";
import { FloatLabelModule } from "primeng/floatlabel";
import { InputTextModule } from "primeng/inputtext";
import { ProgressSpinnerModule } from "primeng/progressspinner";
import { SelectModule } from "primeng/select";
import { SelectButtonModule } from "primeng/selectbutton";
import { SkeletonModule } from "primeng/skeleton";
import { TabsModule } from "primeng/tabs";
import { EnvironmentsService } from "src/app/services/environments.service";
import { IdbService } from "../../data/idb.service";
import { PastRequest } from "../../models/history.models";
import { AuthType, HttpAuthPlaceholder, RequestDoc } from "../../models/collections.models";
import { buildCurlCommand } from "../../shared/inspect/export.util";
import { JsonEditorComponent } from "../json-editor/json-editor.component";
import { ScriptEditorComponent } from "../script-editor/script-editor.component";
import { ApiParamsBasicComponent } from "./basic-editor/basic-editor.component";
import { AuthEditorComponent } from "./auth-editor/auth-editor.component";
import {
  ResponseExportContext,
  ResponseViewerComponent,
} from "../response-viewer/response-viewer.component";
import {
  ResponseInspectorService,
  ResponseInspection,
} from "../../shared/inspect/response-inspector.service";
import {
  VariableContext,
  VariableToken,
  collectVariableTokens,
  resolveTemplate,
} from "../../shared/environments/env-resolution.util";
import { VariableFocusService } from "../../services/variable-focus.service";
import {
  RequestExecutionService,
  RequestExecutionResponse,
  BuiltRequest,
} from "../../services/request-execution.service";
import { RequestSaveService, RequestContentSnapshot } from "../../services/request-save.service";
import {
  TestAssertion,
  TestResult,
  AssertionTarget,
  AssertionOperator,
} from "../../models/test-assertion.models";
import {
  appendEnabledParams,
  appendQueryParam,
  buildUrlFromParams,
  normalizeUrl,
  parseParamsFromUrl,
  validateUrl,
} from "../../shared/http/request-url.util";
import { buildAuthHeaders, buildAuthQueryParam } from "../../shared/http/request-auth.util";
import { writeToClipboard } from "../../shared/http/clipboard.util";
import {
  bodyObjectFromRows,
  isPlainObject,
  mergeHeaderRowsFromParsed,
  rowsFromObject,
  stringRecordFromRows,
} from "../../shared/http/key-value.util";
import {
  ASSERTION_TARGET_OPTIONS,
  needsExpected,
  needsKey,
  operatorsFor,
} from "../../shared/http/test-assertion-ui.util";

type EditorMode = "basic" | "json";
type ContextType = "Body" | "Headers";

@Component({
  selector: "app-api-params",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    ButtonModule,
    AccordionModule,
    SelectModule,
    SelectButtonModule,
    InputTextModule,
    ProgressSpinnerModule,
    TabsModule,
    FloatLabelModule,
    SkeletonModule,
    ChipModule,
    DialogModule,
    JsonEditorComponent,
    ScriptEditorComponent,
    ApiParamsBasicComponent,
    AuthEditorComponent,
    ResponseViewerComponent,
  ],
  templateUrl: "./api-params.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
// ~870 lines: this is the request composer's root — it already delegates
// everything with a real boundary: HTTP send/pre-post-script/assertion
// sequencing lives in RequestExecutionService, "bound to a collection
// request + Save/Save-As" lives in RequestSaveService, URL/param/auth/
// key-value transforms are pure functions in shared/http/*.util.ts, and the
// Params/Headers/Body and Auth tabs are their own child components
// (ApiParamsBasicComponent, AuthEditorComponent). What's left is the actual
// composer state machine (method/url/headers/body/params/auth/scripts/tests
// signals) plus the glue wiring template events to those services/utils —
// splitting it further (e.g. moving the signals themselves into a service)
// would mean the "current source of truth for what's in the composer"
// stops living on the composer component, which costs more in indirection
// than it saves in line count. See docs/plans/plan-specimen-modernization.md
// Part G for the rest of the file-size audit.
export class ApiParamsComponent {
  private readonly idbService = inject(IdbService);
  private readonly responseInspector = inject(ResponseInspectorService);
  private readonly environmentsService = inject(EnvironmentsService);
  private readonly variableFocus = inject(VariableFocusService);
  private readonly requestExecution = inject(RequestExecutionService);
  private readonly requestSave = inject(RequestSaveService);

  readonly newRequest = output<void>();

  readonly urlInputRef = viewChild<ElementRef<HTMLInputElement>>("urlInput");

  readonly endpoint = signal("");
  readonly selectedRequestMethod = signal<PastRequest["method"]>("GET");
  readonly requestMethods: { label: string; value: PastRequest["method"] }[] = [
    { label: "GET", value: "GET" },
    { label: "POST", value: "POST" },
    { label: "PUT", value: "PUT" },
    { label: "PATCH", value: "PATCH" },
    { label: "DELETE", value: "DELETE" },
    { label: "HEAD", value: "HEAD" },
    { label: "OPTIONS", value: "OPTIONS" },
  ];
  private readonly bodyCapableMethods = new Set<PastRequest["method"]>([
    "POST",
    "PUT",
    "PATCH",
  ]);
  private readonly defaultHeaderKey = "Content-Type";
  private readonly defaultHeaderValue = "application/json";
  readonly editorModeOptions: { label: string; value: EditorMode }[] = [
    { label: "Basic", value: "basic" },
    { label: "JSON", value: "json" },
  ];
  readonly editorMode = signal<EditorMode>("basic");
  readonly headersJsonText = signal("");
  readonly bodyJsonText = signal("{}");
  readonly headersJsonValid = signal(true);
  readonly bodyJsonValid = signal(true);
  readonly addItemFn: (ctx: ContextType) => void = (ctx) => this.addItem(ctx);
  readonly removeItemFn: (index: number, ctx: ContextType) => void = (index, ctx) =>
    this.removeItem(index, ctx);
  readonly isAddDisabledFn: (ctx: ContextType) => boolean = (ctx) =>
    this.isAddDisabled(ctx);
  readonly disableHeaderItemFn: (
    item: { key: string; value: unknown },
    index: number
  ) => boolean = (item: { key: string; value: unknown }) =>
    item.key === this.defaultHeaderKey;
  readonly disableBodyItemFn: (
    item: { key: string; value: unknown },
    index: number
  ) => boolean = () => false;

  readonly responseData = signal("");
  readonly responseError = signal("");
  readonly responseBodyIsJson = signal(false);
  readonly responseHeadersView = signal<{ name: string; value: string }[]>([]);
  readonly responseStatusCode = signal<number | undefined>(undefined);
  readonly responseStatusText = signal<string | undefined>(undefined);
  readonly responseIsError = signal(false);
  readonly responseTab = signal<"body" | "headers" | "timings" | "tests">("body");
  readonly responseContentLength = signal<number | undefined>(undefined);
  readonly responseInspection: Signal<ResponseInspection | null>;
  readonly responseExportContext = signal<ResponseExportContext | null>(null);
  readonly requestBody = signal<{ key: string; value: unknown }[]>([
    { key: "", value: "" },
  ]);
  readonly requestHeaders = signal<{ key: string; value: string }[]>([
    { key: this.defaultHeaderKey, value: this.defaultHeaderValue },
  ]);
  readonly endpointError = signal("");
  readonly loadingState = signal(false);
  readonly activeTab = signal("headers");
  readonly mobileActivePanels = signal<string[]>(["headers"]);
  /** Request-scoped variables (distinct from environment vars). Never mutated post-construction today — a hook for a future "request variables" UI. */
  private readonly requestVariables: Record<string, string> = {};
  readonly variableTokens = signal<VariableToken[]>([]);
  readonly missingVariableKeys = signal<string[]>([]);
  readonly highlightedVariableSource = signal<VariableToken["source"] | null>(null);
  readonly requestParams = signal<{ key: string; value: string; enabled: boolean }[]>([
    { key: "", value: "", enabled: true },
  ]);
  readonly requestAuth = signal<HttpAuthPlaceholder>({ type: "none" });
  readonly showAuthPassword = signal(false);
  readonly preRequestScript = signal("");
  readonly postRequestScript = signal("");
  readonly requestTests = signal<TestAssertion[]>([]);
  readonly lastTestResults = signal<TestResult[]>([]);
  readonly assertionTargetOptions = ASSERTION_TARGET_OPTIONS;
  private previewFingerprint = "";

  // "Bound to a saved collection request" + Save/Save-As state and
  // persistence all live in RequestSaveService now (see its own file) —
  // these are direct pass-throughs so the template doesn't need to change.
  readonly loadedCollectionRequest = this.requestSave.loadedCollectionRequest;
  readonly savingRequest = this.requestSave.savingRequest;
  readonly saveAsDialogVisible = this.requestSave.saveAsDialogVisible;
  readonly saveAsName = this.requestSave.saveAsName;
  readonly saveAsCollectionId = this.requestSave.saveAsCollectionId;
  readonly saveAsFolderId = this.requestSave.saveAsFolderId;
  readonly saveAsCollectionOptions = this.requestSave.saveAsCollectionOptions;
  readonly saveAsFolderOptions = this.requestSave.saveAsFolderOptions;

  constructor() {
    this.responseInspection = this.responseInspector.latest;
    this.syncMobilePanelsFromActiveTab();

    // Switching the active environment doesn't go through any local
    // mutation method (it's driven entirely by EnvironmentsService's
    // signal), so it needs its own reactive trigger for the {{var}} preview
    // rather than one of the explicit maybeUpdateVariablePreview() calls
    // below.
    effect(() => {
      this.environmentsService.activeEnvironment();
      this.maybeUpdateVariablePreview();
    });
  }

  addItem(ctx: ContextType) {
    if (ctx === "Body") {
      this.requestBody.update((items) => [...items, { key: "", value: "" }]);
    } else {
      this.requestHeaders.update((items) => [...items, { key: "", value: "" }]);
    }
    this.maybeUpdateVariablePreview();
  }

  isAddDisabled(ctx: ContextType) {
    const context = ctx === "Body" ? this.requestBody() : this.requestHeaders();

    if (context.length > 0) {
      const last = context[context.length - 1];
      if (last.key === "" || last.value === "") {
        return true;
      }
    }

    return false;
  }

  removeItem(index: number, ctx: ContextType) {
    if (ctx === "Body") {
      this.requestBody.update((items) => items.filter((_, i) => i !== index));
    } else {
      this.requestHeaders.update((items) => items.filter((_, i) => i !== index));
    }
    this.maybeUpdateVariablePreview();
  }

  focusUrl(): void {
    const el = this.urlInputRef()?.nativeElement;
    if (!el) {
      return;
    }
    el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    el.focus();
  }

  loadPastRequest(request: PastRequest) {
    // A History replay is never bound back to a collection request — even
    // if the composer was previously bound, replaying an older history
    // entry shouldn't silently overwrite whatever's saved in the
    // collection with different (possibly stale) content.
    this.requestSave.bind(null);
    this.onRequestMethodChange(request.method);
    this.endpoint.set(request.url);
    this.requestHeaders.set(rowsFromObject(request.headers));
    if (request.body && typeof request.body === "object") {
      this.requestBody.set(rowsFromObject(request.body as Record<string, unknown>));
      this.activeTab.set(this.isBodyMethod(request.method) ? "body" : "headers");
    } else {
      this.requestBody.set([{ key: "", value: "" }]);
      this.activeTab.set("headers");
    }
    this.syncParamsFromUrl(request.url);
    this.requestAuth.set({ type: "none" });
    this.showAuthPassword.set(false);
    this.syncMobilePanelsFromActiveTab();
    if (this.editorMode() === "json") {
      this.syncJsonEditorsFromState();
    }
    this.maybeUpdateVariablePreview();
  }

  /**
   * Loads a saved collection request into the composer *and* binds this
   * session to it, so a subsequent Save writes back in place instead of
   * prompting to create a new request. Unlike loadPastRequest (History,
   * which only ever carries method/url/headers/body), this preserves auth,
   * scripts, and tests — those previously got silently dropped on load
   * because the collection tree only ever emitted a lossy PastRequest.
   */
  loadCollectionRequest(doc: RequestDoc): void {
    this.requestSave.bind(doc);
    this.onRequestMethodChange(doc.method);
    this.endpoint.set(doc.url);
    this.requestHeaders.set(rowsFromObject(doc.headers ?? {}));
    if (doc.body && typeof doc.body === "object") {
      this.requestBody.set(rowsFromObject(doc.body as Record<string, unknown>));
      this.activeTab.set(this.isBodyMethod(doc.method) ? "body" : "headers");
    } else {
      this.requestBody.set([{ key: "", value: "" }]);
      this.activeTab.set("headers");
    }
    this.syncParamsFromUrl(doc.url);
    this.requestAuth.set(doc.auth ?? { type: "none" });
    this.showAuthPassword.set(false);
    this.preRequestScript.set(doc.preRequestScript ?? "");
    this.postRequestScript.set(doc.postRequestScript ?? "");
    this.requestTests.set(doc.tests ?? []);
    this.syncMobilePanelsFromActiveTab();
    if (this.editorMode() === "json") {
      this.syncJsonEditorsFromState();
    }
    this.maybeUpdateVariablePreview();
  }

  /** Explicit "start a new request" action — the only thing that clears the composer now that a successful Send no longer does. */
  clearComposer(): void {
    this.requestSave.bind(null);
    this.resetForm();
  }

  async saveCurrentRequest(): Promise<void> {
    await this.requestSave.save(this.buildContentSnapshot());
  }

  openSaveAsDialog(): void {
    this.requestSave.openSaveAsDialog();
  }

  closeSaveAsDialog(): void {
    this.requestSave.closeSaveAsDialog();
  }

  onSaveAsCollectionChange(collectionId: string | null): void {
    this.requestSave.onSaveAsCollectionChange(collectionId);
  }

  get isSaveAsDisabled(): boolean {
    return this.requestSave.isSaveAsDisabled;
  }

  async confirmSaveAs(): Promise<void> {
    await this.requestSave.confirmSaveAs(this.buildContentSnapshot());
  }

  private buildContentSnapshot(): RequestContentSnapshot {
    return {
      method: this.selectedRequestMethod(),
      url: this.endpoint(),
      headers: this.buildHeaders(),
      body: this.buildBody(),
      auth: this.requestAuth(),
      preRequestScript: this.preRequestScript(),
      postRequestScript: this.postRequestScript(),
      tests: this.requestTests(),
    };
  }

  async sendRequest() {
    this.endpointError.set("");
    this.resetResponseState();
    this.lastTestResults.set([]);

    const endpointText = this.endpoint();
    if (!endpointText) {
      this.endpointError.set("Endpoint is a Required value");
      return;
    }

    const resolvedForValidation = resolveTemplate(
      endpointText.trim(),
      this.buildVariableContext()
    );
    if (!validateUrl(resolvedForValidation)) {
      this.endpointError.set("Please enter a valid URL");
      return;
    }

    this.loadingState.set(true);

    const result = await this.requestExecution.execute({
      preRequestScript: this.preRequestScript(),
      postRequestScript: this.postRequestScript(),
      tests: this.requestTests(),
      buildRequest: () => this.buildRequestForExecution(endpointText),
    });

    this.loadingState.set(false);
    this.lastTestResults.set(result.testResults);
    this.applyExecutionResponse(result.response);
    await this.persistHistory(result.history);
  }

  /**
   * Invoked by RequestExecutionService *after* the pre-request script has
   * run — {{var}} resolution here has to reflect any pm.environment.set()
   * mutations the script just made (a common pattern: fetch/derive a token
   * in the pre-script, reference it via {{authToken}} in this same
   * request's own headers), so it re-reads a fresh variable context rather
   * than reusing the one captured for the earlier validation check.
   */
  private buildRequestForExecution(endpointText: string): BuiltRequest {
    const context = this.buildVariableContext();
    const method = this.selectedRequestMethod();
    const usesBody = this.isBodyMethod(method);
    const baseHeaders = this.resolveHeaders(this.buildHeaders(), context);
    const authHeaders = buildAuthHeaders(this.requestAuth());
    const headers = { ...baseHeaders, ...authHeaders };
    const body = usesBody ? this.resolveBody(this.buildBody(), context) : undefined;
    let url = appendEnabledParams(
      normalizeUrl(resolveTemplate(endpointText.trim(), context)),
      this.requestParams()
    );
    const authParam = buildAuthQueryParam(this.requestAuth());
    if (authParam) {
      url = appendQueryParam(url, authParam.key, authParam.value);
    }

    this.responseExportContext.set({
      id: this.createRequestId(),
      method,
      url,
      headers: { ...headers },
      body,
    });

    return { method, url, headers, body, usesBody };
  }

  private applyExecutionResponse(response: RequestExecutionResponse): void {
    this.responseIsError.set(response.isError);
    this.responseStatusCode.set(response.statusCode);
    this.responseStatusText.set(response.statusText);
    this.responseBodyIsJson.set(response.bodyIsJson);
    this.responseHeadersView.set(response.headersView);
    this.responseContentLength.set(response.contentLength);
    this.responseTab.set("body");
    this.responseData.set(response.dataText);
    this.responseError.set(response.errorText);
  }

  handleVariableChipClick(token: VariableToken): void {
    this.highlightedVariableSource.update((current) =>
      current === token.source ? null : token.source
    );
    if (token.source === "environment") {
      this.variableFocus.requestFocus(token);
    }
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
    this.responseTab.set("body");
    this.responseExportContext.set(null);
  }

  private createRequestId(): string {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
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

  onRequestMethodChange(method: PastRequest["method"]) {
    this.selectedRequestMethod.set(method);
    if (!this.isBodyMethod(method)) {
      this.activeTab.set("headers");
      this.requestBody.set([{ key: "", value: "" }]);
    }
    this.syncMobilePanelsFromActiveTab();
    if (this.editorMode() === "json") {
      this.syncJsonEditorsFromState();
    }
  }

  private buildVariableContext(): VariableContext {
    return {
      requestVars: this.requestVariables,
      environment: this.environmentsService.activeEnvironment(),
      globals: {},
    };
  }

  /** Raw (unresolved) headers straight from form state — literal `{{var}}` text intact. */
  private buildHeaders(): Record<string, string> {
    return stringRecordFromRows(this.requestHeaders());
  }

  /** Raw (unresolved) body straight from form state — literal `{{var}}` text intact. */
  private buildBody(): Record<string, unknown> | undefined {
    return bodyObjectFromRows(this.requestBody());
  }

  /**
   * Substitutes `{{var}}` placeholders into a raw headers/body/URL snapshot
   * right before it's actually transmitted (sendRequest) or exported as a
   * runnable command (copyAsCurl). Deliberately NOT applied when syncing the
   * JSON editor's text (syncJsonEditorsFromState) — that view is meant to
   * keep showing the literal template so a saved request still says
   * `{{authToken}}` rather than baking in whatever value happened to be
   * active the last time the editor synced.
   */
  private resolveHeaders(
    headers: Record<string, string>,
    context: VariableContext
  ): Record<string, string> {
    const resolved: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
      resolved[resolveTemplate(key, context)] = resolveTemplate(value, context);
    }
    return resolved;
  }

  private resolveBody(
    body: Record<string, unknown> | undefined,
    context: VariableContext
  ): Record<string, unknown> | undefined {
    if (!body) {
      return body;
    }
    const resolved: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(body)) {
      resolved[key] = typeof value === "string" ? resolveTemplate(value, context) : value;
    }
    return resolved;
  }

  maybeUpdateVariablePreview(): void {
    const activeEnv = this.environmentsService.activeEnvironment();
    const endpoint = this.endpoint();
    const headers = this.requestHeaders();
    const body = this.requestBody();
    const fingerprint = JSON.stringify({
      endpoint,
      headers,
      body,
      // The fingerprint has to change when the active environment's *vars*
      // change value, not just when a different environment is selected —
      // fingerprinting only meta.id here meant editing a variable's value
      // (same env, same id) never invalidated a preview computed before
      // that edit landed, so a script/save that raced ahead of a still-in-
      // flight endpoint edit could get permanently stuck showing "missing"
      // for a variable that does exist.
      env: activeEnv ? { id: activeEnv.meta.id, vars: activeEnv.vars } : null,
    });
    if (fingerprint === this.previewFingerprint) {
      return;
    }
    this.previewFingerprint = fingerprint;
    const tokens = collectVariableTokens(
      { url: endpoint, headers, body },
      {
        requestVars: this.requestVariables,
        environment: activeEnv,
        globals: {},
      }
    );
    this.variableTokens.set(tokens);
    this.missingVariableKeys.set(
      tokens.filter((token) => token.source === "missing").map((token) => token.key)
    );
  }

  private async persistHistory(entry: PastRequest): Promise<void> {
    await this.idbService.add(entry);
    this.newRequest.emit();
  }

  private resetForm(): void {
    this.onRequestMethodChange("GET");
    this.endpoint.set("");
    this.requestBody.set([{ key: "", value: "" }]);
    this.requestHeaders.set([
      { key: this.defaultHeaderKey, value: this.defaultHeaderValue },
    ]);
    this.requestParams.set([{ key: "", value: "", enabled: true }]);
    this.requestAuth.set({ type: "none" });
    this.showAuthPassword.set(false);
    this.endpointError.set("");
    this.syncMobilePanelsFromActiveTab();
    this.resetJsonEditors();
    this.maybeUpdateVariablePreview();
  }

  addParam(): void {
    this.requestParams.update((items) => [
      ...items,
      { key: "", value: "", enabled: true },
    ]);
    this.maybeUpdateVariablePreview();
  }

  removeParam(index: number): void {
    this.requestParams.update((items) => {
      const remaining = items.filter((_, i) => i !== index);
      return remaining.length ? remaining : [{ key: "", value: "", enabled: true }];
    });
    this.syncUrlFromParams();
  }

  isAddParamDisabled(): boolean {
    const items = this.requestParams();
    const last = items[items.length - 1];
    return !!last && (last.key === "" || last.value === "");
  }

  onParamChange(): void {
    this.syncUrlFromParams();
  }

  onEndpointChange(value: string): void {
    this.endpoint.set(value);
    this.syncParamsFromUrl(value);
    this.maybeUpdateVariablePreview();
  }

  private syncParamsFromUrl(url: string): void {
    const parsed = parseParamsFromUrl(url);
    if (parsed) {
      this.requestParams.set(parsed);
    }
  }

  private syncUrlFromParams(): void {
    const next = buildUrlFromParams(this.endpoint(), this.requestParams());
    if (next !== null) {
      this.endpoint.set(next);
      this.maybeUpdateVariablePreview();
    }
  }

  /** Auth type changes (unlike bearer/basic/apiKey field edits) also reset password visibility — kept distinct from the AuthEditorComponent's generic authChange for that reason. */
  onAuthTypeChange(type: AuthType): void {
    this.requestAuth.set({ type });
    this.showAuthPassword.set(false);
  }

  toggleAuthPasswordVisibility(): void {
    this.showAuthPassword.update((visible) => !visible);
  }

  async copyAsCurl(): Promise<void> {
    const endpoint = this.endpoint();
    if (!endpoint) {
      return;
    }
    const context = this.buildVariableContext();
    const baseHeaders = this.resolveHeaders(this.buildHeaders(), context);
    const authHeaders = buildAuthHeaders(this.requestAuth());
    const headers = { ...baseHeaders, ...authHeaders };
    const method = this.selectedRequestMethod();
    let url = appendEnabledParams(
      normalizeUrl(resolveTemplate(endpoint.trim(), context)),
      this.requestParams()
    );
    const authParam = buildAuthQueryParam(this.requestAuth());
    if (authParam) {
      url = appendQueryParam(url, authParam.key, authParam.value);
    }
    const body = this.isBodyMethod(method)
      ? this.resolveBody(this.buildBody(), context)
      : undefined;
    const curlText = buildCurlCommand({ method, url, headers, body });
    await writeToClipboard(curlText);
  }

  onEditorModeChange(mode: EditorMode): void {
    this.editorMode.set(mode);
    if (mode === "json") {
      this.syncJsonEditorsFromState();
    }
  }

  onActiveTabChange(tab: string | number | undefined): void {
    if (tab === undefined) {
      return;
    }
    this.activeTab.set(String(tab));
    this.syncMobilePanelsFromActiveTab();
  }

  onHeadersJsonParsed(value: unknown): void {
    if (!this.headersJsonValid()) {
      return;
    }
    if (value === undefined) {
      this.requestHeaders.set([
        { key: this.defaultHeaderKey, value: this.defaultHeaderValue },
      ]);
      this.maybeUpdateVariablePreview();
      return;
    }
    if (!isPlainObject(value)) {
      return;
    }
    this.requestHeaders.set(
      mergeHeaderRowsFromParsed(
        value,
        this.requestHeaders(),
        this.defaultHeaderKey,
        this.defaultHeaderValue
      )
    );
    this.maybeUpdateVariablePreview();
  }

  onBodyJsonParsed(value: unknown): void {
    if (!this.bodyJsonValid()) {
      return;
    }
    if (value === undefined) {
      this.requestBody.set([{ key: "", value: "" }]);
      this.maybeUpdateVariablePreview();
      return;
    }
    if (!isPlainObject(value)) {
      return;
    }
    const bodyRows = rowsFromObject(value);
    this.requestBody.set(bodyRows.length ? bodyRows : [{ key: "", value: "" }]);
    this.maybeUpdateVariablePreview();
  }

  onMobileIndexChange(
    value: string | number | string[] | number[] | null | undefined
  ): void {
    const panels = Array.isArray(value)
      ? value.map(String)
      : value != null
      ? [String(value)]
      : [];

    const mobileActivePanels = panels.length ? [...panels] : ["headers"];
    this.mobileActivePanels.set(mobileActivePanels);

    if (
      this.isBodyMethod(this.selectedRequestMethod()) &&
      mobileActivePanels.includes("body")
    ) {
      this.activeTab.set("body");
    } else {
      this.activeTab.set("headers");
    }
  }

  private syncMobilePanelsFromActiveTab(): void {
    if (this.isBodyMethod(this.selectedRequestMethod())) {
      this.mobileActivePanels.set(this.activeTab() === "body" ? ["body"] : ["headers"]);
    } else {
      this.mobileActivePanels.set(["headers"]);
    }
  }

  isBodyMethod(method?: PastRequest["method"]): boolean {
    if (!method) {
      return false;
    }
    return this.bodyCapableMethods.has(method);
  }

  private syncJsonEditorsFromState(): void {
    // Deliberately raw/unresolved (buildHeaders()/buildBody(), not
    // resolveHeaders()/resolveBody()) — this view is meant to keep showing
    // the literal {{var}} template, not a resolved snapshot. See
    // resolveHeaders()'s doc comment.
    this.headersJsonText.set(JSON.stringify(this.buildHeaders(), undefined, 4));
    const body = this.buildBody();
    this.bodyJsonText.set(body ? JSON.stringify(body, undefined, 4) : "{}");
    this.headersJsonValid.set(true);
    this.bodyJsonValid.set(true);
  }

  private resetJsonEditors(): void {
    if (this.editorMode() === "json") {
      this.syncJsonEditorsFromState();
    } else {
      this.headersJsonText.set("");
      this.bodyJsonText.set("{}");
      this.headersJsonValid.set(true);
      this.bodyJsonValid.set(true);
    }
  }

  addTest(): void {
    const id = this.createRequestId();
    this.requestTests.update((tests) => [
      ...tests,
      { id, target: "status", operator: "equals", expected: "" },
    ]);
  }

  removeTest(index: number): void {
    this.requestTests.update((tests) => tests.filter((_, i) => i !== index));
  }

  isAddTestDisabled(): boolean {
    return false;
  }

  operatorsFor(target: AssertionTarget): { label: string; value: AssertionOperator }[] {
    return operatorsFor(target);
  }

  needsKey(target: AssertionTarget): boolean {
    return needsKey(target);
  }

  needsExpected(operator: AssertionOperator): boolean {
    return needsExpected(operator);
  }
}
