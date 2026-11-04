import { UndoNotice } from "../../services/undo-notice";
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  OnDestroy,
  OnInit,
  afterNextRender,
  effect,
  signal,
  untracked,
  viewChild,
  viewChildren,
  WritableSignal,
  inject,
  output,
} from "@angular/core";
import { FormsModule } from "@angular/forms";
import { UiInput } from "../../ui/input";
import { UiCheckbox } from "../../ui/checkbox";
import { UiButton } from "../../ui/button";
import { Tab, TabContent, TabPanel, Tabs } from "@angular/aria/tabs";
import { UiTabList } from "../../ui/tabs";
import { UiTooltip } from "../../ui/tooltip";
import { EnvironmentDoc } from "@wayfarer/core";
import { EnvironmentsStore } from "../../services/environments-store";
import { SecretsVault, passphraseProblem } from "../../services/secrets-vault";
import { recordDiagnostic } from "../../services/diagnostics";
import { JsonEditor } from "../json-editor/json-editor";
import { VariableFocus } from "../../services/variable-focus";
import { ImportPipeline } from "../../services/import-pipeline";
import { buildSecretReference, extractSecretId, isSecretReference } from "../../shared/secrets/secret-reference";
import { Icon } from "../../shared/icon/icon";
import { VariablesDialog } from "../variables/variables-dialog";
import { EnvironmentExportDialog } from "./environment-export-dialog";
import { StoragePersistence } from "../../services/storage-persistence";
import {
  MIN_SECRET_LENGTH,
  applyVariableChanges,
  variableChanges,
  type Row,
  type VariableChange,
} from "@wayfarer/core";

/** The JSON view's text: the variables the rows give, by name. A switched-off row or one without a name is not in it. */
function jsonOf(rows: Row[]): string {
  return JSON.stringify(
    Object.fromEntries(
      rows.filter((row) => row.enabled && row.key.trim()).map((row) => [row.key.trim(), row.value ?? ""]),
    ),
    null,
    2,
  );
}

interface EnvironmentDraft {
  id: string;
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
  imports: [
    UiInput,
    UiCheckbox,
    Icon,
    FormsModule,
    UiButton,
    Tab,
    TabContent,
    TabPanel,
    Tabs,
    UiTabList,
    UiTooltip,
    JsonEditor,
    VariablesDialog,
    EnvironmentExportDialog,
  ],
  templateUrl: "./environments-manager.html",
  styleUrl: "./environments-manager.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EnvironmentsManager implements OnInit, OnDestroy {
  private readonly envService = inject(EnvironmentsStore);
  private readonly undo = inject(UndoNotice);
  private readonly secretsService = inject(SecretsVault);
  private readonly variableFocus = inject(VariableFocus);
  /** Every file picked here goes down the one import road (P4.1). */
  protected readonly importPipeline = inject(ImportPipeline);
  private readonly persistence = inject(StoragePersistence);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly keyInputs = viewChildren<ElementRef<HTMLInputElement>>("keyInput");
  private readonly valueInputs = viewChildren<ElementRef<HTMLInputElement>>("valueInput");
  private readonly vaultPassphraseInput = viewChild<ElementRef<HTMLInputElement>>("vaultPassphraseField");
  private readonly newEnvField = viewChild<ElementRef<HTMLInputElement>>("newEnvField");

  readonly requestUnlock = output<void>();

  protected readonly Object = Object;
  readonly environments = this.envService.environments;
  readonly activeEnvironment = this.envService.activeEnvironment;
  readonly loading = this.envService.loading;
  readonly globals = this.envService.globals;
  /** The name of a variable just protected whose value is too short to be found and masked later. */
  readonly shortSecretWarning = signal<string | null>(null);
  readonly globalsVisible = signal(false);
  readonly globalsHint =
    "Every request can use these as {{name}}, whichever environment is active. An environment's or a collection's variable with the same name wins.";
  readonly selectedId: WritableSignal<string | null> = signal(null);
  readonly draft: WritableSignal<EnvironmentDraft | null> = signal(null);
  readonly editorTab = signal<"pairs" | "json">("pairs");

  private readonly secretPreview = signal<Record<string, string>>({});
  /** Each write waits for the one before it: a blur and a close can ask within one task. */
  private writing: Promise<void> = Promise.resolve();
  /** A signal: the effect that shows another tab's change looks again when this editor's writes are done. */
  private readonly writesInFlight = signal(0);
  /** Why the last write did not land, said under the editor until the next one does. */
  readonly saveError = signal("");
  /** The row whose lock asked for a vault while there is none: the passphrase is asked for in that row. */
  readonly vaultFor = signal<number | null>(null);
  readonly vaultPassphrase = signal("");
  readonly vaultConfirmation = signal("");
  readonly vaultError = signal("");
  /**
   * The row on its way to the vault: its lock was pressed, or the vault it
   * asked for is being unlocked or made. Its value is not written until it
   * is the secret's reference, so the plain value never reaches the store.
   */
  private secretPending: number | null = null;
  private protecting = false;
  /** Why a row's lock did nothing, said beside that row. */
  readonly protectProblem = signal<{ index: number; text: string } | null>(null);

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
      if (!this.secretsService.isUnlocked()) this.secretPreview.set({});
    });
    effect(() => {
      const env = this.activeEnvironment();
      if (env && !this.selectedId()) {
        this.selectEnvironment(env.meta.id);
      }
    });
    // The open environment was changed elsewhere (another tab, a script):
    // show it, unless there are edits here that a write has not sent yet.
    // While this editor writes, its write lays the change over the rows; when
    // the last write is done, this looks again, so a change that came in the
    // meantime is not missed. A row without a name yet stays where it is.
    effect(() => {
      const stored = this.environments().find((env) => env.meta.id === this.selectedId());
      if (this.writesInFlight()) return;
      const draft = untracked(this.draft);
      if (!stored || !draft || draft.id !== stored.meta.id || this.hasEdits(draft)) return;
      if (JSON.stringify(stored.vars) === JSON.stringify(draft.loaded)) return;
      const rows = applyVariableChanges(draft.vars, variableChanges(draft.loaded, stored.vars));
      this.draft.set({ ...draft, vars: rows, jsonText: jsonOf(rows), loaded: stored.vars.map((row) => ({ ...row })) });
    });

    effect(() => {
      const token = this.variableFocus.pending();
      // A token with a holder is for a collection's or a folder's settings, which the shell opens.
      if (!token || token.holder) return;
      if (token.source !== "environment" && token.source !== "missing" && token.source !== "global") return;
      untracked(() => {
        this.variableFocus.pending.set(null);
        if (token.source === "global") {
          this.globalsVisible.set(true);
          return;
        }
        // Missing, with no environment in use: a new one, and the variable is its first row (U-132).
        if (token.source === "missing" && !token.environmentId) {
          this.openNewEnvironmentDialog();
          this.firstVariable = token.key;
          return;
        }
        if (token.environmentId && token.environmentId !== this.selectedId()) {
          this.selectEnvironment(token.environmentId);
        }
        this.editorTab.set("pairs");
        // A variable the request uses and nothing sets (D4.12's preview): a row of that name, its value to type.
        if (token.source === "missing") this.addVariable(token.key);
        this.highlightVariable(token.key);
      });
    });
  }

  ngOnInit(): void {
    void this.envService.ensureLoaded();
  }

  /** × and Escape destroy the editor: what was typed and not yet written is written now (U-060). */
  ngOnDestroy(): void {
    void this.commit();
  }

  selectEnvironment(id: string): void {
    // The environment being left keeps what was typed in it.
    if (this.draft()?.id !== id) void this.commit();
    this.vaultFor.set(null);
    this.protectProblem.set(null);
    const env = this.environments().find((doc) => doc.meta.id === id);
    this.selectedId.set(id);
    if (env) {
      this.draft.set(this.toDraft(env));
    }
    this.focusedVariableKey.set(null);
  }

  /** The variable a missing chip asked for, given to the environment being named as its first row. */
  private firstVariable: string | null = null;

  openNewEnvironmentDialog(): void {
    this.firstVariable = null;
    this.newEnvForm.set({ name: "", description: "" });
    this.newEnvDialogVisible.set(true);
    // A row of the list, not a dialog: nothing reads cdkFocusInitial here (C-067).
    afterNextRender(() => this.newEnvField()?.nativeElement.focus(), { injector: this.injector });
  }

  onNewEnvNameChange(value: string): void {
    this.newEnvForm.update((form) => ({ ...form, name: value }));
  }

  /** The inline row's keys (U-044): Enter makes the environment, Escape puts the row away and focus back on New. */
  protected newEnvKey(event: KeyboardEvent, newButton: HTMLElement): void {
    if (event.key === "Enter") {
      event.preventDefault();
      void this.submitNewEnvironment();
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      this.closeNewEnvironmentDialog();
      newButton.focus();
    }
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
    const first = this.firstVariable;
    this.firstVariable = null;
    if (first) {
      this.editorTab.set("pairs");
      this.addVariable(first);
      return;
    }
    // The name's field has gone: focus goes on in the new row, on Use when another is in use (L-19).
    afterNextRender(
      () => {
        const row = this.host.nativeElement.querySelector(`[data-env="${CSS.escape(doc.meta.id)}"]`);
        (row?.querySelector<HTMLElement>(".env-use") ?? row?.querySelector<HTMLElement>(".env-item-select"))?.focus();
      },
      { injector: this.injector },
    );
  }

  closeNewEnvironmentDialog(): void {
    this.newEnvDialogVisible.set(false);
  }

  /** The export dialog asks what the file should hold of protected variables. */
  readonly exportDialogVisible = signal(false);

  async saveGlobals(changes: VariableChange[]): Promise<void> {
    await this.envService.changeGlobals(changes);
  }

  async duplicate(env: EnvironmentDoc): Promise<void> {
    const copy = await this.envService.duplicateEnvironment(env.meta.id);
    if (copy) {
      this.selectEnvironment(copy.meta.id);
    }
  }

  /** Deletes at once and offers Undo (U-080, DQ9: "Removed {name}. Undo"); the browser's own confirm() asked before. */
  async remove(env: EnvironmentDoc): Promise<void> {
    const removed = await this.envService.deleteEnvironment(env.meta.id);
    const remaining = this.environments();
    this.selectedId.set(remaining.length ? remaining[0].meta.id : null);
    this.draft.set(remaining.length ? this.toDraft(remaining[0]) : null);
    if (removed)
      this.undo.offer(`Removed ${env.name}.`, async () => {
        await this.envService.restoreEnvironment(removed);
        this.selectEnvironment(removed.doc.meta.id);
      });
  }

  async setActive(env: EnvironmentDoc): Promise<void> {
    await this.envService.setActiveEnvironment(env.meta.id);
  }

  /** A new row, named `key` when one is given: the keyboard goes on in its name, or in its value when it is named. */
  addVariable(key = ""): void {
    const draft = this.draft();
    if (!draft) {
      return;
    }
    draft.vars.push({ key, value: "", enabled: true });
    this.updateDraft(draft);
    this.syncJsonFromPairs();
    // The keyboard goes on in the new row (U-145).
    afterNextRender(() => (key ? this.valueInputs() : this.keyInputs()).at(-1)?.nativeElement.focus(), {
      injector: this.injector,
    });
  }

  /** A variable switched on or off is written at once: a click on a box moves no focus out of the editor (U-041). */
  setEnabled(index: number, enabled: boolean): void {
    const draft = this.draft();
    const row = draft?.vars[index];
    if (!draft || !row) return;
    draft.vars[index] = { ...row, enabled };
    this.updateDraft(draft);
    this.syncJsonFromPairs();
    void this.commit();
  }

  removeVariable(index: number): void {
    const draft = this.draft();
    if (!draft) {
      return;
    }
    draft.vars.splice(index, 1);
    this.updateDraft(draft);
    this.syncJsonFromPairs();
    void this.commit();
  }

  isSecretValue(value: string | undefined): boolean {
    return isSecretReference(value);
  }

  async protectVariable(index: number): Promise<void> {
    const draft = this.draft();
    if (!draft) {
      console.debug("[wayfarer] mark as secret: no environment is open");
      return;
    }
    const pair = draft.vars[index];
    this.protectProblem.set(null);
    this.secretPending = index;
    this.protecting = true;
    try {
      await this.protect(draft, index, pair);
    } finally {
      this.protecting = false;
      if (this.vaultFor() !== index) this.secretPending = null;
    }
  }

  private async protect(draft: EnvironmentDraft, index: number, pair: Row | undefined): Promise<void> {
    // C-053's stall (e2e/FLAKES.md): each way a click goes is in the console, so a trace says which it took.
    if (!pair?.key?.trim() || !String(pair.value ?? "").trim()) {
      console.debug("[wayfarer] mark as secret: the row has no name or no value");
      this.protectProblem.set({ index, text: "A variable needs a name and a value to be kept as a secret." });
      return;
    }
    if (!this.secretsService.isUnlocked()) {
      if (!(await this.secretsService.exists())) {
        // The vault is made here, in the row that asked for it (U-136), and then the row is marked.
        console.debug("[wayfarer] mark as secret: there is no vault, asking for a passphrase in the row");
        this.vaultFor.set(index);
        this.vaultPassphrase.set("");
        this.vaultConfirmation.set("");
        this.vaultError.set("");
        afterNextRender(() => this.vaultPassphraseInput()?.nativeElement.focus(), { injector: this.injector });
        return;
      }
      console.debug("[wayfarer] mark as secret: the vault is locked, asking to unlock");
      if (!(await this.secretsService.ensureUnlocked())) return;
    }
    console.debug("[wayfarer] mark as secret: saving");
    await this.markSecret(draft.id, index);
  }

  /** Makes the vault with the passphrase typed in the row, then marks that row's variable a secret (U-135). */
  async createVaultForRow(): Promise<void> {
    const index = this.vaultFor();
    const draft = this.draft();
    if (index === null || !draft) return;
    const passphrase = this.vaultPassphrase();
    const problem = passphraseProblem(passphrase, this.vaultConfirmation());
    if (problem) {
      this.vaultError.set(problem);
      return;
    }
    if (!(await this.secretsService.create(passphrase))) {
      // Another tab made one meanwhile: its passphrase opens it.
      this.vaultFor.set(null);
      if (!(await this.secretsService.ensureUnlocked())) return;
    }
    this.vaultFor.set(null);
    this.vaultError.set("");
    try {
      await this.markSecret(draft.id, index);
    } finally {
      this.secretPending = null;
    }
  }

  cancelVaultForRow(): void {
    this.vaultFor.set(null);
    this.secretPending = null;
    this.vaultError.set("");
  }

  /** Puts the row's value into the vault and writes the row as its reference at once, so no secret is left without a variable. */
  private async markSecret(environmentId: string, index: number): Promise<void> {
    const draft = this.draft();
    const pair = draft?.vars[index];
    if (!draft || draft.id !== environmentId || !pair) return;
    const plaintext = String(pair.value);
    const secretId = await this.secretsService.saveSecret({
      name: pair.key.trim(),
      environmentId: draft.id,
      plaintext,
    });
    this.shortSecretWarning.set(plaintext.length < MIN_SECRET_LENGTH ? pair.key.trim() : null);
    draft.vars[index].value = buildSecretReference(secretId);
    this.updateDraft(draft);
    this.syncJsonFromPairs();
    await this.commit();
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
    return this.secretsService.isUnlocked();
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
      const typed = Object.entries(value as Record<string, string>).map(([key, val]) => ({
        key,
        value: String(val ?? ""),
        enabled: true,
      }));
      // Against the rows the JSON shows: a switched-off row is not in it, and is not removed by it.
      draft.vars = applyVariableChanges(
        draft.vars,
        variableChanges(
          draft.vars.filter((row) => row.enabled),
          typed,
        ),
      );
    }
    this.updateDraft(draft);
  }

  /**
   * Writes what this editor changed (DQ9: no Save button). Called when focus
   * leaves a field, when a row is removed or marked, when another environment
   * is chosen and when the editor closes. Only what changed is sent: another
   * tab may have written other variables meanwhile.
   */
  commit(): Promise<void> {
    const draft = this.draft();
    if (!draft) return this.writing;
    this.writesInFlight.update((n) => n + 1);
    const held = this.secretPending;
    this.writing = this.writing
      .then(() => this.write(draft, held))
      .catch((error: unknown) => recordDiagnostic(error, "environments: a write ended in an error"))
      .finally(() => this.writesInFlight.update((n) => n - 1));
    return this.writing;
  }

  /** Holds back a row's value while its lock is pressed (WebKit focuses no button on a click: this comes first). */
  holdForSecret(index: number): void {
    this.secretPending = index;
    // A press that ends in no click lets the row go again.
    addEventListener("pointerup", () => setTimeout(() => this.releaseHold(index)), { once: true });
  }

  private releaseHold(index: number): void {
    if (this.secretPending === index && this.vaultFor() !== index && !this.protecting) this.secretPending = null;
  }

  /** Focus left a field. Not on its way to a row's lock: that row is about to become a secret's reference. */
  onFocusOut(event: FocusEvent): void {
    if (event.relatedTarget instanceof Element && event.relatedTarget.closest("[data-secret-lock]")) return;
    void this.commit();
  }

  private async write(draft: EnvironmentDraft, held: number | null = null): Promise<void> {
    const stored = this.environments().find((env) => env.meta.id === draft.id);
    if (!stored) {
      if (this.hasEdits(draft)) this.saveError.set(`${draft.name} was not saved: it was deleted in another tab.`);
      return;
    }
    const loadedValue = (key: string) => draft.loaded.find((row) => row.key === key)?.value;
    const vars = draft.vars
      .map((row) => ({ ...row, key: row.key.trim(), value: row.value ?? "" }))
      .flatMap((row, index) => {
        // The row on its way to the vault keeps what is stored until its reference replaces it.
        if (index !== held || isSecretReference(row.value)) return [row];
        const stored = loadedValue(row.key);
        return stored === undefined ? [] : [{ ...row, value: stored }];
      })
      .filter((row) => row.key);
    const changes = draft.jsonValid ? variableChanges(draft.loaded, vars) : [];
    const name = draft.name.trim() || stored.name;
    const description = draft.description?.trim() ?? "";
    if (!changes.length && name === stored.name && description === (stored.description ?? "")) return;
    // Something worth keeping is being written: ask the browser to keep it.
    void this.persistence.request();
    let saved: EnvironmentDoc | null;
    try {
      saved = await this.envService.changeEnvironment(draft.id, changes, { name, description });
    } catch (error) {
      recordDiagnostic(error, "environments: a write was refused");
      this.saveError.set(`${name} was not saved: this browser refused the write. Your edits are still here.`);
      return;
    }
    if (!saved) {
      this.saveError.set(`${name} was not saved: it was deleted in another tab.`);
      return;
    }
    this.saveError.set("");
    const current = this.draft();
    if (current?.id !== saved.meta.id) return;
    // What another tab wrote meanwhile is laid over the rows here, and what
    // was typed here while this write was on its way stays: the store's copy
    // is the newer one when another tab's write landed while this one was
    // returning (F62).
    const latest = this.environments().find((env) => env.meta.id === saved.meta.id) ?? saved;
    const theirs = variableChanges(vars, latest.vars);
    const rows = theirs.length ? applyVariableChanges(current.vars, theirs) : current.vars;
    this.draft.set({ ...current, vars: rows, jsonText: jsonOf(rows), loaded: latest.vars.map((row) => ({ ...row })) });
  }

  /** What a row says of itself when it would not be kept as typed (DQ9: in place, not dropped silently). */
  rowNote(row: Row): string | null {
    const named = !!row.key.trim();
    const valued = !!String(row.value ?? "").length;
    if (!named && valued) return "This row has no name, so it is not kept. Give it one.";
    if (named && !valued) return "This variable is empty.";
    return null;
  }

  private hasEdits(draft: EnvironmentDraft): boolean {
    const named = draft.vars.filter((row) => row.key.trim());
    const unnamed = draft.vars.some((row) => !row.key.trim() && String(row.value ?? "").length);
    return !draft.jsonValid || unnamed || variableChanges(draft.loaded, named).length > 0;
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
