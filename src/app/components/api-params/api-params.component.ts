import { CommonModule } from "@angular/common";
import {
  HttpErrorResponse,
  HttpHeaders,
  HttpResponse,
} from "@angular/common/http";
import {
  Component,
  DoCheck,
  EventEmitter,
  OnInit,
  Output,
  Signal,
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
import { MainService } from "src/app/services/main.service";
import { EnvironmentsService } from "src/app/services/environments.service";
import { IdbService } from "../../data/idb.service";
import { PastRequest } from "../../models/history.models";
import { JsonEditorComponent } from "../json-editor/json-editor.component";
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
    ApiParamsBasicComponent,
    ResponseViewerComponent,
  ],
  templateUrl: "./api-params.component.html",
})
export class ApiParamsComponent implements OnInit, DoCheck {
  @Output() newRequest = new EventEmitter();

  endpoint: string;
  selectedRequestMethod: PastRequest["method"];
  readonly requestMethods: Array<{ label: string; value: PastRequest["method"] }>;
  private readonly bodyCapableMethods = new Set<PastRequest["method"]>([
    "POST",
    "PUT",
    "PATCH",
  ]);
  private readonly defaultHeaderKey = "Content-Type";
  private readonly defaultHeaderValue = "application/json";
  readonly editorModeOptions: Array<{ label: string; value: EditorMode }>;
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
  responseHeadersView: Array<{ name: string; value: string }>;
  responseStatusCode?: number;
  responseStatusText?: string;
  responseIsError: boolean;
  responseTab: "body" | "headers" | "timings";
  responseContentLength?: number;
  readonly responseInspection: Signal<ResponseInspection | null>;
  responseExportContext: ResponseExportContext | null;
  requestBody: Array<{ key: string; value: unknown }>;
  requestBodyDataTypes: string[];
  readonly availableDataTypes: Array<{ label: string; value: string }>;
  readonly booleanOptions: Array<{ label: string; value: string }>;
  requestHeaders: Array<{ key: string; value: string }>;
  endpointError: string;
  loadingState: boolean;
  activeTab: string;
  mobileActivePanels: string[];
  requestVariables: Record<string, string>;
  variableTokens: VariableToken[];
  missingVariableKeys: string[];
  highlightedVariableSource: VariableToken["source"] | null = null;
  private previewFingerprint = "";

  constructor(
    private _mainService: MainService,
    private _idbService: IdbService,
    private _responseInspector: ResponseInspectorService,
    private readonly environmentsService: EnvironmentsService,
    private readonly variableFocus: VariableFocusService
  ) {
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
    this.availableDataTypes = [
      { label: "String", value: "String" },
      { label: "Number", value: "Number" },
      { label: "Boolean", value: "Boolean" },
    ];
    this.booleanOptions = [
      { label: "True", value: "true" },
      { label: "False", value: "false" },
    ];
    this.requestBody = [{ key: "", value: "" }];
    this.requestBodyDataTypes = [""];
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

  ngOnInit() {}

  ngDoCheck(): void {
    this.maybeUpdateVariablePreview();
  }

  addItem(ctx: ContextType) {
    let context;
    if (ctx === "Body") {
      context = this.requestBody;
    } else if (ctx === "Headers") {
      context = this.requestHeaders;
    }

    context.push({ key: "", value: "" });
    if (ctx === "Body") {
      this.requestBodyDataTypes.push("");
    }
  }

  isAddDisabled(ctx: ContextType) {
    let context;
    if (ctx === "Body") {
      context = this.requestBody;
    } else if (ctx === "Headers") {
      context = this.requestHeaders;
    }

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
    let context;
    if (ctx === "Body") {
      context = this.requestBody;
    } else if (ctx === "Headers") {
      context = this.requestHeaders;
    }

    context.splice(index, 1);
  }

  loadPastRequest(request: PastRequest) {
    this.onRequestMethodChange(request.method);
    this.endpoint = request.url;
    this.requestHeaders = this.deconstructObject(request.headers, "Headers");
    if (request.body && typeof request.body === "object") {
      this.requestBodyDataTypes = [];
      this.requestBody = this.deconstructObject(
        request.body as Record<string, unknown>,
        "Body"
      );
      this.activeTab = this.isBodyMethod(request.method) ? "body" : "headers";
    } else {
      this.requestBody = [{ key: "", value: "" }];
      this.requestBodyDataTypes = [""];
      this.activeTab = "headers";
    }
    this.syncMobilePanelsFromActiveTab();
    if (this.editorMode === "json") {
      this.syncJsonEditorsFromState();
    }
  }

  sendRequest() {
    this.endpointError = "";
    this.resetResponseState();

    if (!this.endpoint) {
      this.endpointError = "Endpoint is a Required value";
      return;
    }
    if (!this.validateUrl(this.endpoint)) {
      this.endpointError = "Please enter a valid URL";
      return;
    }

    const requestHeaders = this.buildHeaders();
    const method = this.selectedRequestMethod;
    const usesBody = this.isBodyMethod(method);
    const requestBody = usesBody ? this.buildBody() : undefined;
    const transportBody = usesBody ? requestBody ?? {} : undefined;
    const endpoint = this.endpoint.trim();
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
          const history: PastRequest = {
            method,
            url: endpoint,
            headers: requestHeaders,
            createdAt,
            status: response.status,
            durationMs: Math.round(performance.now() - startedAt),
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
          this.responseError = this.responseBodyIsJson
            ? this.serializeJsonPayload(error.error ?? error.message)
            : this.stringifyPayload(error.error ?? error.message);
          const history: PastRequest = {
            method,
            url: endpoint,
            headers: requestHeaders,
            createdAt,
            status: error.status,
            durationMs: Math.round(performance.now() - startedAt),
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
    this.responseBodyIsJson = this.isJsonPayload(error.error);
    this.responseHeadersView = this.extractHeadersList(error.headers);
    this.responseContentLength = this.extractContentLength(error.headers);
    this.responseTab = "body";
  }

  private extractHeadersList(
    headers: HttpHeaders | null | undefined
  ): Array<{ name: string; value: string }> {
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
      this.requestBodyDataTypes = [""];
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
    const body = this.requestBody.reduce((acc, item, index) => {
      const key = (item?.key ?? "").trim();
      if (!key) {
        return acc;
      }
      const type = this.requestBodyDataTypes[index];
      let value: unknown = item.value;

      if (type === "Number") {
        const numeric = Number(item.value);
        value = Number.isNaN(numeric) ? item.value : numeric;
      } else if (type === "Boolean") {
        value = item.value === "true";
      }

      acc[key] = value;
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

  private validateUrl(text: string): boolean {
    const urlRegExp =
      /^(https?:\/\/)?[a-z0-9]+([\-\.][a-z0-9]+)*\.[a-z]{2,5}(:\d{1,5})?(\/.*)?$/i;
    return urlRegExp.test(text);
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
    this.requestBodyDataTypes = [""];
    this.requestHeaders = [
      { key: this.defaultHeaderKey, value: this.defaultHeaderValue },
    ];
    this.endpointError = "";
    this.syncMobilePanelsFromActiveTab();
    this.resetJsonEditors();
  }

  private deconstructObject(object: Record<string, unknown>, type: string) {
    const objectArray = [];

    switch (type) {
      case "Body": {
        Object.entries(object).forEach(([objKey, objValue], index) => {
          let dataType = "String";
          if (typeof objValue === "number") {
            dataType = "Number";
          } else if (typeof objValue === "boolean") {
            dataType = "Boolean";
          }
          this.requestBodyDataTypes[index] = dataType;
          const obj = {
            key: objKey,
            value:
              dataType === "Boolean" ? String(objValue) : (objValue as string),
          };
          objectArray.push(obj);
        });
        break;
      }
      case "Headers": {
        Object.entries(object).forEach(([objKey, objValue]) => {
          const obj = { key: objKey, value: String(objValue ?? "") };
          objectArray.push(obj);
        });
        break;
      }
    }

    return objectArray;
  }

  onEditorModeChange(mode: EditorMode): void {
    this.editorMode = mode;
    if (mode === "json") {
      this.syncJsonEditorsFromState();
    }
  }

  onActiveTabChange(tab: string): void {
    this.activeTab = tab;
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
      this.requestBodyDataTypes = [""];
      return;
    }
    if (!this.isPlainObject(value)) {
      return;
    }
    this.applyBodyFromParsed(value);
  }

  onMobileIndexChange(value: string | number | (string | number)[] | null): void {
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

    const orderedEntries: Array<{ key: string; value: string }> = [];
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
    this.requestBodyDataTypes = [];
    const bodyArray = this.deconstructObject(parsed, "Body");
    if (!bodyArray.length) {
      this.requestBody = [{ key: "", value: "" }];
      this.requestBodyDataTypes = [""];
      return;
    }
    this.requestBody = bodyArray;
  }

  private isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
}
