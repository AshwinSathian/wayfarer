import { ChangeDetectionStrategy, Component, inject, signal } from "@angular/core";
import { VariableFocus } from "../../services/variable-focus";
import { VariableToken } from "../../shared/environments/env-resolution";
import { WorkspaceStore } from "../../state/workspace-store";

/** One chip per `{{variable}}` in the draft, with its source and value. */
@Component({
  selector: "app-variable-chips",
  templateUrl: "./variable-chips.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VariableChips {
  protected readonly store = inject(WorkspaceStore);
  private readonly variableFocus = inject(VariableFocus);

  private readonly highlightedVariableSource = signal<VariableToken["source"] | null>(null);

  protected handleVariableChipClick(token: VariableToken): void {
    this.highlightedVariableSource.update((current) => (current === token.source ? null : token.source));
    if (token.source === "environment") {
      this.variableFocus.requestFocus(token);
    }
  }
}
