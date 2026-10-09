import { ChangeDetectionStrategy, Component, inject, output, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { MatButton } from "@angular/material/button";
import { MatFormField } from "@angular/material/form-field";
import { MatInput } from "@angular/material/input";
import { readImportText } from "@wayfarer/core";
import { SecretsVault } from "../../services/secrets-vault";
import { Icon } from "../../shared/icon/icon";

type Mode = "passphrase" | "export" | "import";

/** What the vault itself can do, apart from its secrets: change its passphrase, and go to and come from a file. */
@Component({
  selector: "app-vault-actions",
  imports: [FormsModule, Icon, MatButton, MatFormField, MatInput],
  templateUrl: "./vault-actions.html",
  host: { class: "block" },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VaultActions {
  private readonly vault = inject(SecretsVault);

  /** Secrets were imported: the list is out of date. */
  readonly imported = output<void>();
  readonly requestUnlock = output<void>();

  protected readonly mode = signal<Mode | null>(null);
  protected readonly current = signal("");
  protected readonly next = signal("");
  protected readonly confirm = signal("");
  protected readonly fileName = signal("");
  protected readonly busy = signal(false);
  protected readonly error = signal("");
  protected readonly done = signal("");
  private fileText = "";

  protected open(mode: Mode): void {
    if (mode === "import" && !this.vault.isUnlocked()) {
      // Imported secrets are encrypted under this vault's key.
      this.requestUnlock.emit();
      return;
    }
    this.close();
    this.mode.set(mode);
  }

  protected close(): void {
    this.mode.set(null);
    this.current.set("");
    this.next.set("");
    this.confirm.set("");
    this.fileName.set("");
    this.fileText = "";
    this.error.set("");
    this.done.set("");
  }

  protected async pickFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    // At most one byte past the limit is read; the vault refuses a file over it.
    this.fileText = await readImportText(file);
    this.fileName.set(file.name);
    this.error.set("");
  }

  protected async submit(): Promise<void> {
    this.error.set("");
    this.busy.set(true);
    try {
      const mode = this.mode();
      if (mode === "passphrase") await this.changePassphrase();
      else if (mode === "export") await this.exportVault();
      else if (mode === "import") await this.importVault();
    } finally {
      this.busy.set(false);
    }
  }

  private async changePassphrase(): Promise<void> {
    // Used exactly as typed, like the passphrase it replaces.
    const next = this.next();
    if (next !== this.confirm()) {
      this.error.set("Passphrases do not match.");
    } else if (next.length < 8) {
      this.error.set("Passphrase must be at least 8 characters.");
    } else if (await this.vault.changePassphrase(this.current(), next)) {
      this.finish("Passphrase changed. The old one no longer opens the vault.");
    } else {
      this.error.set("Incorrect passphrase. Nothing was changed.");
    }
  }

  private async exportVault(): Promise<void> {
    const json = await this.vault.exportFile(this.current());
    if (json === null) {
      this.error.set("Incorrect passphrase. Nothing was exported.");
      return;
    }
    const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "wayfarer-vault.json";
    anchor.click();
    URL.revokeObjectURL(url);
    this.finish("Exported. The file opens with the passphrase the vault has now.");
  }

  private async importVault(): Promise<void> {
    const result = await this.vault.importFile(this.fileText, this.current());
    if ("error" in result) {
      this.error.set(result.error);
      return;
    }
    this.finish(`Imported ${result.imported} secret${result.imported === 1 ? "" : "s"}.`);
    this.imported.emit();
  }

  private finish(message: string): void {
    this.close();
    this.done.set(message);
  }
}
