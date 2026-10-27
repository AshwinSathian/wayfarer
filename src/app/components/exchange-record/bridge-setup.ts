import { ChangeDetectionStrategy, Component, inject, output, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { BridgeSettings } from "../../services/bridge-settings";
import { NOT_COPIED, writeToClipboard } from "../../shared/http/clipboard";
import { UiButton } from "../../ui/button";
import { UiInput } from "../../ui/input";
import { UiSpinner } from "../../ui/spinner";

/** What starts the bridge on this computer: the npm package, run as it is published. */
export const BRIDGE_COMMAND = "npx wayfarer-bridge";

/**
 * The Local Bridge set up where a send failed with none paired (DQ10,
 * U-138): the command that starts it, with Copy, the pairing code it prints,
 * and once paired, Send again through it.
 */
@Component({
  selector: "app-bridge-setup",
  imports: [FormsModule, UiButton, UiInput, UiSpinner],
  templateUrl: "./bridge-setup.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "block" },
})
export class BridgeSetup {
  private readonly bridge = inject(BridgeSettings);

  readonly sendAgain = output<void>();

  protected readonly command = BRIDGE_COMMAND;
  protected readonly code = signal("");
  protected readonly pairing = signal(false);
  /** What the last copy or pairing did, said by the region below. */
  protected readonly said = signal("");
  protected readonly paired = this.bridge.paired;

  protected async copy(): Promise<void> {
    this.said.set((await writeToClipboard(this.command)) ? `Copied ${this.command}.` : NOT_COPIED);
  }

  /** Enter in the field pairs, as the button does. A listener's value is its return: this returns nothing. */
  protected pairOnEnter(): void {
    if (this.code().trim() && !this.pairing()) void this.pair();
  }

  /** The code the bridge printed, for its token: kept as Settings, Local Bridge keeps one. The route stays as chosen. */
  protected async pair(): Promise<void> {
    this.pairing.set(true);
    const result = await this.bridge.pair(this.bridge.config().url, this.code());
    this.pairing.set(false);
    if ("problem" in result) {
      this.said.set(result.problem);
      return;
    }
    this.bridge.update({ token: result.token });
    this.code.set("");
    this.said.set("Paired: the token is saved.");
  }
}
