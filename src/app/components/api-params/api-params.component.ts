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
import { AuthType, HttpAuthPlaceholder } from "../../models/collections.models";
import { buildCurlCommand } from "../../shared/inspect/export.util";
import { JsonEditorComponent } from "../json-editor/json-editor.component";
import { ScriptEditorComponent } from "../script-editor/script-editor.component";
import { ApiParamsBasicComponent } from "./basic-editor/basic-editor.component";
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
import {
  TestAssertion,
  TestResult,
  AssertionTarget,
  AssertionOperator,
} from "../../models/test-assertion.models";

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
    JsonEditorComponent,
    ScriptEditorComponent,
    ApiParamsBasicComponent,
    ResponseViewerComponent,
  ],
  templateUrl: "./api-params.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ApiParamsComponent {
  private readonly idbService = inject(IdbService);
  private readonly responseInspector = inject(ResponseInspectorService);
  private readonly environmentsService = inject(EnvironmentsService);
  private readonly variableFocus = inject(VariableFocusService);
  private readonly requestExecution = inject(RequestExecutionService);

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
  readonly authTypes: { label: string; value: AuthType }[] = [
    { label: "None", value: "none" },
    { label: "Bearer Token", value: "bearer" },
    { label: "Basic Auth", value: "basic" },
    { label: "API Key", value: "api-key" },
  ];
  readonly preRequestScript = signal("");
  readonly postRequestScript = signal("");
  readonly requestTests = signal<TestAssertion[]>([]);
  readonly lastTestResults = signal<TestResult[]>([]);
  readonly assertionTargetOptions: { label: string; value: AssertionTarget }[] = [
    { label: "Status Code", value: "status" },
    { label: "Body", value: "body" },
    { label: "Header", value: "header" },
    { label: "Duration (ms)", value: "duration" },
  ];
  private readonly allOperatorOptions: { label: string; value: AssertionOperator }[] = [
    { label: "equals", value: "equals" },
    { label: "does not equal", value: "not-equals" },
    { label: "contains", value: "contains" },
    { label: "does not contain", value: "not-contains" },
    { label: "exists", value: "exists" },
    { label: "does not exist", value: "not-exists" },
    { label: "is array", value: "is-array" },
    { label: "is object", value: "is-object" },
    { label: "less than", value: "less-than" },
    { label: "greater than", value: "greater-than" },
  ];
  private previewFingerprint = "";

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
    this.onRequestMethodChange(request.method);
    this.endpoint.set(request.url);
    this.requestHeaders.set(this.deconstructObject(request.headers, "Headers"));
    if (request.body && typeof request.body === "object") {
      this.requestBody.set(
        this.deconstructObject(request.body as Record<string, unknown>, "Body")
      );
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
    if (!this.validateUrl(resolvedForValidation)) {
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
    this.resetForm();
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
    const authHeaders = this.buildAuthHeaders();
    const headers = { ...baseHeaders, ...authHeaders };
    const body = usesBody ? this.resolveBody(this.buildBody(), context) : undefined;
    let url = this.buildFinalUrl(
      this.normalizeUrl(resolveTemplate(endpointText.trim(), context))
    );
    const authParam = this.buildAuthQueryParam();
    if (authParam) {
      try {
        const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
        parsed.searchParams.append(authParam.key, authParam.value);
        url = parsed.toString();
      } catch {
        // ignore
      }
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
    return this.requestHeaders().reduce((acc, item) => {
      const key = (item?.key ?? "").trim();
      if (!key) {
        return acc;
      }
      acc[key] = item.value ?? "";
      return acc;
    }, {} as Record<string, string>);
  }

  /** Raw (unresolved) body straight from form state — literal `{{var}}` text intact. */
  private buildBody(): Record<string, unknown> | undefined {
    const body = this.requestBody().reduce((acc, item) => {
      const key = (item?.key ?? "").trim();
      if (!key) {
        return acc;
      }
      acc[key] = item.value;
      return acc;
    }, {} as Record<string, unknown>);

    return Object.keys(body).length ? body : undefined;
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

  private hasExplicitScheme(text: string): boolean {
    return /^https?:\/\//i.test(text);
  }

  /**
   * Prefixes a scheme-less endpoint with `https://` so it's always sent to
   * HttpClient as an absolute URL. Without this, a scheme-less string like
   * "not-a-url" is a *relative* URL as far as the browser is concerned, and
   * HttpClient silently resolves it against the app's own origin — fetching
   * the app's own index.html and reporting it back as a misleading "200 OK".
   */
  private normalizeUrl(text: string): string {
    return this.hasExplicitScheme(text) ? text : `https://${text}`;
  }

  private validateUrl(text: string): boolean {
    if (!text) return false;
    const hasScheme = this.hasExplicitScheme(text);
    let parsed: URL;
    try {
      parsed = new URL(this.normalizeUrl(text));
    } catch {
      return false;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }
    if (!parsed.hostname) {
      return false;
    }
    if (hasScheme) {
      // The user typed a scheme explicitly — that's deliberate intent, so trust
      // whatever host shape they gave us (including bare internal hostnames).
      return true;
    }
    // No scheme was typed, so we're the ones guessing "https://". Reject bare,
    // single-label input (e.g. "not a valid url at all") that technically parses
    // as *some* hostname but was never actually a URL — that's exactly the input
    // that used to slip through and resolve against the app's own origin.
    const hostname = parsed.hostname;
    const looksLikeRealHost =
      hostname === "localhost" ||
      hostname.includes(".") ||
      hostname.includes(":") ||
      !!parsed.port;
    return looksLikeRealHost;
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
    if (!url) {
      this.requestParams.set([{ key: "", value: "", enabled: true }]);
      return;
    }
    try {
      const base =
        typeof window !== "undefined" && window.location?.origin
          ? window.location.origin
          : "http://localhost";
      const parsed = new URL(url.startsWith("http") ? url : `https://${url}`, base);
      const entries: { key: string; value: string; enabled: boolean }[] = [];
      parsed.searchParams.forEach((value, key) => {
        entries.push({ key, value, enabled: true });
      });
      this.requestParams.set(entries.length ? entries : [{ key: "", value: "", enabled: true }]);
    } catch {
      // Non-parseable URL — leave params as-is.
    }
  }

  private syncUrlFromParams(): void {
    const endpoint = this.endpoint();
    if (!endpoint) {
      return;
    }
    try {
      const base =
        typeof window !== "undefined" && window.location?.origin
          ? window.location.origin
          : "http://localhost";
      const url = new URL(
        endpoint.startsWith("http") ? endpoint : `https://${endpoint}`,
        base
      );
      url.search = "";
      for (const param of this.requestParams()) {
        if (param.enabled && param.key) {
          url.searchParams.append(param.key, param.value);
        }
      }
      const reconstructed = url.toString();
      const isAbsolute = endpoint.startsWith("http://") || endpoint.startsWith("https://");
      this.endpoint.set(isAbsolute ? reconstructed : reconstructed.replace(base + "/", ""));
      this.maybeUpdateVariablePreview();
    } catch {
      // Can't parse; ignore.
    }
  }

  private buildFinalUrl(baseUrl: string): string {
    if (!baseUrl) {
      return baseUrl;
    }
    const enabledParams = this.requestParams().filter((p) => p.enabled && p.key);
    if (!enabledParams.length) {
      return baseUrl;
    }
    try {
      const url = new URL(baseUrl.startsWith("http") ? baseUrl : `https://${baseUrl}`);
      for (const param of enabledParams) {
        url.searchParams.append(param.key, param.value);
      }
      return url.toString();
    } catch {
      return baseUrl;
    }
  }

  private buildAuthHeaders(): Record<string, string> {
    const auth = this.requestAuth();
    if (!auth || auth.type === "none") {
      return {};
    }
    if (auth.type === "bearer" && auth.bearer?.token) {
      return { Authorization: `Bearer ${auth.bearer.token}` };
    }
    if (auth.type === "basic" && auth.basic?.username) {
      const encoded = btoa(
        `${auth.basic.username}:${auth.basic.password ?? ""}`
      );
      return { Authorization: `Basic ${encoded}` };
    }
    if (auth.type === "api-key" && auth.apiKey?.key && auth.apiKey?.addTo === "header") {
      return { [auth.apiKey.key]: auth.apiKey.value ?? "" };
    }
    return {};
  }

  private buildAuthQueryParam(): { key: string; value: string } | null {
    const auth = this.requestAuth();
    if (
      auth?.type === "api-key" &&
      auth.apiKey?.key &&
      auth.apiKey?.addTo === "query"
    ) {
      return { key: auth.apiKey.key, value: auth.apiKey.value ?? "" };
    }
    return null;
  }

  onAuthTypeChange(type: AuthType): void {
    this.requestAuth.set({ type });
    this.showAuthPassword.set(false);
  }

  setBearerToken(token: string): void {
    this.requestAuth.update((auth) => ({ ...auth, bearer: { token } }));
  }

  setBasicUsername(username: string): void {
    this.requestAuth.update((auth) => ({
      ...auth,
      basic: { username, password: auth.basic?.password ?? "" },
    }));
  }

  setBasicPassword(password: string): void {
    this.requestAuth.update((auth) => ({
      ...auth,
      basic: { username: auth.basic?.username ?? "", password },
    }));
  }

  toggleAuthPasswordVisibility(): void {
    this.showAuthPassword.update((visible) => !visible);
  }

  setApiKeyField(patch: Partial<{ key: string; value: string; addTo: "header" | "query" }>): void {
    this.requestAuth.update((auth) => ({
      ...auth,
      apiKey: {
        key: auth.apiKey?.key ?? "",
        value: auth.apiKey?.value ?? "",
        addTo: auth.apiKey?.addTo ?? "header",
        ...patch,
      },
    }));
  }

  async copyAsCurl(): Promise<void> {
    const endpoint = this.endpoint();
    if (!endpoint) {
      return;
    }
    const context = this.buildVariableContext();
    const baseHeaders = this.resolveHeaders(this.buildHeaders(), context);
    const authHeaders = this.buildAuthHeaders();
    const headers = { ...baseHeaders, ...authHeaders };
    const method = this.selectedRequestMethod();
    let url = this.buildFinalUrl(this.normalizeUrl(resolveTemplate(endpoint.trim(), context)));
    const authParam = this.buildAuthQueryParam();
    if (authParam) {
      try {
        const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
        parsed.searchParams.append(authParam.key, authParam.value);
        url = parsed.toString();
      } catch {
        // ignore
      }
    }
    const body = this.isBodyMethod(method)
      ? this.resolveBody(this.buildBody(), context)
      : undefined;
    const curlText = buildCurlCommand({ method, url, headers, body });
    await this.writeToClipboard(curlText);
  }

  private async writeToClipboard(text: string): Promise<void> {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return;
      }
    } catch {
      // Fallback below.
    }
    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.top = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    } catch {
      console.warn("Failed to copy to clipboard.");
    }
  }

  private deconstructObject(object: Record<string, unknown>, type: string) {
    return Object.entries(object).map(([key, value]) => ({
      key,
      value: type === "Body" ? String(value ?? "") : String(value ?? ""),
    }));
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
    if (!this.isPlainObject(value)) {
      return;
    }
    this.applyHeadersFromParsed(value);
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
    if (!this.isPlainObject(value)) {
      return;
    }
    this.applyBodyFromParsed(value);
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

  private applyHeadersFromParsed(parsed: Record<string, unknown>): void {
    const headersMap = new Map<string, string>();
    for (const [key, rawValue] of Object.entries(parsed)) {
      const trimmedKey = key.trim();
      if (!trimmedKey) {
        continue;
      }
      headersMap.set(trimmedKey, String(rawValue ?? ""));
    }

    const existingContentType =
      this.requestHeaders().find(
        (header: { key: string }) => header.key === this.defaultHeaderKey
      )?.value ?? this.defaultHeaderValue;

    if (!headersMap.size || !headersMap.has(this.defaultHeaderKey)) {
      headersMap.set(this.defaultHeaderKey, existingContentType);
    }

    const orderedEntries: { key: string; value: string }[] = [];
    if (headersMap.has(this.defaultHeaderKey)) {
      const value = headersMap.get(this.defaultHeaderKey) ?? existingContentType;
      orderedEntries.push({
        key: this.defaultHeaderKey,
        value,
      });
      headersMap.delete(this.defaultHeaderKey);
    }

    headersMap.forEach((value, key) => {
      orderedEntries.push({ key, value });
    });

    this.requestHeaders.set(
      orderedEntries.length
        ? orderedEntries
        : [{ key: this.defaultHeaderKey, value: existingContentType }]
    );
  }

  private applyBodyFromParsed(parsed: Record<string, unknown>): void {
    const bodyArray = this.deconstructObject(parsed, "Body");
    this.requestBody.set(bodyArray.length ? bodyArray : [{ key: "", value: "" }]);
  }

  private isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  addTest(): void {
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
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
    const numericOnly: AssertionOperator[] = ["less-than", "greater-than"];
    if (target === "status" || target === "duration") {
      return this.allOperatorOptions.filter(
        (o) => !["is-array", "is-object"].includes(o.value)
      );
    }
    return this.allOperatorOptions.filter((o) => !numericOnly.includes(o.value));
  }

  needsKey(target: AssertionTarget): boolean {
    return target === "body" || target === "header";
  }

  needsExpected(operator: AssertionOperator): boolean {
    return !["exists", "not-exists", "is-array", "is-object"].includes(operator);
  }
}
