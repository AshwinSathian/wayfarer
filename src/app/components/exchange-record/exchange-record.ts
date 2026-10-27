import { ChangeDetectionStrategy, Component, computed, input, output } from "@angular/core";
import { recordLines, type ExchangeRecord, type RecordPart } from "@wayfarer/core";
import { UiButton } from "../../ui/button";
import { BridgeSetup } from "./bridge-setup";

/**
 * The exchange record (D4.12): what one send did, one sentence per field,
 * the wire's values in monospace and the app's words in its own face. On a
 * failure it ends with what was reported and the one thing to do.
 */
@Component({
  selector: "app-exchange-record",
  imports: [BridgeSetup, UiButton],
  templateUrl: "./exchange-record.html",
  styleUrl: "./exchange-record.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "block" },
})
export class ExchangeRecordView {
  readonly record = input.required<ExchangeRecord>();
  /** What keeps the exchange: history for a send, the run for a run's request. */
  readonly keeper = input<"history" | "run">("history");
  /** Whether what to do after a failure is offered: not in a run's row, which sends nothing again. */
  readonly actions = input(true);
  /** Offered on a failure the page could not explain, when the request went from the page. */
  readonly sendThroughBridge = output<void>();

  protected readonly lines = computed(() => recordLines(this.record(), this.keeper()));
  /**
   * The browser gave no response and hides why: the Local Bridge can tell. With one paired it is offered; with
   * none, it is set up here (DQ10).
   */
  protected readonly offer = computed((): "bridge" | "setup" | null => {
    const record = this.record();
    if (!this.actions() || record.failure?.kind !== "network" || record.route !== "direct") return null;
    return record.unpaired ? "setup" : "bridge";
  });

  protected wire(part: RecordPart): string | null {
    return typeof part === "string" ? null : part.wire;
  }

  protected words(part: RecordPart): string {
    return typeof part === "string" ? part : "";
  }
}
