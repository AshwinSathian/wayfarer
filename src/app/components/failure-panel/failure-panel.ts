import { ChangeDetectionStrategy, Component, computed, input, output, signal } from "@angular/core";
import { failurePanel, failures, type ExchangeRecord, type FailureAction } from "@wayfarer/core";
import { Icon } from "../../shared/icon/icon";
import { UiButton } from "../../ui/button";
import { BridgeSetup } from "../exchange-record/bridge-setup";

/**
 * A send that got no response, said once: what happened, why as far as the page can tell, and the one thing to do
 * (S4b3). What the browser or the bridge reported is behind a disclosure. The wording is `failurePanel`'s, which
 * reads the exchange record and adds nothing to what history keeps.
 */
@Component({
  selector: "app-failure-panel",
  imports: [BridgeSetup, Icon, UiButton],
  templateUrl: "./failure-panel.html",
  styleUrl: "./failure-panel.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "block" },
})
export class FailurePanel {
  readonly record = input.required<ExchangeRecord>();
  /** Offered where something can send again: not in a run's row. */
  readonly act = output<FailureAction>();

  protected readonly panel = computed(() => failurePanel(this.record()));
  protected readonly open = signal(false);
  protected readonly label = failures.panel;
  /** No Local Bridge is paired and the page got no answer: the bridge is set up here, in place of the button. */
  protected readonly setup = computed(() => this.panel()?.cls === "unreachable" && !!this.record().unpaired);
  protected readonly detailsName = computed(() =>
    this.panel()?.reporter === "bridge" ? failures.detailsBridge : failures.detailsBrowser,
  );
  protected readonly detailsShow = failures.detailsShow;
}
