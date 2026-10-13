import { ChangeDetectionStrategy, Component, computed, inject, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { MatButton, MatIconButton } from "@angular/material/button";
import { MatCheckbox } from "@angular/material/checkbox";
import { MatFormField } from "@angular/material/form-field";
import { MatInput } from "@angular/material/input";
import { MatProgressSpinner } from "@angular/material/progress-spinner";
import { BridgeSettings } from "../../services/bridge-settings";
import { Icon } from "../../shared/icon/icon";

/**
 * The Local Bridge's settings, as a pane of Settings: whether requests go
 * through it, where it is, and its token. Nothing is stored until Save: a
 * half-typed address must not become the route of the next request.
 */
@Component({
  selector: "app-bridge-pane",
  imports: [FormsModule, Icon, MatButton, MatIconButton, MatCheckbox, MatFormField, MatInput, MatProgressSpinner],
  templateUrl: "./bridge-pane.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "block" },
})
export class BridgePane {
  private readonly bridge = inject(BridgeSettings);

  protected readonly enabled = signal(this.bridge.config().enabled);
  protected readonly url = signal(this.bridge.config().url);
  protected readonly token = signal(this.bridge.config().token);
  protected readonly showToken = signal(false);
  /** The last test of the connection: not made, on its way, fine, or what is wrong with the bridge. */
  protected readonly test = signal<"idle" | "testing" | "ok" | { problem: string }>("idle");
  protected readonly testProblem = computed(() => {
    const test = this.test();
    return typeof test === "string" ? "" : test.problem;
  });
  /** Said once after a save, until the next edit. */
  protected readonly saved = signal(false);

  /** What is typed differs from what is stored. */
  protected readonly dirty = computed(() => {
    const stored = this.bridge.config();
    return this.enabled() !== stored.enabled || this.url().trim() !== stored.url || this.token().trim() !== stored.token;
  });
  /** Switched on with nowhere to send to: the route would fall back to the page without a word. */
  protected readonly problem = computed(() => (this.enabled() && !this.url().trim() ? "Give the bridge's address, or switch the bridge off." : ""));

  protected edited(): void {
    this.test.set("idle");
    this.saved.set(false);
  }

  protected async testConnection(): Promise<void> {
    this.test.set("testing");
    const problem = await this.bridge.checkHealth(this.url().trim());
    this.test.set(problem === undefined ? "ok" : { problem });
  }

  protected save(): void {
    this.bridge.update({ enabled: this.enabled(), url: this.url().trim(), token: this.token().trim() });
    this.saved.set(true);
  }

  protected discard(): void {
    const stored = this.bridge.config();
    this.enabled.set(stored.enabled);
    this.url.set(stored.url);
    this.token.set(stored.token);
    this.edited();
  }
}
