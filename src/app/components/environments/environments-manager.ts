import { ChangeDetectionStrategy, Component, OnInit, effect, signal, WritableSignal, inject, output } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { MatButton, MatIconButton } from "@angular/material/button";
import { Dialog } from "../../ui/dialog";
import { UI_TABS } from "../../ui/tabs";
import { MatTooltip } from "@angular/material/tooltip";
import { EnvironmentDoc, EnvironmentId } from "../../models/environments";
import { EnvironmentsStore } from "../../services/environments-store";
import { SecretsVault } from "../../services/secrets-vault";
import { SecretCrypto } from "../../shared/secrets/secret-crypto";
import { JsonEditor } from "../json-editor/json-editor";
import { VariableFocus } from "../../services/variable-focus";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { serializeEnvironmentExport } from "../../shared/environments/environment-io";
import {
  EnvironmentImport,
} from "../../services/environment-import";
import {
  buildSecretReference,
  extractSecretId,
  isSecretReference,
} from "../../shared/secrets/secret-reference";
import { Icon } from "../../shared/icon/icon";
import { readImportText } from "../../shared/json/safe-json";

interface EnvironmentDraft {
  id: EnvironmentId;
  name: string;
  description?: string;
  vars: { key: string; value: string }[];
  jsonText: string;
  jsonValid: boolean;
}

@Component({
  selector: "app-environments-manager",
  imports: [
    Icon,
    FormsModule,
    MatButton, MatIconButton,
    UI_TABS,
    Dialog,
    MatTooltip,
    JsonEditor,
  ],
  templateUrl: "./environments-manager.html",
  styleUrl: "./environments-manager.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EnvironmentsManager implements OnInit {
  private readonly envService = inject(EnvironmentsStore);
  private readonly secretsService = inject(SecretsVault);
  private readonly secretCrypto = inject(SecretCrypto);
  private readonly variableFocus = inject(VariableFocus);
  private readonly envImport = inject(EnvironmentImport);

  readonly requestUnlock = output<void>();

  protected readonly Object = Object;
  readonly environments = this.envService.environments;
  readonly activeEnvironment = this.envService.activeEnvironment;
  readonly loading = this.envService.loading;
  readonly selectedId: WritableSignal<EnvironmentId | null> = signal(null);
  readonly draft: WritableSignal<EnvironmentDraft | null> = signal(null);
  readonly editorTab = signal<"pairs" | "json">("pairs");

  onEditorTabChange(value: string | number | undefined): void {
    if (value === "pairs" || value === "json") {
      this.editorTab.set(value);
    }
  }
  private readonly secretPreview = signal<Record<string, string>>({});

  // Import-dialog state/pipeline lives in EnvironmentImport now (see
  // its own file) — these are direct pass-throughs so the template doesn't
  // need to change.
  readonly envImportDialogVisible = this.envImport.dialogVisible;
  readonly envImportErrors = this.envImport.errors;
  readonly pendingEnvImport = this.envImport.pendingEntries;
  readonly envImportFileName = this.envImport.fileName;

  readonly newEnvDialogVisible = signal(false);
  readonly newEnvForm = signal({
    name: "",
    description: "",
  });
  readonly focusedVariableKey = signal<string | null>(null);
  private focusTimeoutHandle: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    // Locking the vault hides what was revealed while it was open.
    effect(() => {
      if (!this.secretCrypto.isUnlocked) this.secretPreview.set({});
    });
    effect(() => {
      const env = this.activeEnvironment();
      if (env && !this.selectedId()) {
        this.selectEnvironment(env.meta.id);
      }
    });

    this.variableFocus.focus$
      .pipe(takeUntilDestroyed())
      .subscribe((token) => {
        if (token.source === "environment") {
          if (token.environmentId && token.environmentId !== this.selectedId()) {
            this.selectEnvironment(token.environmentId);
          }
          this.editorTab.set("pairs");
          this.highlightVariable(token.key);
        }
      });
  }

  ngOnInit(): void {
    void this.envService.ensureLoaded();
  }

  selectEnvironment(id: EnvironmentId): void {
    const env = this.environments().find((doc) => doc.meta.id === id);
    this.selectedId.set(id);
    if (env) {
      this.draft.set(this.toDraft(env));
    }
    this.focusedVariableKey.set(null);
  }

  openNewEnvironmentDialog(): void {
    this.newEnvForm.set({ name: "", description: "" });
    this.newEnvDialogVisible.set(true);
  }

  onNewEnvNameChange(value: string): void {
    this.newEnvForm.update((form) => ({ ...form, name: value }));
  }

  onNewEnvDescriptionChange(value: string): void {
    this.newEnvForm.update((form) => ({ ...form, description: value }));
  }

  async submitNewEnvironment(): Promise<void> {
    const name = this.newEnvForm().name.trim();
    if (!name) {
      return;
    }
    const doc = await this.envService.createEnvironment({
      name,
      description: this.newEnvForm().description?.trim(),
    });
    this.newEnvDialogVisible.set(false);
    this.selectEnvironment(doc.meta.id);
  }

  closeNewEnvironmentDialog(): void {
    this.newEnvDialogVisible.set(false);
  }

  exportEnvironments(): void {
    const json = serializeEnvironmentExport(this.environments());
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "environments-export.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async handleEnvironmentImport(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }
    const text = await readImportText(file);
    this.envImport.stageFile(file.name, text, this.environments());
    input.value = "";
  }

  async confirmEnvironmentImport(): Promise<void> {
    await this.envImport.confirm(this.environments());
  }

  closeEnvImportDialog(): void {
    this.envImport.close();
  }

  async duplicate(env: EnvironmentDoc): Promise<void> {
    const copy = await this.envService.duplicateEnvironment(env.meta.id);
    if (copy) {
      this.selectEnvironment(copy.meta.id);
    }
  }

  async remove(env: EnvironmentDoc): Promise<void> {
    if (!confirm(`Delete environment "${env.name}"?`)) {
      return;
    }
    await this.envService.deleteEnvironment(env.meta.id);
    const remaining = this.environments();
    this.selectedId.set(remaining.length ? remaining[0].meta.id : null);
    this.draft.set(remaining.length ? this.toDraft(remaining[0]) : null);
  }

  async setActive(env: EnvironmentDoc): Promise<void> {
    await this.envService.setActiveEnvironment(env.meta.id);
  }

  addVariable(): void {
    const draft = this.draft();
    if (!draft) {
      return;
    }
    draft.vars.push({ key: "", value: "" });
    this.updateDraft(draft);
    this.syncJsonFromPairs();
  }

  removeVariable(index: number): void {
    const draft = this.draft();
    if (!draft) {
      return;
    }
    draft.vars.splice(index, 1);
    this.updateDraft(draft);
    this.syncJsonFromPairs();
  }

  isSecretValue(value: string | undefined): boolean {
    return isSecretReference(value);
  }

  async protectVariable(index: number): Promise<void> {
    const draft = this.draft();
    if (!draft) {
      return;
    }
    const pair = draft.vars[index];
    if (!pair?.key?.trim() || !String(pair.value ?? "").trim()) {
      return;
    }
    if (!this.secretCrypto.isUnlocked) {
      this.requestUnlock.emit();
      return;
    }
    const secretId = await this.secretsService.saveSecret({
      name: pair.key.trim(),
      environmentId: draft.id,
      plaintext: String(pair.value),
    });
    draft.vars[index].value = buildSecretReference(secretId);
    this.updateDraft(draft);
    this.syncJsonFromPairs();
  }

  async revealSecret(index: number): Promise<void> {
    const draft = this.draft();
    if (!draft) {
      return;
    }
    const value = draft.vars[index]?.value;
    if (typeof value !== "string") {
      return;
    }
    const secretId = extractSecretId(value);
    if (!secretId) {
      return;
    }
    const plaintext = await this.secretsService.readSecret(secretId);
    if (plaintext !== null) {
      this.secretPreview.update((previews) => ({ ...previews, [secretId]: plaintext }));
    }
  }

  getSecretPreview(value: string | undefined): string | null {
    const secretId = extractSecretId(value ?? "");
    if (!secretId) {
      return null;
    }
    return this.secretPreview()[secretId] ?? null;
  }

  get secretsUnlocked(): boolean {
    return this.secretCrypto.isUnlocked;
  }

  setEnvImportAction(index: number, action: "merge" | "replace"): void {
    this.envImport.setEntryAction(index, action);
  }

  onPairsChange(): void {
    this.syncJsonFromPairs();
  }

  onJsonChange(text: string, valid: boolean, value: unknown): void {
    const draft = this.draft();
    if (!draft) {
      return;
    }
    draft.jsonText = text;
    draft.jsonValid = valid;
    if (valid && value && typeof value === "object") {
      const vars = Object.entries(value as Record<string, string>).map(
        ([key, val]) => ({ key, value: String(val ?? "") })
      );
      draft.vars = vars;
    }
    this.updateDraft(draft);
  }

  async save(): Promise<void> {
    const draft = this.draft();
    if (!draft || !draft.name.trim() || !draft.jsonValid) {
      return;
    }
    const vars = draft.vars.reduce((acc, item) => {
      if (item.key.trim()) {
        acc[item.key.trim()] = item.value ?? "";
      }
      return acc;
    }, {} as Record<string, string>);
    await this.envService.updateEnvironment(draft.id, {
      name: draft.name.trim(),
      description: draft.description?.trim(),
      vars,
    });
  }

  private updateDraft(draft: EnvironmentDraft): void {
    this.draft.set({ ...draft, vars: [...draft.vars] });
  }

  syncDraft(form: EnvironmentDraft): void {
    this.draft.set({ ...form, vars: [...form.vars] });
  }

  private syncJsonFromPairs(): void {
    const draft = this.draft();
    if (!draft) {
      return;
    }
    const vars = draft.vars
      .filter((item) => item.key.trim())
      .reduce((acc, item) => {
        acc[item.key.trim()] = item.value ?? "";
        return acc;
      }, {} as Record<string, string>);
    draft.jsonText = JSON.stringify(vars, null, 2);
    draft.jsonValid = true;
    this.draft.set({ ...draft });
  }

  private toDraft(env: EnvironmentDoc): EnvironmentDraft {
    const vars = Object.entries(env.vars ?? {}).map(([key, value]) => ({
      key,
      value: value ?? "",
    }));
    return {
      id: env.meta.id,
      name: env.name,
      description: env.description,
      vars,
      jsonText: JSON.stringify(env.vars ?? {}, null, 2),
      jsonValid: true,
    };
  }

  private highlightVariable(key: string): void {
    this.focusedVariableKey.set(key);
    if (this.focusTimeoutHandle) {
      clearTimeout(this.focusTimeoutHandle);
    }
    this.focusTimeoutHandle = setTimeout(() => {
      this.focusedVariableKey.set(null);
      this.focusTimeoutHandle = null;
    }, 2500);
  }
}
