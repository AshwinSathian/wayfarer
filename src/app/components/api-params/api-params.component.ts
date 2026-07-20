import { CommonModule } from "@angular/common";
import {
  HttpErrorResponse,
  HttpHeaders,
  HttpResponse,
} from "@angular/common/http";
import { Component, DoCheck, ElementRef, Signal, inject, viewChild, output } from "@angular/core";
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
import { MainService } from "src/app/services/main.service";
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
  VariableToken,
  collectVariableTokens,
} from "../../shared/environments/env-resolution.util";
import { VariableFocusService } from "../../services/variable-focus.service";
import {
  ScriptSandboxService,
  ScriptResponseContext,
} from "../../shared/scripts/script-sandbox.service";
import {
  AssertionRunnerService,
  AssertionResponseContext,
} from "../../shared/scripts/assertion-runner.service";
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
})
export class ApiParamsComponent implements DoCheck {
  private _mainService = inject(MainService);
  private _idbService = inject(IdbService);
  private _responseInspector = inject(ResponseInspectorService);
  private readonly environmentsService = inject(EnvironmentsService);
  private readonly variableFocus = inject(VariableFocusService);
  private readonly scriptSandbox = inject(ScriptSandboxService);
  private readonly assertionRunner = inject(AssertionRunnerService);

  readonly newRequest = output();

  readonly urlInputRef = viewChild<ElementRef<HTMLInputElement>>("urlInput");

  endpoint: string;
  selectedRequestMethod: PastRequest["method"];
  readonly requestMethods: { label: string; value: PastRequest["method"] }[];
  private readonly bodyCapableMethods = new Set<PastRequest["method"]>([
    "POST",
    "PUT",
    "PATCH",
  ]);
  private readonly defaultHeaderKey = "Content-Type";
  private readonly defaultHeaderValue = "application/json";
  readonly editorModeOptions: { label: string; value: EditorMode }[];
  editorMode: EditorMode;
  headersJsonText: string;
  bodyJsonText: string;
  headersJsonValid: boolean;
  bodyJsonValid: boolean;
  readonly addItemFn: (ctx: ContextType) => void;
  readonly removeItemFn: (index: number, ctx: ContextType) => void;
  readonly isAddDisabledFn: (ctx: ContextType) => boolean;
  readonly disableHeaderItemFn: (
    item: { key: string; value: unknown },
    index: number
  ) => boolean;
  readonly disableBodyItemFn: (
    item: { key: string; value: unknown },
    index: number
  ) => boolean;
  responseData: string;
  responseError: string;
  responseBodyIsJson: boolean;
  responseHeadersView: { name: string; value: string }[];
  responseStatusCode?: number;
  responseStatusText?: string;
  responseIsError: boolean;
  responseTab: "body" | "headers" | "timings" | "tests";
  responseContentLength?: number;
  readonly responseInspection: Signal<ResponseInspection | null>;
  responseExportContext: ResponseExportContext | null;
  requestBody: { key: string; value: unknown }[];
  requestHeaders: { key: string; value: string }[];
  endpointError: string;
  loadingState: boolean;
  activeTab: string;
  mobileActivePanels: string[];
  requestVariables: Record<string, string>;
  variableTokens: VariableToken[];
  missingVariableKeys: string[];
  highlightedVariableSource: VariableToken["source"] | null = null;
  requestParams: { key: string; value: string; enabled: boolean }[];
  requestAuth: HttpAuthPlaceholder;
  showAuthPassword = false;
  readonly authTypes: { label: string; value: AuthType }[];
  preRequestScript = "";
  postRequestScript = "";
  requestTests: TestAssertion[] = [];
  lastTestResults: TestResult[] = [];
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
    this.endpoint = "";
    this.selectedRequestMethod = "GET";
    this.requestMethods = [
      { label: "GET", value: "GET" },
      { label: "POST", value: "POST" },
      { label: "PUT", value: "PUT" },
      { label: "PATCH", value: "PATCH" },
      { label: "DELETE", value: "DELETE" },
      { label: "HEAD", value: "HEAD" },
      { label: "OPTIONS", value: "OPTIONS" },
    ];
    this.requestBody = [{ key: "", value: "" }];
    this.requestHeaders = [
      { key: this.defaultHeaderKey, value: this.defaultHeaderValue },
    ];
    this.endpointError = "";
    this.loadingState = false;
    this.activeTab = "headers";
    this.mobileActivePanels = ["headers"];
    this.editorModeOptions = [
      { label: "Basic", value: "basic" },
      { label: "JSON", value: "json" },
    ];
    this.editorMode = "basic";
    this.headersJsonText = "";
    this.bodyJsonText = "{}";
    this.headersJsonValid = true;
    this.bodyJsonValid = true;
    this.responseData = "";
    this.responseError = "";
    this.responseBodyIsJson = false;
    this.responseHeadersView = [];
    this.responseIsError = false;
    this.responseStatusCode = undefined;
    this.responseStatusText = undefined;
    this.responseContentLength = undefined;
    this.responseTab = "body";
    this.responseInspection = this._responseInspector.latest;
    this.responseExportContext = null;
    this.requestVariables = {};
    this.variableTokens = [];
    this.missingVariableKeys = [];
    this.requestParams = [{ key: "", value: "", enabled: true }];
    this.requestAuth = { type: "none" };
    this.authTypes = [
      { label: "None", value: "none" },
      { label: "Bearer Token", value: "bearer" },
      { label: "Basic Auth", value: "basic" },
      { label: "API Key", value: "api-key" },
    ];
    this.addItemFn = (ctx: ContextType) => this.addItem(ctx);
    this.removeItemFn = (index: number, ctx: ContextType) =>
      this.removeItem(index, ctx);
    this.isAddDisabledFn = (ctx: ContextType) => this.isAddDisabled(ctx);
    this.disableHeaderItemFn = (
      item: { key: string; value: unknown },
      _index: number
    ) => item.key === this.defaultHeaderKey;
    this.disableBodyItemFn = () => false;
    this.syncMobilePanelsFromActiveTab();
  }

  ngDoCheck(): void {
    this.maybeUpdateVariablePreview();
  }

  addItem(ctx: ContextType) {
    const context = ctx === "Body" ? this.requestBody : this.requestHeaders;
    context.push({ key: "", value: "" });
  }

  isAddDisabled(ctx: ContextType) {
    const context = ctx === "Body" ? this.requestBody : this.requestHeaders;

    if (context.length > 0) {
      if (
        context[context.length - 1].key === "" ||
        context[context.length - 1].value === ""
      ) {
        return true;
      }
    }

    return false;
  }

  removeItem(index: number, ctx: ContextType) {
    const context = ctx === "Body" ? this.requestBody : this.requestHeaders;
    context.splice(index, 1);
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
    this.endpoint = request.url;
    this.requestHeaders = this.deconstructObject(request.headers, "Headers");
    if (request.body && typeof request.body === "object") {
      this.requestBody = this.deconstructObject(
        request.body as Record<string, unknown>,
        "Body"
      );
      this.activeTab = this.isBodyMethod(request.method) ? "body" : "headers";
    } else {
      this.requestBody = [{ key: "", value: "" }];
      this.activeTab = "headers";
    }
    this.syncParamsFromUrl(request.url);
    this.requestAuth = { type: "none" };
    this.showAuthPassword = false;
    this.syncMobilePanelsFromActiveTab();
    if (this.editorMode === "json") {
      this.syncJsonEditorsFromState();
    }
  }

  async sendRequest() {
    this.endpointError = "";
    this.resetResponseState();
    this.lastTestResults = [];

    if (!this.endpoint) {
      this.endpointError = "Endpoint is a Required value";
      return;
    }
    if (!this.validateUrl(this.endpoint)) {
      this.endpointError = "Please enter a valid URL";
      return;
    }

    // Run pre-request script
    if (this.preRequestScript?.trim()) {
      const preResult = await this.scriptSandbox.execute(
        this.preRequestScript,
        this.getEnvSnapshot()
      );
      if (preResult.testResults.length) {
        this.lastTestResults = [...preResult.testResults];
      }
      await this.applyEnvMutations(preResult.envMutations);
    }

    const baseHeaders = this.buildHeaders();
    const authHeaders = this.buildAuthHeaders();
    const requestHeaders = { ...baseHeaders, ...authHeaders };
    const method = this.selectedRequestMethod;
    const usesBody = this.isBodyMethod(method);
    const requestBody = usesBody ? this.buildBody() : undefined;
    const transportBody = usesBody ? requestBody ?? {} : undefined;
    let endpoint = this.buildFinalUrl(this.normalizeUrl(this.endpoint.trim()));
    const authParam = this.buildAuthQueryParam();
    if (authParam) {
      try {
        const parsed = new URL(endpoint.startsWith("http") ? endpoint : `https://${endpoint}`);
        parsed.searchParams.append(authParam.key, authParam.value);
        endpoint = parsed.toString();
      } catch {
        // ignore
      }
    }
    const requestId = this.createRequestId();
    const startedAt = performance.now();
    const createdAt = Date.now();

    this.responseExportContext = {
      id: requestId,
      method,
      url: endpoint,
      headers: { ...requestHeaders },
      body: transportBody,
    };

    this._responseInspector.markRequest(requestId, endpoint);
    this.loadingState = true;
    this._mainService
      .sendRequest(method, endpoint, requestHeaders, transportBody)
      .subscribe({
        next: async (response) => {
          this.loadingState = false;
          this._responseInspector.markResponse(requestId, endpoint);
          this.captureSuccessResponse(response);
          this.responseData = this.responseBodyIsJson
            ? this.serializeJsonPayload(response.body)
            : this.stringifyPayload(response.body);
          const durationMs = Math.round(performance.now() - startedAt);
          await this.runPostScriptAndAssertions(
            response.status,
            response.statusText ?? "",
            response.body,
            this.extractHeadersMap(response.headers),
            durationMs
          );
          const history: PastRequest = {
            method,
            url: endpoint,
            headers: requestHeaders,
            createdAt,
            status: response.status,
            durationMs,
          };
          if (usesBody) {
            history.body = requestBody;
          }
          await this.persistHistory(history);
          this.resetForm();
        },
        error: async (error: HttpErrorResponse) => {
          this.loadingState = false;
          this._responseInspector.markResponse(requestId, endpoint);
          this.captureErrorResponse(error);
          const errorBody = this.resolveErrorBody(error);
          this.responseError = this.responseBodyIsJson
            ? this.serializeJsonPayload(errorBody)
            : this.stringifyPayload(errorBody);
          const durationMs = Math.round(performance.now() - startedAt);
          await this.runPostScriptAndAssertions(
            error.status,
            error.statusText ?? "",
            error.error,
            this.extractHeadersMap(error.headers),
            durationMs
          );
          const history: PastRequest = {
            method,
            url: endpoint,
            headers: requestHeaders,
            createdAt,
            status: error.status,
            durationMs,
            error: this.extractError(error),
          };
          if (usesBody) {
            history.body = requestBody;
          }
          await this.persistHistory(history);
          this.resetForm();
        },
      });
  }

  handleVariableChipClick(token: VariableToken): void {
    this.highlightedVariableSource =
      this.highlightedVariableSource === token.source ? null : token.source;
    if (token.source === "environment") {
      this.variableFocus.requestFocus(token);
    }
  }

  private resetResponseState(): void {
    this.responseData = "";
    this.responseError = "";
    this.responseBodyIsJson = false;
    this.responseHeadersView = [];
    this.responseStatusCode = undefined;
    this.responseStatusText = undefined;
    this.responseIsError = false;
    this.responseContentLength = undefined;
    this.responseTab = "body";
    this.responseExportContext = null;
  }

  private captureSuccessResponse(response: HttpResponse<unknown>): void {
    this.responseIsError = false;
    this.responseStatusCode = response.status;
    this.responseStatusText = response.statusText ?? "";
    this.responseBodyIsJson = this.isJsonPayload(response.body);
    this.responseHeadersView = this.extractHeadersList(response.headers);
    this.responseContentLength = this.extractContentLength(response.headers);
    this.responseTab = "body";
  }

  private captureErrorResponse(error: HttpErrorResponse): void {
    this.responseIsError = true;
    this.responseStatusCode = error.status;
    this.responseStatusText = error.statusText ?? "";
    this.responseBodyIsJson = !this.isNetworkError(error) && this.isJsonPayload(error.error);
    this.responseHeadersView = this.extractHeadersList(error.headers);
    this.responseContentLength = this.extractContentLength(error.headers);
    this.responseTab = "body";
  }

  /**
   * True when the browser never got a response to parse — a CORS rejection,
   * DNS failure, refused connection, etc. In that case `HttpErrorResponse.error`
   * is the raw `ProgressEvent`/`ErrorEvent` the browser fired, not a response
   * body. Stringifying that object directly used to leak `{"isTrusted":true}`
   * (an Event's only own-enumerable property) into the response viewer instead
   * of a readable message.
   */
  private isNetworkError(error: HttpErrorResponse): boolean {
    if (error.status === 0) {
      return true;
    }
    return (
      (typeof ProgressEvent !== "undefined" && error.error instanceof ProgressEvent) ||
      (typeof ErrorEvent !== "undefined" && error.error instanceof ErrorEvent)
    );
  }

  private resolveErrorBody(error: HttpErrorResponse): unknown {
    if (this.isNetworkError(error)) {
      return (
        error.message ||
        "Network error — no response was received. Check the URL, your connection, or whether the API allows cross-origin requests (CORS)."
      );
    }
    return error.error ?? error.message;
  }

  private extractHeadersList(
    headers: HttpHeaders | null | undefined
  ): { name: string; value: string }[] {
    if (!headers) {
      return [];
    }
    const keys = headers.keys();
    return keys
      .map((name) => {
        const values = headers.getAll(name);
        return {
          name,
          value: values && values.length ? values.join(", ") : "",
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  private extractContentLength(
    headers: HttpHeaders | null | undefined
  ): number | undefined {
    if (!headers) {
      return undefined;
    }
    const value = headers.get("content-length");
    if (!value) {
      return undefined;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  private createRequestId(): string {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  private isJsonPayload(payload: unknown): boolean {
    if (payload === null || payload === undefined) {
      return false;
    }
    if (typeof payload === "object") {
      const hasBlob =
        typeof Blob !== "undefined" && payload instanceof Blob;
      const hasArrayBuffer =
        typeof ArrayBuffer !== "undefined" && payload instanceof ArrayBuffer;
      const hasFormData =
        typeof FormData !== "undefined" && payload instanceof FormData;
      if (hasBlob || hasArrayBuffer || hasFormData) {
        return false;
      }
      return true;
    }
    if (typeof payload === "string") {
      try {
        JSON.parse(payload);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }

  get shouldShowResponsePanel(): boolean {
    return (
      this.loadingState ||
      this.responseStatusCode !== undefined ||
      !!this.responseData ||
      !!this.responseError ||
      this.responseHeadersView.length > 0
    );
  }

  onRequestMethodChange(method: PastRequest["method"]) {
    this.selectedRequestMethod = method;
    if (!this.isBodyMethod(method)) {
      this.activeTab = "headers";
      this.requestBody = [{ key: "", value: "" }];
    }
    this.syncMobilePanelsFromActiveTab();
    if (this.editorMode === "json") {
      this.syncJsonEditorsFromState();
    }
  }

  private buildHeaders(): Record<string, string> {
    return this.requestHeaders.reduce((acc, item) => {
      const key = (item?.key ?? "").trim();
      if (!key) {
        return acc;
      }
      acc[key] = item.value ?? "";
      return acc;
    }, {} as Record<string, string>);
  }

  private buildBody(): Record<string, unknown> | undefined {
    const body = this.requestBody.reduce((acc, item) => {
      const key = (item?.key ?? "").trim();
      if (!key) {
        return acc;
      }
      acc[key] = item.value;
      return acc;
    }, {} as Record<string, unknown>);

    return Object.keys(body).length ? body : undefined;
  }

  private serializeJsonPayload(payload: unknown): string {
    if (payload === null || payload === undefined) {
      return "";
    }
    if (typeof payload === "string") {
      return payload;
    }
    try {
      return JSON.stringify(payload);
    } catch {
      return this.stringifyPayload(payload);
    }
  }

  private stringifyPayload(payload: unknown): string {
    try {
      if (payload === null || payload === undefined) {
        return "";
      }
      if (typeof payload === "string") {
        return payload;
      }
      return JSON.stringify(payload, undefined, 4);
    } catch {
      return String(payload);
    }
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

  private maybeUpdateVariablePreview(): void {
    const fingerprint = JSON.stringify({
      endpoint: this.endpoint,
      headers: this.requestHeaders,
      body: this.requestBody,
      env: this.environmentsService.activeEnvironment()?.meta.id ?? null,
    });
    if (fingerprint === this.previewFingerprint) {
      return;
    }
    this.previewFingerprint = fingerprint;
    this.variableTokens = collectVariableTokens(
      {
        url: this.endpoint,
        headers: this.requestHeaders,
        body: this.requestBody,
      },
      {
        requestVars: this.requestVariables,
        environment: this.environmentsService.activeEnvironment(),
        globals: {},
      }
    );
    this.missingVariableKeys = this.variableTokens
      .filter((token) => token.source === "missing")
      .map((token) => token.key);
  }

  private async runPostScriptAndAssertions(
    statusCode: number,
    statusText: string,
    body: unknown,
    headers: Record<string, string>,
    durationMs: number
  ): Promise<void> {
    if (this.postRequestScript?.trim()) {
      const responseCtx: ScriptResponseContext = {
        statusCode,
        statusText,
        body,
        headers,
        durationMs,
      };
      const postResult = await this.scriptSandbox.execute(
        this.postRequestScript,
        this.getEnvSnapshot(),
        responseCtx
      );
      this.lastTestResults = [...this.lastTestResults, ...postResult.testResults];
      await this.applyEnvMutations(postResult.envMutations);
    }

    if (this.requestTests.length) {
      const assertionCtx: AssertionResponseContext = {
        statusCode,
        body,
        headers,
        durationMs,
      };
      const assertionResults = this.assertionRunner.run(
        this.requestTests,
        assertionCtx
      );
      this.lastTestResults = [...this.lastTestResults, ...assertionResults];
    }
  }

  private extractHeadersMap(headers: HttpHeaders | null | undefined): Record<string, string> {
    if (!headers) {
      return {};
    }
    return headers.keys().reduce((acc, key) => {
      acc[key] = headers.get(key) ?? "";
      return acc;
    }, {} as Record<string, string>);
  }

  private getEnvSnapshot(): Record<string, string> {
    return { ...(this.environmentsService.activeEnvironment()?.vars ?? {}) };
  }

  private async applyEnvMutations(mutations: Record<string, string>): Promise<void> {
    const keys = Object.keys(mutations);
    if (!keys.length) {
      return;
    }
    const active = this.environmentsService.activeEnvironment();
    if (!active) {
      return;
    }
    const vars = { ...active.vars };
    for (const key of keys) {
      if (mutations[key] === "") {
        delete vars[key];
      } else {
        vars[key] = mutations[key];
      }
    }
    await this.environmentsService.updateEnvironment(active.meta.id, { vars });
  }

  addTest(): void {
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    this.requestTests = [
      ...this.requestTests,
      { id, target: "status", operator: "equals", expected: "" },
    ];
  }

  removeTest(index: number): void {
    this.requestTests = this.requestTests.filter((_, i) => i !== index);
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

  private extractError(error: HttpErrorResponse): string {
    if (error.message) {
      return error.message;
    }
    return "Unknown error";
  }

  private async persistHistory(entry: PastRequest): Promise<void> {
    await this._idbService.add(entry);
    this.newRequest.emit();
  }

  private resetForm(): void {
    this.onRequestMethodChange("GET");
    this.endpoint = "";
    this.requestBody = [{ key: "", value: "" }];
    this.requestHeaders = [
      { key: this.defaultHeaderKey, value: this.defaultHeaderValue },
    ];
    this.requestParams = [{ key: "", value: "", enabled: true }];
    this.requestAuth = { type: "none" };
    this.showAuthPassword = false;
    this.endpointError = "";
    this.syncMobilePanelsFromActiveTab();
    this.resetJsonEditors();
  }

  addParam(): void {
    this.requestParams.push({ key: "", value: "", enabled: true });
  }

  removeParam(index: number): void {
    this.requestParams.splice(index, 1);
    if (!this.requestParams.length) {
      this.requestParams.push({ key: "", value: "", enabled: true });
    }
    this.syncUrlFromParams();
  }

  isAddParamDisabled(): boolean {
    const last = this.requestParams[this.requestParams.length - 1];
    return !!last && (last.key === "" || last.value === "");
  }

  onParamChange(): void {
    this.syncUrlFromParams();
  }

  onEndpointChange(value: string): void {
    this.endpoint = value;
    this.syncParamsFromUrl(value);
  }

  private syncParamsFromUrl(url: string): void {
    if (!url) {
      this.requestParams = [{ key: "", value: "", enabled: true }];
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
      this.requestParams = entries.length
        ? entries
        : [{ key: "", value: "", enabled: true }];
    } catch {
      // Non-parseable URL — leave params as-is.
    }
  }

  private syncUrlFromParams(): void {
    if (!this.endpoint) {
      return;
    }
    try {
      const base =
        typeof window !== "undefined" && window.location?.origin
          ? window.location.origin
          : "http://localhost";
      const url = new URL(
        this.endpoint.startsWith("http") ? this.endpoint : `https://${this.endpoint}`,
        base
      );
      url.search = "";
      for (const param of this.requestParams) {
        if (param.enabled && param.key) {
          url.searchParams.append(param.key, param.value);
        }
      }
      const reconstructed = url.toString();
      const isAbsolute = this.endpoint.startsWith("http://") || this.endpoint.startsWith("https://");
      this.endpoint = isAbsolute ? reconstructed : reconstructed.replace(base + "/", "");
    } catch {
      // Can't parse; ignore.
    }
  }

  private buildFinalUrl(baseUrl: string): string {
    if (!baseUrl) {
      return baseUrl;
    }
    const enabledParams = this.requestParams.filter((p) => p.enabled && p.key);
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
    const auth = this.requestAuth;
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
    const auth = this.requestAuth;
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
    this.requestAuth = { type };
    this.showAuthPassword = false;
  }

  async copyAsCurl(): Promise<void> {
    if (!this.endpoint) {
      return;
    }
    const baseHeaders = this.buildHeaders();
    const authHeaders = this.buildAuthHeaders();
    const headers = { ...baseHeaders, ...authHeaders };
    const method = this.selectedRequestMethod;
    let url = this.buildFinalUrl(this.normalizeUrl(this.endpoint.trim()));
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
    const body = this.isBodyMethod(method) ? this.buildBody() : undefined;
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
    this.editorMode = mode;
    if (mode === "json") {
      this.syncJsonEditorsFromState();
    }
  }

  onActiveTabChange(tab: string | number | undefined): void {
    if (tab === undefined) {
      return;
    }
    this.activeTab = String(tab);
    this.syncMobilePanelsFromActiveTab();
  }

  onHeadersJsonParsed(value: unknown): void {
    if (!this.headersJsonValid) {
      return;
    }
    if (value === undefined) {
      this.requestHeaders = [
        { key: this.defaultHeaderKey, value: this.defaultHeaderValue },
      ];
      return;
    }
    if (!this.isPlainObject(value)) {
      return;
    }
    this.applyHeadersFromParsed(value);
  }

  onBodyJsonParsed(value: unknown): void {
    if (!this.bodyJsonValid) {
      return;
    }
    if (value === undefined) {
      this.requestBody = [{ key: "", value: "" }];
      return;
    }
    if (!this.isPlainObject(value)) {
      return;
    }
    this.applyBodyFromParsed(value);
  }

  onMobileIndexChange(
    value: string | number | string[] | number[] | null | undefined
  ): void {
    const panels = Array.isArray(value)
      ? value.map(String)
      : value != null
      ? [String(value)]
      : [];

    this.mobileActivePanels = panels.length ? [...panels] : ["headers"];

    if (
      this.isBodyMethod(this.selectedRequestMethod) &&
      this.mobileActivePanels.includes("body")
    ) {
      this.activeTab = "body";
    } else {
      this.activeTab = "headers";
    }
  }

  private syncMobilePanelsFromActiveTab(): void {
    if (this.isBodyMethod(this.selectedRequestMethod)) {
      this.mobileActivePanels =
        this.activeTab === "body" ? ["body"] : ["headers"];
    } else {
      this.mobileActivePanels = ["headers"];
    }
  }

  isBodyMethod(method?: PastRequest["method"]): boolean {
    if (!method) {
      return false;
    }
    return this.bodyCapableMethods.has(method);
  }

  private syncJsonEditorsFromState(): void {
    this.headersJsonText = this.stringifyPayload(this.buildHeaders());
    const body = this.buildBody();
    this.bodyJsonText = body ? this.stringifyPayload(body) : "{}";
    this.headersJsonValid = true;
    this.bodyJsonValid = true;
  }

  private resetJsonEditors(): void {
    if (this.editorMode === "json") {
      this.syncJsonEditorsFromState();
    } else {
      this.headersJsonText = "";
      this.bodyJsonText = "{}";
      this.headersJsonValid = true;
      this.bodyJsonValid = true;
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
      this.requestHeaders.find(
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

    this.requestHeaders = orderedEntries.length
      ? orderedEntries
      : [
          { key: this.defaultHeaderKey, value: existingContentType },
        ];
  }

  private applyBodyFromParsed(parsed: Record<string, unknown>): void {
    const bodyArray = this.deconstructObject(parsed, "Body");
    this.requestBody = bodyArray.length ? bodyArray : [{ key: "", value: "" }];
  }

  private isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
}
