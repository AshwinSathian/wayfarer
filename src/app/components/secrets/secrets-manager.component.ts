import { CommonModule } from "@angular/common";
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  model,
  output,
  signal,
} from "@angular/core";
import { FormsModule } from "@angular/forms";
import { ConfirmationService } from "primeng/api";
import { ButtonModule } from "primeng/button";
import { DialogModule } from "primeng/dialog";
import { InputTextModule } from "primeng/inputtext";
import { TooltipModule } from "primeng/tooltip";
import { SecretDoc, SecretId } from "../../models/secrets.models";
import { EnvironmentsService } from "../../services/environments.service";
import { SecretsService } from "../../services/secrets.service";
import { SecretCryptoService } from "../../shared/secrets/secret-crypto.service";
import { extractSecretId } from "../../shared/secrets/secret-reference.util";
import { VariableFocusService } from "../../services/variable-focus.service";
import { VariableToken } from "../../shared/environments/env-resolution.util";

interface SecretUsage {
  environmentId: string;
  environmentName: string;
  variableKey: string;
}

interface SecretRow {
  doc: SecretDoc;
  usages: SecretUsage[];
}

/**
 * Dedicated Secrets management view (Part D/E, Phase 3) — lists every
 * secret across every environment in one place instead of only as flagged
 * rows buried inside the Environments editor. Owns no crypto/persistence
 * logic itself: every read/write goes through SecretsService, which in
 * turn defers to SecretCryptoService (encryption) and SecretsRepository
 * (storage) — this component is presentation + orchestration only.
 */
@Component({
  selector: "app-secrets-manager",
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, DialogModule, InputTextModule, TooltipModule],
  templateUrl: "./secrets-manager.component.html",
  styleUrls: ["./secrets-manager.component.css"],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SecretsManagerComponent {
  private readonly secretsService = inject(SecretsService);
  private readonly secretCrypto = inject(SecretCryptoService);
  private readonly environmentsService = inject(EnvironmentsService);
  private readonly variableFocus = inject(VariableFocusService);
  private readonly confirmationService = inject(ConfirmationService);

  readonly visible = model(false);
  readonly requestUnlock = output<void>();

  private readonly docs = signal<SecretDoc[]>([]);
  readonly loading = signal(false);
  readonly revealedValues = signal<Record<SecretId, string>>({});
  readonly revealingId = signal<SecretId | null>(null);
  readonly editingId = signal<SecretId | null>(null);
  readonly editingName = signal("");

  readonly rows = computed<SecretRow[]>(() => {
    const environments = this.environmentsService.environments();
    const usagesBySecretId = new Map<SecretId, SecretUsage[]>();
    for (const env of environments) {
      for (const [key, value] of Object.entries(env.vars ?? {})) {
        const secretId = extractSecretId(value);
        if (!secretId) {
          continue;
        }
        const list = usagesBySecretId.get(secretId) ?? [];
        list.push({
          environmentId: env.meta.id,
          environmentName: env.name,
          variableKey: key,
        });
        usagesBySecretId.set(secretId, list);
      }
    }
    return this.docs()
      .slice()
      .sort((a, b) => b.meta.createdAt - a.meta.createdAt)
      .map((doc) => ({
        doc,
        usages: usagesBySecretId.get(doc.id) ?? [],
      }));
  });

  get secretsUnlocked(): boolean {
    return this.secretCrypto.isUnlocked;
  }

  constructor() {
    effect(() => {
      if (this.visible()) {
        void this.refresh();
      } else {
        // Never let decrypted plaintext outlive the dialog being open.
        this.revealedValues.set({});
        this.cancelRename();
      }
    });
  }

  close(): void {
    this.visible.set(false);
  }

  async refresh(): Promise<void> {
    this.loading.set(true);
    try {
      this.docs.set(await this.secretsService.listSecrets());
    } finally {
      this.loading.set(false);
    }
  }

  async reveal(id: SecretId): Promise<void> {
    if (!this.secretCrypto.isUnlocked) {
      this.requestUnlock.emit();
      return;
    }
    this.revealingId.set(id);
    try {
      const plaintext = await this.secretsService.readSecret(id);
      if (plaintext !== null) {
        this.revealedValues.update((current) => ({ ...current, [id]: plaintext }));
      }
    } finally {
      this.revealingId.set(null);
    }
  }

  hideRevealed(id: SecretId): void {
    this.revealedValues.update((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  }

  isRevealed(id: SecretId): boolean {
    return id in this.revealedValues();
  }

  revealedValue(id: SecretId): string | undefined {
    return this.revealedValues()[id];
  }

  beginRename(row: SecretRow): void {
    this.editingId.set(row.doc.id);
    this.editingName.set(row.doc.name);
  }

  cancelRename(): void {
    this.editingId.set(null);
    this.editingName.set("");
  }

  async commitRename(): Promise<void> {
    const id = this.editingId();
    const name = this.editingName().trim();
    if (!id || !name) {
      this.cancelRename();
      return;
    }
    const updated = await this.secretsService.renameSecret(id, name);
    if (updated) {
      this.docs.update((docs) => docs.map((doc) => (doc.id === id ? updated : doc)));
    }
    this.cancelRename();
  }

  confirmDelete(row: SecretRow): void {
    this.confirmationService.confirm({
      header: "Delete secret?",
      message: row.usages.length
        ? `"${row.doc.name}" is still referenced by ${row.usages.length} environment variable${
            row.usages.length === 1 ? "" : "s"
          } (${row.usages.map((u) => `${u.environmentName}.${u.variableKey}`).join(", ")}). Those variables will stop resolving. This cannot be undone.`
        : `This will permanently delete the encrypted secret "${row.doc.name}". This cannot be undone.`,
      icon: "pi pi-exclamation-triangle",
      acceptLabel: "Delete",
      rejectLabel: "Cancel",
      acceptButtonStyleClass: "p-button-danger",
      accept: () => void this.deleteSecret(row.doc.id),
    });
  }

  private async deleteSecret(id: SecretId): Promise<void> {
    await this.secretsService.deleteSecret(id);
    this.hideRevealed(id);
    await this.refresh();
  }

  /** Closes this dialog and hands off to the Environments editor's existing variable-highlight flow (VariableFocusService), reused as-is. */
  locate(usage: SecretUsage): void {
    const token: VariableToken = {
      key: usage.variableKey,
      source: "environment",
      location: "header",
      field: "secrets-view",
      environmentId: usage.environmentId,
    };
    this.close();
    this.variableFocus.requestFocus(token);
  }
}
