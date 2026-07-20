import { CommonModule } from "@angular/common";
import { Component, OnInit, effect, signal, WritableSignal, inject, output } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { ButtonModule } from "primeng/button";
import { ChipModule } from "primeng/chip";
import { DialogModule } from "primeng/dialog";
import { InputTextModule } from "primeng/inputtext";
import { PanelModule } from "primeng/panel";
import { TabsModule } from "primeng/tabs";
import { TextareaModule } from "primeng/textarea";
import { TooltipModule } from "primeng/tooltip";
import { EnvironmentDoc, EnvironmentId } from "../../models/environments.models";
import { EnvironmentsService } from "../../services/environments.service";
import { SecretsService } from "../../services/secrets.service";
import { SecretCryptoService } from "../../shared/secrets/secret-crypto.service";
import { JsonEditorComponent } from "../json-editor/json-editor.component";
import { VariableFocusService } from "../../services/variable-focus.service";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import {
  serializeEnvironmentExport,
  validateEnvironmentExport,
} from "../../shared/environments/environment-io.util";

interface EnvironmentDraft {
  id: EnvironmentId;
  name: string;
  description?: string;
  vars: { key: string; value: string }[];
  jsonText: string;
  jsonValid: boolean;
}

interface EnvironmentImportEntry {
  doc: EnvironmentDoc;
  action: "merge" | "replace";
  targetId?: EnvironmentId | null;
}

@Component({
  selector: "app-environments-manager",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ButtonModule,
    InputTextModule,
    TextareaModule,
    TabsModule,
    PanelModule,
    DialogModule,
    TooltipModule,
    ChipModule,
    JsonEditorComponent,
  ],
  templateUrl: "./environments-manager.component.html",
  styleUrls: ["./environments-manager.component.css"],
})
export class EnvironmentsManagerComponent implements OnInit {
  private readonly envService = inject(EnvironmentsService);
  private readonly secretsService = inject(SecretsService);
  private readonly secretCrypto = inject(SecretCryptoService);
  private readonly variableFocus = inject(VariableFocusService);

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
  private readonly secretPreview: Record<string, string> = {};
  envImportDialogVisible = false;
  envImportErrors: string[] = [];
  pendingEnvImport: EnvironmentImportEntry[] = [];
  envImportFileName = "";
  newEnvDialogVisible = false;
  newEnvForm = {
    name: "",
    description: "",
  };
  focusedVariableKey: string | null = null;
  private focusTimeoutHandle: ReturnType<typeof setTimeout> | null = null;

  constructor() {
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

  async ngOnInit(): Promise<void> {
    await this.envService.ensureLoaded();
  }

  selectEnvironment(id: EnvironmentId): void {
    const env = this.environments().find((doc) => doc.meta.id === id);
    this.selectedId.set(id);
    if (env) {
      this.draft.set(this.toDraft(env));
    }
    this.focusedVariableKey = null;
  }

  openNewEnvironmentDialog(): void {
    this.newEnvForm = { name: "", description: "" };
    this.newEnvDialogVisible = true;
  }

  async submitNewEnvironment(): Promise<void> {
    const name = this.newEnvForm.name.trim();
    if (!name) {
      return;
    }
    const doc = await this.envService.createEnvironment({
      name,
      description: this.newEnvForm.description?.trim(),
    });
    this.newEnvDialogVisible = false;
    this.selectEnvironment(doc.meta.id);
  }

  closeNewEnvironmentDialog(): void {
    this.newEnvDialogVisible = false;
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
    const text = await file.text();
    const parsed = validateEnvironmentExport(text);
    this.envImportErrors = parsed.errors ?? [];
    this.pendingEnvImport = parsed.payload
      ? this.buildEnvImportEntries(parsed.payload)
      : [];
    this.envImportFileName = file.name;
    this.envImportDialogVisible = true;
    input.value = "";
  }

  async confirmEnvironmentImport(): Promise<void> {
    if (!this.pendingEnvImport.length || this.envImportErrors.length) {
      this.closeEnvImportDialog();
      return;
    }
    const usedNames = new Set(this.environments().map((env) => env.name));
    for (const entry of this.pendingEnvImport) {
      if (entry.action === "replace" && entry.targetId) {
        await this.envService.updateEnvironment(entry.targetId, {
          name: entry.doc.name,
          description: entry.doc.description,
          vars: entry.doc.vars,
        });
        usedNames.add(entry.doc.name);
      } else {
        const name = this.ensureUniqueEnvironmentName(entry.doc.name, usedNames);
        await this.envService.createEnvironment({
          name,
          description: entry.doc.description,
          vars: entry.doc.vars,
        });
      }
    }
    this.closeEnvImportDialog();
  }

  closeEnvImportDialog(): void {
    this.envImportDialogVisible = false;
    this.envImportErrors = [];
    this.pendingEnvImport = [];
    this.envImportFileName = "";
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
    return typeof value === "string" && /\{\{\s*\$secret\.[a-z0-9-]+\s*\}\}/i.test(value);
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
      // TODO: The 'emit' function requires a mandatory void argument
      this.requestUnlock.emit();
      return;
    }
    const secretId = await this.secretsService.saveSecret({
      name: pair.key.trim(),
      environmentId: draft.id,
      plaintext: String(pair.value),
    });
    draft.vars[index].value = `{{$secret.${secretId}}}`;
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
    const secretId = this.extractSecretId(value);
    if (!secretId) {
      return;
    }
    const plaintext = await this.secretsService.readSecret(secretId);
    if (plaintext !== null) {
      this.secretPreview[secretId] = plaintext;
      this.draft.set({ ...draft });
    }
  }

  getSecretPreview(value: string | undefined): string | null {
    const secretId = this.extractSecretId(value ?? "");
    if (!secretId) {
      return null;
    }
    return this.secretPreview[secretId] ?? null;
  }

  get secretsUnlocked(): boolean {
    return this.secretCrypto.isUnlocked;
  }

  setEnvImportAction(index: number, action: "merge" | "replace"): void {
    const current = this.pendingEnvImport[index];
    if (!current) {
      return;
    }
    if (action === "replace" && !current.targetId) {
      return;
    }
    this.pendingEnvImport[index] = { ...current, action };
    this.pendingEnvImport = [...this.pendingEnvImport];
  }

  private extractSecretId(value: string): string | null {
    const match = value.match(/\{\{\s*\$secret\.([a-z0-9-]+)\s*\}\}/i);
    return match ? match[1] : null;
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

  private buildEnvImportEntries(payload: EnvironmentDoc[]): EnvironmentImportEntry[] {
    const existing = this.environments();
    return payload.map((doc) => {
      const target = existing.find((env) => env.name === doc.name);
      return {
        doc,
        action: target ? "replace" : "merge",
        targetId: target?.id ?? target?.meta.id ?? null,
      };
    });
  }

  private ensureUniqueEnvironmentName(name: string, used: Set<string>): string {
    if (!used.has(name)) {
      used.add(name);
      return name;
    }
    let counter = 2;
    let candidate = `${name} (${counter})`;
    while (used.has(candidate)) {
      counter += 1;
      candidate = `${name} (${counter})`;
    }
    used.add(candidate);
    return candidate;
  }

  private highlightVariable(key: string): void {
    this.focusedVariableKey = key;
    if (this.focusTimeoutHandle) {
      clearTimeout(this.focusTimeoutHandle);
    }
    this.focusTimeoutHandle = setTimeout(() => {
      this.focusedVariableKey = null;
      this.focusTimeoutHandle = null;
    }, 2500);
  }
}
