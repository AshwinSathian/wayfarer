import { ChangeDetectionStrategy, Component, input, signal } from "@angular/core";
import type { ExchangeRecord, PastRequest } from "@wayfarer/core";
import { UiButton } from "../../ui/button";
import { ExchangeRecordView } from "../exchange-record/exchange-record";

/** A model call opened in place (D4.10): its exchange record, and the texts that were kept, on request. */
@Component({
  selector: "app-history-model-record",
  imports: [ExchangeRecordView, UiButton],
  templateUrl: "./history-model-record.html",
  styleUrl: "./history-model-record.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "history-model-record" },
})
export class HistoryModelRecord {
  readonly entry = input.required<PastRequest & { record: ExchangeRecord }>();
  /** Which kept text is shown. */
  protected readonly showing = signal<"sent" | "answer" | null>(null);

  /** The headers of what was sent, as kept: one per line. */
  protected headerLines(request: PastRequest): string {
    return request.sent.headers.map(([name, value]) => `${name}: ${value}`).join("\n");
  }
}
