import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
  afterNextRender,
  Injector,
} from "@angular/core";
import { recordHeadline, type ExchangeRecord } from "@wayfarer/core";
import type { ModelCallOutcome } from "@wayfarer/core/ai";
import { AI_KEY_NAME, AiSettings } from "../../services/ai-settings";
import { ModelCalls, type PreparedCall } from "../../services/model-calls";
import { recordDiagnostic } from "../../services/diagnostics";
import { UiButton } from "../../ui/button";
import { ExchangeRecordView } from "../exchange-record/exchange-record";

const ROUTE_WORDS = {
  auto: "Route: auto. From this page; the Local Bridge only if the page gets no response and you agree.",
  direct: "Route: direct. From this page.",
  bridge: "Route: Local Bridge. Through the Local Bridge on this machine.",
} as const;

/**
 * The preview of a model call, and its record after (D4.10, docs/design/ai/preview.md): where it goes, by which
 * route, with which key (as ***), and the body byte for byte (AI-3). Nothing is sent but by Send to model (AI-12).
 * The parts of the prompt are the caller's, projected above "What is sent"; the caller rebuilds `call` on a tick.
 */
@Component({
  selector: "app-model-call",
  imports: [UiButton, ExchangeRecordView],
  templateUrl: "./model-call.html",
  styleUrl: "./model-call.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "model-call block", role: "region", "[attr.aria-labelledby]": "'model-call-heading'" },
})
export class ModelCall {
  private readonly calls = inject(ModelCalls);
  private readonly injector = inject(Injector);
  protected readonly ai = inject(AiSettings);

  readonly heading = input.required<string>();
  readonly call = input.required<PreparedCall>();
  /** What the Redactor put *** in, of what the prompt quotes: "Nothing was masked." with nothing. */
  readonly masked = input("Nothing was masked.");
  readonly answered = output<ModelCallOutcome>();
  readonly cancelled = output<void>();

  protected readonly keyName = AI_KEY_NAME;
  protected readonly routeWords = computed(() => ROUTE_WORDS[this.ai.provider()?.route ?? "auto"]);
  protected readonly size = computed(() => {
    const bytes = new TextEncoder().encode(this.call().body).length;
    return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} kB`;
  });
  /** The request line, the headers as sent with the key as ***, a blank line and the body. */
  protected readonly sent = computed(() => {
    const call = this.call();
    const provider = this.ai.provider();
    const keyLine =
      this.ai.keyStored() && provider
        ? [provider.kind === "openai" ? "Authorization: Bearer ***" : "x-api-key: ***"]
        : [];
    return [
      `${call.method} ${call.url}`,
      ...call.headers.map(([name, value]) => `${name}: ${value}`),
      ...keyLine,
      "",
      call.body,
    ].join("\n");
  });
  protected readonly sending = signal(false);
  protected readonly record = signal<ExchangeRecord | null>(null);
  protected readonly said = signal("");
  private controller: AbortController | null = null;
  private readonly headingRef = viewChild<ElementRef<HTMLElement>>("headingRef");

  constructor() {
    afterNextRender(() => this.headingRef()?.nativeElement.focus(), { injector: this.injector });
  }

  protected async send(): Promise<void> {
    if (this.sending() || this.call().blocked) return;
    this.sending.set(true);
    this.said.set("Asking the model…");
    this.controller = new AbortController();
    try {
      const outcome = await this.calls.send(this.call(), this.controller.signal);
      if (outcome.history.record) {
        this.record.set(outcome.history.record);
        this.said.set(recordHeadline(outcome.history.record));
      }
      this.answered.emit(outcome);
    } catch (error) {
      recordDiagnostic(error, "ai: a model call was not made");
      this.said.set(error instanceof Error ? error.message : String(error));
    } finally {
      this.sending.set(false);
      this.controller = null;
    }
  }

  protected stop(): void {
    this.controller?.abort();
  }
}
