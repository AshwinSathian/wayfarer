import { computed, effect, signal, type Signal } from "@angular/core";
import {
  HEX_VIEW_BYTES,
  evaluatePath,
  hexDump,
  indentXml,
  parseJson,
  responseViews,
  stringifyJson,
  type ResponseView,
} from "@wayfarer/core";
import type { Diagnostics } from "../../services/diagnostics";
import type { ExchangeView } from "../../state/exchange-view";
import type { JsonWorkerClient, WorkerSearchResult } from "../../shared/json-worker/json-worker-client";

const LARGE_PAYLOAD = 1_000_000;

export const VIEW_LABELS: Record<ResponseView, string> = {
  json: "JSON",
  text: "Text",
  xml: "XML",
  html: "Preview",
  image: "Image",
  hex: "Hex",
};

/**
 * What the Body tab shows of one exchange and what it does to it: the views a body can be shown in, the async pretty
 * print and search against a worker (with token-based cancellation, so a slow parse of a huge payload cannot clobber
 * a newer, smaller one), the path filter, the image's `blob:` and the hex dump. Made in the viewer's injection
 * context, since it holds effects.
 */
export class BodyModel {
  readonly hexViewBytes = HEX_VIEW_BYTES;
  /** The body as text: of an error status too, since a 404 page is as much HTML as a 200 one. */
  readonly bodyText = computed(() => (this.exchange().isError ? this.exchange().error : this.exchange().data));
  /** The views this body can be shown in; the first is the one its content type asks for. */
  readonly views = computed(() => {
    const { binary, contentType, bodyIsJson } = this.exchange();
    return responseViews({
      contentType: binary?.contentType ?? contentType,
      binary: !!binary,
      json: bodyIsJson,
      length: binary?.byteLength ?? this.bodyText().length,
    });
  });
  readonly viewOptions = computed(() => this.views().map((view) => ({ value: view, label: VIEW_LABELS[view] })));
  /** The user's choice of view for this response. */
  readonly viewOverride = signal<ResponseView | null>(null);
  readonly view = computed(() => {
    const chosen = this.viewOverride();
    return chosen && this.views().includes(chosen) ? chosen : this.views()[0];
  });
  readonly xmlText = computed(() => (this.view() === "xml" ? indentXml(this.bodyText()) : ""));
  /**
   * The field's text, when it is a path into the JSON body (L-14): it starts with `$`, `.` or `[`, or has an index
   * (`[0]`, `[*]`), as `data.items[*].id` does. Any other text is searched for.
   */
  readonly searchQuery = signal("");
  readonly jsonFilter = computed(() => {
    const text = this.searchQuery().trim();
    return /^[$.[]|\[(\d+|\*)\]/.test(text) ? text.replace(/^\$/, "") : "";
  });
  /** The JSON body, parsed once per response: a path typed key by key reads it again, not the text. */
  private readonly parsedBody = computed(() => (this.view() === "json" ? parseJson(this.bodyText()) : null));
  /** What the path finds, formatted; "" when it finds nothing; null when there is no path. */
  readonly filteredJson = computed(() => {
    const path = this.jsonFilter();
    const parsed = path ? this.parsedBody() : null;
    if (!parsed?.ok) return null;
    const found = evaluatePath(parsed.value, path);
    return found === undefined ? "" : (stringifyJson(found, 4) ?? "");
  });
  /** The path filter matched nothing: said by a region there before the filter is typed in (U-075). */
  readonly filterMissed = computed(() => this.view() === "json" && this.filteredJson() === "");
  /** A `blob:` URL of the image on screen. It is revoked when the response or the view changes. */
  readonly imageUrl = signal<string | null>(null);
  readonly hexText = signal("");
  readonly searchResult = signal<WorkerSearchResult | null>(null);
  readonly searchActiveIndex = signal(0);
  readonly searchPending = signal(false);

  private readonly formattedBody = signal("");
  private readonly formattedError = signal("");
  private bodyFormatToken = 0;
  private errorFormatToken = 0;
  private lastBodySource: string | null = null;
  private lastBodyResult: string | null = null;
  private lastErrorSource: string | null = null;
  private lastErrorResult: string | null = null;
  private searchToken = 0;
  private previousData: string | null = null;
  private previousError: string | null = null;

  constructor(
    private readonly exchange: Signal<ExchangeView>,
    private readonly activeTab: Signal<string>,
    private readonly jsonWorker: JsonWorkerClient,
    private readonly diagnostics: Diagnostics,
  ) {
    // Re-run on a new response and on a change of tab; `prepareFormatting` and `formatAndAssign` no-op on an
    // unchanged source (`lastBodySource`), so calling it on every dependency change is cheap.
    effect(() => {
      const { data, error, bodyIsJson } = this.exchange();
      this.activeTab();

      if (data !== this.previousData || error !== this.previousError) {
        this.previousData = data;
        this.previousError = error;
        this.resetSearchState();
        this.viewOverride.set(null);
      }
      if (!bodyIsJson) {
        this.resetFormattedValues();
        this.resetSearchState();
      }
      this.prepareFormatting();
    });

    effect((onCleanup) => {
      const binary = this.exchange().binary;
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
      const binary = this.exchange().binary;
      if (this.view() !== "hex" || !binary) {
        this.hexText.set("");
        return;
      }
      const head = binary.bytes.slice(0, HEX_VIEW_BYTES);
      if (head instanceof Blob) {
        // A body over the display cap was never held as one buffer: read its start only.
        void head.arrayBuffer().then((buffer) => {
          if (this.exchange().binary === binary) this.hexText.set(hexDump(new Uint8Array(buffer)));
        });
      } else {
        this.hexText.set(hexDump(new Uint8Array(head)));
      }
    });
  }

  get formattedResponseBody(): string {
    return this.exchange().isError ? this.formattedError() : this.formattedBody();
  }

  /** Saves a binary body with its exact bytes (F05). */
  downloadBinary(): void {
    const binary = this.exchange().binary;
    if (!binary) return;
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

  private prepareFormatting(): void {
    const { isError, data, error, bodyIsJson } = this.exchange();
    if (!bodyIsJson) return this.resetFormattedValues();
    // Formatted only for the JSON view: JSON over 5 MB opens as plain text.
    if (this.activeTab() !== "body" || this.view() !== "json") return;
    const source = (isError ? error : data) ?? "";
    if (!source.trim()) {
      if (isError) this.assignFormatted("error", "", "");
      else this.assignFormatted("body", "", "");
      return;
    }
    void this.formatAndAssign(source, isError ? "error" : "body");
  }

  private resetFormattedValues(): void {
    const { data, error } = this.exchange();
    this.assignFormatted("body", data ?? "", data ?? "");
    this.assignFormatted("error", error ?? "", error ?? "");
  }

  private async formatAndAssign(source: string, kind: "body" | "error"): Promise<void> {
    if (kind === "body" && this.lastBodySource === source) {
      this.formattedBody.set(this.lastBodyResult ?? source);
      return;
    }
    if (kind === "error" && this.lastErrorSource === source) {
      this.formattedError.set(this.lastErrorResult ?? source);
      return;
    }
    const token = kind === "body" ? ++this.bodyFormatToken : ++this.errorFormatToken;
    if (Math.max(source.length, this.exchange().contentLength ?? 0) < LARGE_PAYLOAD) {
      const parsed = parseJson(source);
      this.assignFormatted(kind, source, parsed.ok ? (stringifyJson(parsed.value, 4) ?? source) : source);
      return;
    }
    try {
      const formatted = await this.jsonWorker.parsePretty(source, 4);
      if (!this.isCurrentToken(token, kind)) return;
      this.assignFormatted(kind, source, formatted);
    } catch (error) {
      // Not JSON after all, or too much for the worker in time: shown as it came, not parsed on the main thread.
      this.diagnostics.record(error, "response viewer: worker formatting failed, shown as received");
      if (!this.isCurrentToken(token, kind)) return;
      this.assignFormatted(kind, source, source);
    }
  }

  private assignFormatted(kind: "body" | "error", source: string, value: string): void {
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

  private isCurrentToken(token: number, kind: "body" | "error"): boolean {
    return kind === "body" ? token === this.bodyFormatToken : token === this.errorFormatToken;
  }

  async onSearchQueryChange(value: string): Promise<void> {
    this.searchQuery.set(value);
    this.searchActiveIndex.set(0);
    const trimmed = value.trim();
    const corpus = this.formattedResponseBody;
    if (!trimmed || !corpus || this.jsonFilter()) {
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
      if (token === this.searchToken) this.searchResult.set(null);
    } finally {
      if (token === this.searchToken) this.searchPending.set(false);
    }
  }

  stepSearch(direction: number): void {
    const result = this.searchResult();
    if (!result || !result.count) return;
    this.searchActiveIndex.set((this.searchActiveIndex() + direction + result.count) % result.count);
  }

  get currentSearchExcerpt(): string | null {
    const excerpts = this.searchResult()?.excerpts;
    if (!excerpts?.length) return null;
    return excerpts[this.searchActiveIndex()]?.context ?? excerpts[0]?.context ?? null;
  }

  private resetSearchState(): void {
    this.searchQuery.set("");
    this.searchResult.set(null);
    this.searchActiveIndex.set(0);
    this.searchPending.set(false);
    this.searchToken++;
  }
}
