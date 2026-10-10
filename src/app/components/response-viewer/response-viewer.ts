import { JsonPipe } from "@angular/common";
import { ChangeDetectionStrategy, Component, Signal, computed, effect, signal, inject, input, model } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { MatFormField } from "@angular/material/form-field";
import { MatInput } from "@angular/material/input";
import { MatMenu, MatMenuItem, MatMenuTrigger } from "@angular/material/menu";
import { UiMenuItem } from "../../ui/menu-item";
import { MatButton, MatIconButton } from "@angular/material/button";
import { MatOption } from "@angular/material/core";
import { MatSelect } from "@angular/material/select";
import { MatTabLink, MatTabNav, MatTabNavPanel } from "@angular/material/tabs";
import { MatTooltip } from "@angular/material/tooltip";
import { buildCurlCommand, exportRedactor, redactedRequest, toHar } from "../../shared/inspect/export";
import { BinaryBody, HEX_VIEW_BYTES, evaluatePath, hexDump, indentXml, responseViews, type RedactOptions, type ResponseView } from "@wayfarer/core";
import { ResponseInspection } from "../../shared/inspect/response-inspector";
import { TestResult } from "../../models/test-assertion";
import {
  JsonWorkerClient,
  WorkerSearchResult,
} from "../../shared/json-worker/json-worker-client";
import { JsonEditor } from "../json-editor/json-editor";
import { HtmlPreview } from "./html-preview";
import {
  ResponseExportContext,
  buildExportEntry,
} from "../../shared/inspect/response-export-entry";
import {
  TIMING_PHASE_ORDER,
  TIMING_SUMMARY_TOOLTIPS,
  TimingBar,
  WATERFALL_TOOLTIP,
  formatBytes,
  formatMs,
  getFallbackBars,
  getTimingBars,
} from "../../shared/inspect/timing-bars";
import { writeToClipboard } from "../../shared/http/clipboard";
import { Icon } from "../../shared/icon/icon";
import { Diagnostics } from "../../services/diagnostics";
import { parseJson, stringifyJson } from "@wayfarer/core";

export type { ResponseExportContext } from "../../shared/inspect/response-export-entry";

type ResponseTab = "body" | "headers" | "timings" | "tests";

interface ResponseHeader {
  name: string;
  value: string;
}

@Component({
  selector: "app-response-viewer",
  imports: [MatFormField, MatInput, 
    JsonPipe,
    Icon,
    FormsModule,
    MatTabNav, MatTabLink, MatTabNavPanel,
    MatTooltip,
    JsonEditor,
    HtmlPreview,
    MatButton, MatIconButton,
    MatSelect, MatOption,
    MatMenu, MatMenuItem, MatMenuTrigger,
  ],
  templateUrl: "./response-viewer.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
// ~430 lines: timing-bar math/formatting and HAR export-entry assembly
// already moved to shared/inspect/timing-bars.ts and
// response-export-entry.ts (both pure, both testable without this
// component), and the clipboard fallback is now shared/http/clipboard.ts
// (deduped with the composer, which had an identical copy). What's
// left is the async JSON pretty-print/search pipeline (formatAndAssign/
// prepareFormatting/onSearchQueryChange), which is inherently stateful -
// it debounces against a Web Worker with token-based cancellation to avoid
// a slow parse of a huge payload clobbering a newer, smaller one, plus the
// signal-based response state itself.
export class ResponseViewer {
  private readonly diagnostics = inject(Diagnostics);
  private readonly jsonWorker = inject(JsonWorkerClient);

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
  /** What the request's scripts wrote with `console`. */
  readonly scriptLogs = input<string[]>([]);
  /** The request had scripts that were left out because they are not approved. */
  readonly scriptsSkipped = input(false);
  readonly responseBinary = input<BinaryBody | null>(null);
  /** The URL the response came from, when the request was redirected. */
  readonly redirectedTo = input<string>();
  /** The `Content-Type` header as received: it chooses the view. */
  readonly responseContentType = input("");
  /** The browser withheld some response headers (a direct answer from another origin). */
  readonly headersLimited = input(false);

  readonly exportItems: UiMenuItem[] = [
    {
      label: "Copy as cURL",
      icon: "terminal",
      command: () => void this.copyAsCurl(),
    },
    {
      label: "Copy as HAR",
      icon: "content_copy",
      command: () => void this.copyAsHar(),
    },
    { separator: true },
    // Credentials are masked unless asked for; a vault secret is masked either way (D5).
    {
      label: "Copy as cURL with credentials",
      icon: "terminal",
      command: () => void this.copyAsCurl({ credentials: true }),
    },
    {
      label: "Copy as HAR with credentials",
      icon: "content_copy",
      command: () => void this.copyAsHar({ credentials: true }),
    },
  ];

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

  readonly viewLabels: Record<ResponseView, string> = { json: "JSON", text: "Text", xml: "XML", html: "Preview", image: "Image", hex: "Hex" };
  readonly hexViewBytes = HEX_VIEW_BYTES;
  /** The body as text: of an error status too, since a 404 page is as much HTML as a 200 one. */
  readonly bodyText = computed(() => (this.isError() ? this.responseError() : this.responseData()));
  /** The views this body can be shown in; the first is the one its content type asks for. */
  readonly views = computed(() => {
    const binary = this.responseBinary();
    return responseViews({
      contentType: binary?.contentType ?? this.responseContentType(),
      binary: !!binary,
      json: this.responseBodyIsJson(),
      length: binary?.byteLength ?? this.bodyText().length,
    });
  });
  /** The user's choice of view for this response. */
  readonly viewOverride = signal<ResponseView | null>(null);
  readonly view = computed(() => {
    const chosen = this.viewOverride();
    return chosen && this.views().includes(chosen) ? chosen : this.views()[0];
  });
  readonly xmlText = computed(() => (this.view() === "xml" ? indentXml(this.bodyText()) : ""));
  /** A dot path into the JSON body, such as `data.items[*].id`. */
  readonly jsonFilter = signal("");
  /** What the path finds, formatted; "" when it finds nothing; null when there is no path. */
  readonly filteredJson = computed(() => {
    const path = this.jsonFilter().trim();
    const parsed = path ? parseJson(this.bodyText()) : null;
    if (!parsed?.ok) {
      return null;
    }
    const found = evaluatePath(parsed.value, path);
    return found === undefined ? "" : (stringifyJson(found, 4) ?? "");
  });
  /** A `blob:` URL of the image on screen. It is revoked when the response or the view changes. */
  readonly imageUrl = signal<string | null>(null);
  readonly hexText = signal("");

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
        this.viewOverride.set(null);
        this.jsonFilter.set("");
      }

      if (!isJson) {
        this.resetFormattedValues();
        this.resetSearchState();
      }

      this.prepareFormatting();
    });

    effect((onCleanup) => {
      const binary = this.responseBinary();
      if (this.view() !== "image" || !binary) {
        this.imageUrl.set(null);
        return;
      }
      // The type is one of the image types `responseViews` allows, never the server's free choice.
      const url = URL.createObjectURL(new Blob([binary.bytes], { type: binary.contentType }));
      this.imageUrl.set(url);
      onCleanup(() => URL.revokeObjectURL(url));
    });

    effect(() => {
      const binary = this.responseBinary();
      if (this.view() !== "hex" || !binary) {
        this.hexText.set("");
        return;
      }
      const head = binary.bytes.slice(0, HEX_VIEW_BYTES);
      if (head instanceof Blob) {
        // A body over the display cap was never held as one buffer: read its start only.
        void head.arrayBuffer().then((buffer) => {
          if (this.responseBinary() === binary) this.hexText.set(hexDump(new Uint8Array(buffer)));
        });
      } else {
        this.hexText.set(hexDump(new Uint8Array(head)));
      }
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

  /** Saves a binary body with its exact bytes (F05). */
  downloadBinary(): void {
    const binary = this.responseBinary();
    if (!binary) {
      return;
    }
    const extension = binary.contentType.split("/")[1]?.split(/[+;]/)[0] || "bin";
    // Always octet-stream: a blob: URL shares the app's origin, so a
    // server-chosen type such as text/html must never be renderable here.
    const url = URL.createObjectURL(new Blob([binary.bytes], { type: "application/octet-stream" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `response.${extension}`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  get canExport(): boolean {
    return (
      !this.loading() &&
      !!this.exportContext() &&
      this.responseStatusCode() !== undefined
    );
  }

  async copyAsCurl(options: RedactOptions = {}): Promise<void> {
    const context = this.exportContext();
    if (!context) {
      return;
    }
    await writeToClipboard(buildCurlCommand(redactedRequest(context, options)));
  }

  async copyAsHar(options: RedactOptions = {}): Promise<void> {
    const context = this.exportContext();
    const entry = this.buildExportEntry();
    if (!entry || !context) {
      return;
    }
    // The response is masked as well: a server may send a credential back.
    const redactor = exportRedactor(context, options);
    const body = entry.res.body;
    await writeToClipboard(
      JSON.stringify(
        toHar({
          ...entry,
          req: { ...entry.req, ...redactedRequest(context, options) },
          res: {
            ...entry.res,
            headers: Object.fromEntries(redactor.headers(Object.entries(entry.res.headers), options)),
            body: typeof body === "string" ? redactor.text(body) : body,
          },
        }),
        null,
        2
      )
    );
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

    // Formatted only for the JSON view: JSON over 5 MB opens as plain text.
    if (this.activeTab() !== "body" || this.view() !== "json") {
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
    } catch (error) {
      this.diagnostics.record(error, "response viewer: worker formatting failed, formatting inline");
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
    const parsed = parseJson(input);
    return parsed.ok ? (stringifyJson(parsed.value, 4) ?? input) : input;
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
    } catch (error) {
      this.diagnostics.record(error, "response viewer: search failed");
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

  onTabChange(value: ResponseTab | string | number | undefined): void {
    if (value === undefined) {
      return;
    }
    this.activeTab.set(value as ResponseTab);
  }

  get inspectionValue(): ResponseInspection | null {
    return this.inspection()?.() ?? null;
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
