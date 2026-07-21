import { CommonModule } from "@angular/common";
import { ChangeDetectionStrategy, Component, Signal, effect, signal, inject, input, model } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { MenuItem } from "primeng/api";
import { ButtonModule } from "primeng/button";
import { InputTextModule } from "primeng/inputtext";
import { MenuModule } from "primeng/menu";
import { SkeletonModule } from "primeng/skeleton";
import { TabsModule } from "primeng/tabs";
import { TooltipModule } from "primeng/tooltip";
import { CurlExportContext, buildCurlCommand, toHar } from "../../shared/inspect/export.util";
import { ResponseInspection } from "../../shared/inspect/response-inspector.service";
import { TestResult } from "../../models/test-assertion.models";
import {
  JsonWorkerService,
  WorkerSearchResult,
} from "../../shared/json-worker/json-worker.service";
import { JsonEditorComponent } from "../json-editor/json-editor.component";
import {
  ResponseExportContext,
  buildExportEntry,
} from "../../shared/inspect/response-export-entry.util";
import {
  TIMING_PHASE_ORDER,
  TIMING_SUMMARY_TOOLTIPS,
  TimingBar,
  WATERFALL_TOOLTIP,
  formatBytes,
  formatMs,
  getFallbackBars,
  getTimingBars,
} from "../../shared/inspect/timing-bars.util";
import { writeToClipboard } from "../../shared/http/clipboard.util";

export type { ResponseExportContext } from "../../shared/inspect/response-export-entry.util";

type ResponseTab = "body" | "headers" | "timings" | "tests";

interface ResponseHeader {
  name: string;
  value: string;
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
  changeDetection: ChangeDetectionStrategy.OnPush,
})
// ~430 lines: timing-bar math/formatting and HAR export-entry assembly
// already moved to shared/inspect/timing-bars.util.ts and
// response-export-entry.util.ts (both pure, both testable without this
// component), and the clipboard fallback is now shared/http/clipboard.util.ts
// (deduped with ApiParamsComponent, which had an identical copy). What's
// left is the async JSON pretty-print/search pipeline (formatAndAssign/
// prepareFormatting/onSearchQueryChange), which is inherently stateful -
// it debounces against a Web Worker with token-based cancellation to avoid
// a slow parse of a huge payload clobbering a newer, smaller one - plus the
// signal-based response state itself. See
// docs/plans/plan-specimen-modernization.md Part G for the rest of the
// file-size audit.
export class ResponseViewerComponent {
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

  readonly activeTab = model<ResponseTab>("body");

  readonly timingSummaryTooltips = TIMING_SUMMARY_TOOLTIPS;
  readonly waterfallTooltip = WATERFALL_TOOLTIP;
  readonly timingPhaseOrder = TIMING_PHASE_ORDER;

  private readonly largePayloadThreshold = 1_000_000;
  private readonly formattedBody = signal("");
  private readonly formattedError = signal("");
  private bodyFormatToken = 0;
  private errorFormatToken = 0;
  private lastBodySource: string | null = null;
  private lastBodyResult: string | null = null;
  private lastErrorSource: string | null = null;
  private lastErrorResult: string | null = null;
  readonly searchQuery = signal("");
  readonly searchResult = signal<WorkerSearchResult | null>(null);
  readonly searchActiveIndex = signal(0);
  readonly searchPending = signal(false);
  private searchToken = 0;

  private previousResponseData: string | null = null;
  private previousResponseError: string | null = null;

  constructor() {
    // Signal-driven replacement for ngOnChanges: this component's response
    // data/formatting/search state can change either because a new @Input
    // signal value arrived (a real response landed) or because the user
    // switched tabs — both need to re-run the same formatting pipeline, and
    // effect() naturally re-fires for either without needing SimpleChanges'
    // per-input granularity. prepareFormatting()/formatAndAssign() already
    // no-op on an unchanged source (see lastBodySource/lastErrorSource), so
    // calling it unconditionally on every dependency change is cheap.
    effect(() => {
      const data = this.responseData();
      const error = this.responseError();
      const isJson = this.responseBodyIsJson();
      // Read to establish these as effect dependencies too.
      this.isError();
      this.responseContentLength();
      this.activeTab();

      if (data !== this.previousResponseData || error !== this.previousResponseError) {
        this.previousResponseData = data;
        this.previousResponseError = error;
        this.resetSearchState();
      }

      if (!isJson) {
        this.resetFormattedValues();
        this.resetSearchState();
      }

      this.prepareFormatting();
    });
  }

  get formattedResponseBody(): string {
    if (this.isError()) {
      return this.formattedResponseError;
    }
    return this.formattedBody();
  }

  get formattedResponseError(): string {
    return this.formattedError();
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
    await writeToClipboard(curlText);
  }

  async copyAsHar(): Promise<void> {
    const entry = this.buildExportEntry();
    if (!entry) {
      return;
    }
    await writeToClipboard(JSON.stringify(toHar(entry), null, 2));
  }

  private prepareFormatting(): void {
    if (!this.responseBodyIsJson()) {
      const body = this.responseData() ?? "";
      const error = this.responseError() ?? "";
      this.formattedBody.set(body);
      this.formattedError.set(error);
      this.lastBodySource = body;
      this.lastBodyResult = body;
      this.lastErrorSource = error;
      this.lastErrorResult = error;
      return;
    }

    if (this.activeTab() !== "body") {
      return;
    }

    const source = this.isError() ? this.responseError() : this.responseData();
    const normalized = source ?? "";

    if (!normalized.trim()) {
      if (this.isError()) {
        this.formattedError.set("");
        this.lastErrorSource = "";
        this.lastErrorResult = "";
      } else {
        this.formattedBody.set("");
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
    const body = this.responseData() ?? "";
    const error = this.responseError() ?? "";
    this.formattedBody.set(body);
    this.formattedError.set(error);
    this.lastBodySource = body;
    this.lastBodyResult = body;
    this.lastErrorSource = error;
    this.lastErrorResult = error;
  }

  private async formatAndAssign(
    source: string,
    kind: "body" | "error"
  ): Promise<void> {
    if (kind === "body" && this.lastBodySource === source) {
      this.formattedBody.set(this.lastBodyResult ?? source);
      return;
    }
    if (kind === "error" && this.lastErrorSource === source) {
      this.formattedError.set(this.lastErrorResult ?? source);
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
      this.formattedBody.set(value);
      this.lastBodySource = source;
      this.lastBodyResult = value;
    } else {
      this.formattedError.set(value);
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
    this.searchQuery.set(value);
    this.searchActiveIndex.set(0);
    const trimmed = value.trim();
    const corpus = this.formattedResponseBody;
    if (!trimmed || !corpus) {
      this.searchResult.set(null);
      this.searchPending.set(false);
      this.searchToken++;
      return;
    }
    const token = ++this.searchToken;
    this.searchPending.set(true);
    try {
      const result = await this.jsonWorker.search(corpus, trimmed);
      if (token === this.searchToken) {
        this.searchResult.set(result);
        this.searchActiveIndex.set(0);
      }
    } catch {
      if (token === this.searchToken) {
        this.searchResult.set(null);
      }
    } finally {
      if (token === this.searchToken) {
        this.searchPending.set(false);
      }
    }
  }

  stepSearch(direction: number): void {
    const result = this.searchResult();
    if (!result || !result.count) {
      return;
    }
    const next =
      (this.searchActiveIndex() + direction + result.count) % result.count;
    this.searchActiveIndex.set(next);
  }

  get currentSearchExcerpt(): string | null {
    const excerpts = this.searchResult()?.excerpts;
    if (!excerpts?.length) {
      return null;
    }
    return excerpts[this.searchActiveIndex()]?.context ?? excerpts[0]?.context ?? null;
  }

  private resetSearchState(): void {
    this.searchQuery.set("");
    this.searchResult.set(null);
    this.searchActiveIndex.set(0);
    this.searchPending.set(false);
    this.searchToken++;
  }

  onReadOnlyBodyChange(value: string): void {
    this.formattedBody.set(value);
  }

  onReadOnlyErrorChange(value: string): void {
    this.formattedError.set(value);
  }

  onTabChange(value: ResponseTab | string | number | undefined): void {
    if (value === undefined) {
      return;
    }
    this.activeTab.set(value as ResponseTab);
  }

  get inspectionValue(): ResponseInspection | null {
    const source = this.inspection() ?? this.fallbackInspection;
    return source();
  }

  private buildExportEntry() {
    return buildExportEntry({
      context: this.exportContext(),
      inspection: this.inspectionValue,
      statusCode: this.responseStatusCode(),
      statusText: this.responseStatusText(),
      responseHeaders: this.responseHeaders(),
      isError: this.isError(),
      responseData: this.responseData(),
      responseError: this.responseError(),
    });
  }

  getTimingBars(): TimingBar[] {
    return getTimingBars(this.inspectionValue);
  }

  getFallbackBars(): TimingBar[] {
    return getFallbackBars(this.inspectionValue);
  }

  hasGranularTimings(): boolean {
    return this.getTimingBars().length > 0;
  }

  formatMs(value: number | undefined | null): string {
    return formatMs(value);
  }

  formatBytes(value: number | undefined): string {
    return formatBytes(value);
  }
}
