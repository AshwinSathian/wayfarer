import { ChangeDetectionStrategy, Component, OnInit, effect, signal, untracked, WritableSignal, inject, output } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { MatFormField } from "@angular/material/form-field";
import { MatInput } from "@angular/material/input";
import { MatButton, MatIconButton } from "@angular/material/button";
import { Dialog } from "../../ui/dialog";
import { MatTabLink, MatTabNav, MatTabNavPanel } from "@angular/material/tabs";
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
import { VariablesDialog } from "../variables/variables-dialog";
import { applyVariableChanges, readImportText, variableChanges, type Row, type VariableChange } from "@wayfarer/core";

/** The JSON view's text: the variables the rows give, by name. A switched-off row or one without a name is not in it. */
function jsonOf(rows: Row[]): string {
  return JSON.stringify(
    Object.fromEntries(rows.filter((row) => row.enabled && row.key.trim()).map((row) => [row.key.trim(), row.value ?? ""])),
    null,
    2
  );
}

interface EnvironmentDraft {
  id: EnvironmentId;
  name: string;
  description?: string;
  vars: Row[];
  /** The variables as they were when this draft was made: a save sends what changed since. */
  loaded: Row[];
  jsonText: string;
  jsonValid: boolean;
}

@Component({
  selector: "app-environments-manager",
  imports: [MatFormField, MatInput, 
    Icon,
    FormsModule,
    MatButton, MatIconButton,
    MatTabNav, MatTabLink, MatTabNavPanel,
    Dialog,
    MatTooltip,
    JsonEditor,
    VariablesDialog,
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
  readonly globals = this.envService.globals;
  readonly globalsVisible = signal(false);
  readonly globalsHint =
    "Every request can use these as {{name}}, whichever environment is active. An environment's or a collection's variable with the same name wins.";
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
    // The open environment was changed elsewhere (another tab, a script):
    // show it, unless there are edits here that a save has not sent yet.
    effect(() => {
      const stored = this.environments().find((env) => env.meta.id === this.selectedId());
      const draft = untracked(this.draft);
      if (stored && draft && !this.hasEdits(draft) && JSON.stringify(stored.vars) !== JSON.stringify(draft.loaded)) {
        this.draft.set(this.toDraft(stored));
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

  async saveGlobals(changes: VariableChange[]): Promise<void> {
    await this.envService.changeGlobals(changes);
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
    draft.vars.push({ key: "", value: "", enabled: true });
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
    // The editor also reports the text the rows gave it. Only an edit made
    // in the JSON view changes rows, and only the rows of the names it
    // changed: a blank row, a switched-off row and a repeated name stay (F59).
    if (valid && value && typeof value === "object" && text !== jsonOf(draft.vars)) {
      const typed = Object.entries(value as Record<string, string>).map(
        ([key, val]) => ({ key, value: String(val ?? ""), enabled: true })
      );
      draft.vars = applyVariableChanges(draft.vars, variableChanges(draft.vars, typed));
    }
    this.updateDraft(draft);
  }

  async save(): Promise<void> {
    const draft = this.draft();
    if (!draft || !draft.name.trim() || !draft.jsonValid) {
      return;
    }
    const vars = draft.vars
      .map((row) => ({ ...row, key: row.key.trim(), value: row.value ?? "" }))
      .filter((row) => row.key);
    // Only what this editor changed is written: another tab may have saved other variables meanwhile.
    const saved = await this.envService.changeEnvironment(draft.id, variableChanges(draft.loaded, vars), {
      name: draft.name.trim(),
      description: draft.description?.trim() ?? "",
    });
    if (saved && this.selectedId() === saved.meta.id) {
      // What is stored now, the other tab's variables included.
      this.draft.set(this.toDraft(saved));
    }
  }

  private hasEdits(draft: EnvironmentDraft): boolean {
    const named = draft.vars.filter((row) => row.key.trim());
    return !draft.jsonValid || variableChanges(draft.loaded, named).length > 0;
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
    draft.jsonText = jsonOf(draft.vars);
    draft.jsonValid = true;
    this.draft.set({ ...draft });
  }

  private toDraft(env: EnvironmentDoc): EnvironmentDraft {
    const vars = env.vars.map((row) => ({ ...row }));
    return {
      id: env.meta.id,
      name: env.name,
      description: env.description,
      vars,
      loaded: env.vars.map((row) => ({ ...row })),
      jsonText: jsonOf(vars),
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
