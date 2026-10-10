import { ChangeDetectionStrategy, Component, inject, input, output, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { MatButton } from "@angular/material/button";
import { MatButtonToggle, MatButtonToggleGroup } from "@angular/material/button-toggle";
import { MatFormField } from "@angular/material/form-field";
import { MatInput } from "@angular/material/input";
import { EnvironmentDoc } from "../../models/environments";
import { SecretsVault } from "../../services/secrets-vault";
import { serializeEnvironmentExport, type ProtectedValues } from "@wayfarer/core";
import { extractSecretId } from "../../shared/secrets/secret-reference";
import { Icon } from "../../shared/icon/icon";
import { Dialog } from "../../ui/dialog";

type Mode = ProtectedValues["mode"];

/** What must be typed before secrets are written to a file as plain text. */
export const PLAIN_TEXT_CONFIRMATION = "EXPORT SECRETS";

/** Exports the environments, asking first what the file should hold of protected variables (P2.11). */
@Component({
  selector: "app-environment-export-dialog",
  imports: [Dialog, FormsModule, Icon, MatButton, MatButtonToggle, MatButtonToggleGroup, MatFormField, MatInput],
  templateUrl: "./environment-export-dialog.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EnvironmentExportDialog {
  private readonly vault = inject(SecretsVault);

  readonly environments = input<EnvironmentDoc[]>([]);
  readonly visible = input(false);
  readonly visibleChange = output<boolean>();
  readonly requestUnlock = output<void>();

  protected readonly confirmation = PLAIN_TEXT_CONFIRMATION;
  protected readonly mode = signal<Mode>("strip");
  protected readonly typed = signal("");
  protected readonly error = signal("");

  protected close(): void {
    this.mode.set("strip");
    this.typed.set("");
    this.error.set("");
    this.visibleChange.emit(false);
  }

  protected async submit(): Promise<void> {
    this.error.set("");
    const protectedValues = await this.protectedValues();
    if (!protectedValues) return;
    const url = URL.createObjectURL(new Blob([serializeEnvironmentExport(this.environments(), protectedValues)], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "environments-export.json";
    anchor.click();
    URL.revokeObjectURL(url);
    this.close();
  }

  /** What the file gets of protected variables, or `null` when it cannot be written yet. */
  private async protectedValues(): Promise<ProtectedValues | null> {
    const mode = this.mode();
    if (mode === "strip") return { mode };
    if (mode === "references") return { mode, vault: await this.vault.bundle() };
    if (this.typed() !== PLAIN_TEXT_CONFIRMATION) {
      this.error.set(`Type ${PLAIN_TEXT_CONFIRMATION} to write secrets as plain text.`);
      return null;
    }
    if (!this.vault.isUnlocked()) {
      this.requestUnlock.emit();
      this.error.set("Unlock the vault, then export again.");
      return null;
    }
    const plaintexts = new Map<string, string>();
    for (const row of this.environments().flatMap((env) => env.vars)) {
      const id = extractSecretId(row.value);
      const plaintext = id ? await this.vault.readSecret(id) : null;
      if (id && plaintext !== null) plaintexts.set(id, plaintext);
    }
    return { mode, plaintexts };
  }
}
