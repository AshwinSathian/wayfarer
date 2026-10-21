import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { UiButton } from "../../ui/button";
import { MatFormField } from "@angular/material/form-field";
import { MatInput } from "@angular/material/input";
import { EnvironmentDoc } from "@wayfarer/core";
import { SecretsVault } from "../../services/secrets-vault";
import { exportedValue, serializeEnvironmentExport, type ProtectedValues } from "@wayfarer/core";
import { extractSecretId } from "../../shared/secrets/secret-reference";
import { Icon } from "../../shared/icon/icon";
import { saveJsonFile } from "../../shared/save-file";
import { Dialog } from "../../ui/dialog";
import { UiSegmented, type UiSegment } from "../../ui/segmented";
import { UiSelect } from "../../ui/select";

type Mode = ProtectedValues["mode"];

/** What must be typed before secrets are written to a file as plain text. */
export const PLAIN_TEXT_CONFIRMATION = "EXPORT SECRETS";

/** Exports the environments, asking first what the file should hold of protected variables (P2.11). */
@Component({
  selector: "app-environment-export-dialog",
  imports: [Dialog, FormsModule, Icon, UiButton, MatFormField, MatInput, UiSelect, UiSegmented],
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
  /** The app's own file holds every environment; a Postman environment file holds one. */
  protected readonly format = signal<"wayfarer" | "postman">("wayfarer");
  /** The id of the environment a Postman file is written from. Blank: the first. */
  protected readonly chosen = signal("");
  protected readonly environmentOptions = computed(() => this.environments().map((environment) => ({ value: environment.meta.id, label: environment.name })));
  protected readonly mode = signal<Mode>("strip");
  protected readonly formats: UiSegment<"wayfarer" | "postman">[] = [
    { value: "wayfarer", label: "Wayfarer" },
    { value: "postman", label: "Postman" },
  ];
  protected readonly modes = computed<UiSegment<Mode>[]>(() => [
    { value: "strip", label: "Leave out" },
    ...(this.format() === "wayfarer" ? [{ value: "references" as const, label: "With the vault" }] : []),
    { value: "plain", label: "Plain text" },
  ]);
  protected readonly typed = signal("");
  protected readonly error = signal("");

  /** A Postman file has no place for the vault: "With the vault" is not offered for it. */
  protected setFormat(format: "wayfarer" | "postman"): void {
    this.format.set(format);
    if (format === "postman" && this.mode() === "references") this.mode.set("strip");
    this.error.set("");
  }

  protected close(): void {
    this.format.set("wayfarer");
    this.chosen.set("");
    this.mode.set("strip");
    this.typed.set("");
    this.error.set("");
    this.visibleChange.emit(false);
  }

  protected async submit(): Promise<void> {
    this.error.set("");
    const protectedValues = await this.protectedValues();
    if (!protectedValues) return;
    if (this.format() === "postman") {
      const environment = this.environments().find((entry) => entry.meta.id === this.chosen()) ?? this.environments()[0];
      if (!environment) return;
      const { postmanEnvironment } = await import("@wayfarer/core/postman");
      const file = postmanEnvironment(environment, exportedValue(protectedValues));
      saveJsonFile(`${environment.name.replace(/\s+/g, "-").toLowerCase()}.postman_environment.json`, JSON.stringify(file, null, 2));
    } else {
      saveJsonFile("environments-export.json", serializeEnvironmentExport(this.environments(), protectedValues));
    }
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
