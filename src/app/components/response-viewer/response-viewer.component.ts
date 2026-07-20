import { CommonModule } from "@angular/common";
import { Component, Input, OnChanges, Signal, SimpleChanges, signal, inject, input, output } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { MenuItem } from "primeng/api";
import { ButtonModule } from "primeng/button";
import { InputTextModule } from "primeng/inputtext";
import { MenuModule } from "primeng/menu";
import { SkeletonModule } from "primeng/skeleton";
import { TabsModule } from "primeng/tabs";
import { TooltipModule } from "primeng/tooltip";
import {
  CurlExportContext,
  InspectorExportEntry,
  buildCurlCommand,
  toHar,
} from "../../shared/inspect/export.util";
import { ResponseInspection } from "../../shared/inspect/response-inspector.service";
import { TestResult } from "../../models/test-assertion.models";
import {
  JsonWorkerService,
  WorkerSearchResult,
} from "../../shared/json-worker/json-worker.service";
import { JsonEditorComponent } from "../json-editor/json-editor.component";

type ResponseTab = "body" | "headers" | "timings" | "tests";

interface ResponseHeader {
  name: string;
  value: string;
}

interface TimingBar {
  key?: string;
  label: string;
  duration: number;
  percent: number;
  tooltip?: string;
}

export interface ResponseExportContext {
  id: string;
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: unknown;
}

@Component({
  selector: "app-response-viewer",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TabsModule,
    SkeletonModule,
    TooltipModule,
    JsonEditorComponent,
    ButtonModule,
    MenuModule,
    InputTextModule,
  ],
  templateUrl: "./response-viewer.component.html",
})
export class ResponseViewerComponent implements OnChanges {
  private readonly jsonWorker = inject(JsonWorkerService);

  readonly loading = input(false);
  readonly responseData = input("");
  readonly responseError = input("");
  readonly responseBodyIsJson = input(false);
  readonly responseHeaders = input<ResponseHeader[]>([]);
  readonly responseStatusCode = input<number>();
  readonly responseStatusText = input<string>();
  readonly isError = input(false);
  readonly inspection = input<Signal<ResponseInspection | null> | null>();
  readonly responseContentLength = input<number>();
  readonly exportContext = input<ResponseExportContext | null>(null);
  readonly testResults = input<TestResult[]>([]);

  exportItems: MenuItem[] = [
    {
      label: "Copy as cURL",
      icon: "pi pi-terminal",
      command: () => this.copyAsCurl(),
    },
    {
      label: "Copy as HAR",
      icon: "pi pi-copy",
      command: () => this.copyAsHar(),
    },
  ];

  private readonly fallbackInspection = signal<ResponseInspection | null>(null);

  private _activeTab: ResponseTab = "body";
  @Input()
  get activeTab(): ResponseTab {
    return this._activeTab;
  }
  set activeTab(value: ResponseTab) {
    this._activeTab = value;
    if (value === "body") {
      this.prepareFormatting();
    }
  }

  readonly activeTabChange = output<ResponseTab>();

  readonly timingSummaryTooltips = {
    duration:
      "Overall time between sending the request and receiving the last byte of the response.",
    transferSize:
      "Total bytes transferred over the network for this response, including headers if available.",
    encodedBodySize:
      "Size of the compressed response body as delivered over the network.",
    decodedBodySize:
      "Size of the response body after decompression in the browser.",
  };

  readonly waterfallTooltip =
    "Each bar shows how much time was spent in a network phase relative to the total response duration.";

  readonly timingPhaseOrder: {
    key: keyof NonNullable<ResponseInspection["phases"]>;
    label: string;
    description: string;
  }[] = [
    {
      key: "redirect",
      label: "Redirect",
      description:
        "Time spent following HTTP redirects before the final request.",
    },
    {
      key: "dns",
      label: "DNS",
      description: "Lookup time to resolve the host name to an IP address.",
    },
    {
      key: "tcp",
      label: "TCP",
      description: "TCP handshake duration, including establishing the socket.",
    },
    {
      key: "tls",
      label: "TLS",
      description: "Secure connection setup (TLS/SSL) if HTTPS is used.",
    },
    {
      key: "request",
      label: "Request",
      description:
        "Time from finishing the connection to sending the first byte of the request body.",
    },
    {
      key: "ttfb",
      label: "TTFB",
      description:
        "Time to first byte—server processing plus initial network latency.",
    },
    {
      key: "content",
      label: "Content",
      description:
        "Time to receive the full response body after the first byte arrives.",
    },
  ];

  private readonly phaseDescriptionMap = new Map(
    this.timingPhaseOrder.map((phase) => [phase.key, phase.description])
  );

  private readonly largePayloadThreshold = 1_000_000;
  private formattedBody = "";
  private formattedError = "";
  private bodyFormatToken = 0;
  private errorFormatToken = 0;
  private lastBodySource: string | null = null;
  private lastBodyResult: string | null = null;
  private lastErrorSource: string | null = null;
  private lastErrorResult: string | null = null;
  searchQuery = "";
  searchResult: WorkerSearchResult | null = null;
  searchActiveIndex = 0;
  searchPending = false;
  private searchToken = 0;

  ngOnChanges(changes: SimpleChanges): void {
    if ("responseData" in changes || "responseError" in changes) {
      this.resetSearchState();
    }

    if (
      "responseData" in changes ||
      "responseError" in changes ||
      "responseBodyIsJson" in changes ||
      "isError" in changes ||
      "responseContentLength" in changes
    ) {
      this.prepareFormatting();
    }

    if ("activeTab" in changes && this._activeTab === "body") {
      this.prepareFormatting();
    }

    if ("responseBodyIsJson" in changes && !this.responseBodyIsJson()) {
      this.resetFormattedValues();
      this.resetSearchState();
    }
  }

  get formattedResponseBody(): string {
    if (this.isError()) {
      return this.formattedResponseError;
    }
    return this.formattedBody;
  }

  get formattedResponseError(): string {
    return this.formattedError;
  }

  get testPassCount(): number {
    return this.testResults().filter((r) => r.passed).length;
  }

  get testFailCount(): number {
    return this.testResults().filter((r) => !r.passed).length;
  }

  get canExport(): boolean {
    return (
      !this.loading() &&
      !!this.exportContext() &&
      this.responseStatusCode() !== undefined
    );
  }

  async copyAsCurl(): Promise<void> {
    const context = this.exportContext();
    if (!context) {
      return;
    }
    const curlContext: CurlExportContext = {
      method: context.method,
      url: context.url,
      headers: context.headers,
      body: context.body,
    };
    const curlText = buildCurlCommand(curlContext);
    await this.writeToClipboard(curlText);
  }

  async copyAsHar(): Promise<void> {
    const entry = this.buildExportEntry();
    if (!entry) {
      return;
    }
    await this.writeToClipboard(JSON.stringify(toHar(entry), null, 2));
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

  private prepareFormatting(): void {
    if (!this.responseBodyIsJson()) {
      this.formattedBody = this.responseData() ?? "";
      this.formattedError = this.responseError() ?? "";
      this.lastBodySource = this.formattedBody;
      this.lastBodyResult = this.formattedBody;
      this.lastErrorSource = this.formattedError;
      this.lastErrorResult = this.formattedError;
      return;
    }

    if (this._activeTab !== "body") {
      return;
    }

    const source = this.isError() ? this.responseError() : this.responseData();
    const normalized = source ?? "";

    if (!normalized.trim()) {
      if (this.isError()) {
        this.formattedError = "";
        this.lastErrorSource = "";
        this.lastErrorResult = "";
      } else {
        this.formattedBody = "";
        this.lastBodySource = "";
        this.lastBodyResult = "";
      }
      return;
    }

    if (this.isError()) {
      void this.formatAndAssign(normalized, "error");
    } else {
      void this.formatAndAssign(normalized, "body");
    }
  }

  private resetFormattedValues(): void {
    this.formattedBody = this.responseData() ?? "";
    this.formattedError = this.responseError() ?? "";
    this.lastBodySource = this.formattedBody;
    this.lastBodyResult = this.formattedBody;
    this.lastErrorSource = this.formattedError;
    this.lastErrorResult = this.formattedError;
  }

  private async formatAndAssign(
    source: string,
    kind: "body" | "error"
  ): Promise<void> {
    if (kind === "body" && this.lastBodySource === source) {
      this.formattedBody = this.lastBodyResult ?? source;
      return;
    }
    if (kind === "error" && this.lastErrorSource === source) {
      this.formattedError = this.lastErrorResult ?? source;
      return;
    }

    const token =
      kind === "body" ? ++this.bodyFormatToken : ++this.errorFormatToken;

    const useWorker = this.shouldUseWorker(source);

    if (!useWorker) {
      const result = this.prettyPrintInline(source);
      this.assignFormatted(kind, source, result);
      return;
    }

    try {
      const formatted = await this.jsonWorker.parsePretty(source, 4);
      if (!this.isCurrentToken(token, kind)) {
        return;
      }
      this.assignFormatted(kind, source, formatted);
    } catch {
      if (!this.isCurrentToken(token, kind)) {
        return;
      }
      const fallback = this.prettyPrintInline(source);
      this.assignFormatted(kind, source, fallback);
    }
  }

  private assignFormatted(
    kind: "body" | "error",
    source: string,
    value: string
  ): void {
    if (kind === "body") {
      this.formattedBody = value;
      this.lastBodySource = source;
      this.lastBodyResult = value;
    } else {
      this.formattedError = value;
      this.lastErrorSource = source;
      this.lastErrorResult = value;
    }
  }

  private shouldUseWorker(source: string): boolean {
    const hint = this.responseContentLength() ?? 0;
    return Math.max(source.length, hint) >= this.largePayloadThreshold;
  }

  private isCurrentToken(token: number, kind: "body" | "error"): boolean {
    return kind === "body"
      ? token === this.bodyFormatToken
      : token === this.errorFormatToken;
  }

  private prettyPrintInline(input: string): string {
    try {
      return JSON.stringify(JSON.parse(input), null, 4);
    } catch {
      return input;
    }
  }

  async onSearchQueryChange(value: string): Promise<void> {
    this.searchQuery = value;
    this.searchActiveIndex = 0;
    const trimmed = value.trim();
    const corpus = this.formattedResponseBody;
    if (!trimmed || !corpus) {
      this.searchResult = null;
      this.searchPending = false;
      this.searchToken++;
      return;
    }
    const token = ++this.searchToken;
    this.searchPending = true;
    try {
      const result = await this.jsonWorker.search(corpus, trimmed);
      if (token === this.searchToken) {
        this.searchResult = result;
        this.searchActiveIndex = result.count ? 0 : 0;
      }
    } catch {
      if (token === this.searchToken) {
        this.searchResult = null;
      }
    } finally {
      if (token === this.searchToken) {
        this.searchPending = false;
      }
    }
  }

  stepSearch(direction: number): void {
    const result = this.searchResult;
    if (!result || !result.count) {
      return;
    }
    const next =
      (this.searchActiveIndex + direction + result.count) % result.count;
    this.searchActiveIndex = next;
  }

  get currentSearchExcerpt(): string | null {
    const excerpts = this.searchResult?.excerpts;
    if (!excerpts?.length) {
      return null;
    }
    return excerpts[this.searchActiveIndex]?.context ?? excerpts[0]?.context ?? null;
  }

  private resetSearchState(): void {
    this.searchQuery = "";
    this.searchResult = null;
    this.searchActiveIndex = 0;
    this.searchPending = false;
    this.searchToken++;
  }

  onReadOnlyBodyChange(value: string): void {
    this.formattedBody = value;
  }

  onReadOnlyErrorChange(value: string): void {
    this.formattedError = value;
  }

  onTabChange(value: ResponseTab | string | number | undefined): void {
    if (value === undefined) {
      return;
    }
    const tab = value as ResponseTab;
    this._activeTab = tab;
    this.activeTabChange.emit(tab);
    if (tab === "body") {
      this.prepareFormatting();
    }
  }

  get inspectionValue(): ResponseInspection | null {
    const source = this.inspection() ?? this.fallbackInspection;
    return source();
  }

  private buildExportEntry(): InspectorExportEntry | null {
    const context = this.exportContext();
    if (!context) {
      return null;
    }

    const inspection = this.inspectionValue;
    const url = context.url || inspection?.url || "";
    const responseStatusCode = this.responseStatusCode();
    const statusCode =
      responseStatusCode !== undefined ? responseStatusCode : null;

    if (!url || statusCode === null) {
      return null;
    }

    const startedDateTime = inspection?.startEpoch
      ? new Date(inspection.startEpoch).toISOString()
      : new Date().toISOString();

    const duration =
      typeof inspection?.duration === "number" &&
      Number.isFinite(inspection.duration)
        ? inspection.duration
        : Math.max(
            0,
            (inspection?.endTime ?? 0) - (inspection?.startTime ?? 0)
          );

    const entry: InspectorExportEntry = {
      id: inspection?.id ?? context.id ?? this.createFallbackId(),
      startedDateTime,
      time: duration,
      req: {
        method: context.method,
        url,
        headers: normalizeHeaderRecord(context.headers),
        body: context.body,
      },
      res: {
        status: statusCode,
        statusText: this.responseStatusText() ?? "",
        headers: this.buildResponseHeadersRecord(),
        body: this.isError() ? this.responseError() : this.responseData(),
        sizes: inspection?.sizes,
      },
      phases: inspection?.phases,
    };

    return entry;
  }

  private buildResponseHeadersRecord(): Record<string, string> {
    return this.responseHeaders().reduce<Record<string, string>>(
      (acc, header) => {
        if (!header?.name) {
          return acc;
        }
        acc[header.name] = header.value ?? "";
        return acc;
      },
      {}
    );
  }

  private createFallbackId(): string {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
    return `export-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  getTimingBars(): TimingBar[] {
    const inspection = this.inspectionValue;
    if (!inspection?.phases || !inspection.duration) {
      return [];
    }

    return this.timingPhaseOrder
      .map((phase) => {
        const duration = inspection.phases?.[phase.key] ?? 0;
        const percent =
          inspection.duration > 0
            ? Math.min(100, Math.max((duration / inspection.duration) * 100, 0))
            : 0;
        return {
          key: phase.key,
          label: phase.label,
          duration,
          percent,
          tooltip: this.phaseDescriptionMap.get(phase.key),
        };
      })
      .filter((phase) => phase.duration > 0);
  }

  getFallbackBars(): TimingBar[] {
    const inspection = this.inspectionValue;
    if (!inspection?.duration) {
      return [];
    }

    return [
      {
        label: "Total",
        duration: inspection.duration,
        percent: 100,
        tooltip: this.timingSummaryTooltips.duration,
      },
    ];
  }

  hasGranularTimings(): boolean {
    return this.getTimingBars().length > 0;
  }

  formatMs(value: number | undefined | null): string {
    if (!value || value <= 0) {
      return "—";
    }
    if (value < 1) {
      return `${value.toFixed(2)} ms`;
    }
    if (value < 100) {
      return `${value.toFixed(1)} ms`;
    }
    return `${Math.round(value)} ms`;
  }

  formatBytes(value: number | undefined): string {
    if (!value || value <= 0) {
      return "—";
    }
    const units = ["B", "KB", "MB", "GB"];
    let size = value;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex += 1;
    }

    const precision = size >= 100 ? 0 : size >= 10 ? 1 : 2;
    return `${size.toFixed(precision)} ${units[unitIndex]}`;
  }
}

function normalizeHeaderRecord(
  record: Record<string, string>
): Record<string, string> {
  return Object.entries(record ?? {}).reduce<Record<string, string>>(
    (acc, [key, value]) => {
      if (!key) {
        return acc;
      }
      acc[key] = value ?? "";
      return acc;
    },
    {}
  );
}
