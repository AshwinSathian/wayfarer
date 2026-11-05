import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  OnDestroy,
  afterNextRender,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
  viewChildren,
} from "@angular/core";
import { FormsModule } from "@angular/forms";
import { Tab, TabContent, TabPanel, Tabs } from "@angular/aria/tabs";
import {
  MIN_SECRET_LENGTH,
  applyVariableChanges,
  variableChanges,
  type Row,
  type VariableChange,
} from "@wayfarer/core";
import { UiButton } from "../../ui/button";
import { UiCheckbox } from "../../ui/checkbox";
import { UiInput } from "../../ui/input";
import { UiTabList } from "../../ui/tabs";
import { Icon } from "../../shared/icon/icon";
import { JsonEditor } from "../json-editor/json-editor";
import { SecretsVault, passphraseProblem } from "../../services/secrets-vault";
import { recordDiagnostic } from "../../services/diagnostics";
import { buildSecretReference, extractSecretId, isSecretReference } from "../../shared/secrets/secret-reference";

/**
 * A set of variables these rows edit: an environment's, a collection's or a folder's. The rows write what changed
 * (D22), never a copy of the rows: another tab may have written other variables meanwhile.
 */
export interface VariableHolder {
  /** Which set: another id writes what was typed in the one left and shows this one's rows. */
  readonly id: string;
  /** Named in what a failed write says. */
  readonly name: string;
  /** The rows as they are stored now. */
  readonly rows: readonly Row[];
  /** Filed with a secret marked here, for the secrets list. */
  readonly environmentId?: string;
  /**
   * Writes the changes and gives the rows stored after them (the store's, which may hold another tab's write too),
   * or null when the set is gone. Throws when the browser refuses the write.
   */
  write(changes: VariableChange[]): Promise<readonly Row[] | null>;
}

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

const copyRows = (rows: readonly Row[]): Row[] => rows.map((row) => ({ ...row }));

export interface VariablesDraft {
  holder: VariableHolder;
  vars: Row[];
  /** The variables as they were when this draft was made or last written: a write sends what changed since. */
  loaded: Row[];
  jsonText: string;
  jsonValid: boolean;
}

/**
 * The variable rows of an environment, a collection or a folder (U-041, D5-e): each with its switch, its name, its
 * value, and a lock that keeps the value in the vault as a secret; and the same variables as JSON. Written as they
 * are left (DQ9): there is no Save button.
 */
@Component({
  selector: "app-variable-rows",
  imports: [FormsModule, Icon, JsonEditor, Tab, TabContent, TabPanel, Tabs, UiButton, UiCheckbox, UiInput, UiTabList],
  templateUrl: "./variable-rows.html",
  styleUrl: "./variable-rows.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { "(focusout)": "onFocusOut($event)" },
})
export class VariableRows implements OnDestroy {
  private readonly secretsService = inject(SecretsVault);
  private readonly injector = inject(Injector);
  private readonly keyInputs = viewChildren<ElementRef<HTMLInputElement>>("keyInput");
  private readonly valueInputs = viewChildren<ElementRef<HTMLInputElement>>("valueInput");
  private readonly vaultPassphraseInput = viewChild<ElementRef<HTMLInputElement>>("vaultPassphraseField");
  private readonly vaultForm = viewChild<ElementRef<HTMLElement>>("vaultForm");

  readonly holder = input.required<VariableHolder>();
  /** A variable someone asked to see (a chip, U-132): it is shown, and made as a new row when there is none. */
  readonly reveal = input<{ key: string } | null>(null);

  readonly draft = signal<VariablesDraft | null>(null);
  readonly editorTab = signal<"pairs" | "json">("pairs");
  /** The name of a variable just protected whose value is too short to be found and masked later. */
  readonly shortSecretWarning = signal<string | null>(null);
  readonly focusedVariableKey = signal<string | null>(null);
  private focusTimeoutHandle: ReturnType<typeof setTimeout> | null = null;
  private revealed: { key: string } | null = null;

  private readonly secretPreview = signal<Record<string, string>>({});
  /** Each write waits for the one before it: a blur and a close can ask within one task. */
  private writing: Promise<void> = Promise.resolve();
  /** A signal: the effect that shows another tab's change looks again when these rows' writes are done. */
  private readonly writesInFlight = signal(0);
  /** Why the last write did not land, said under the rows until the next one does. */
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

  constructor() {
    // Locking the vault hides what was revealed while it was open.
    effect(() => {
      if (!this.secretsService.isUnlocked()) this.secretPreview.set({});
    });
    // Another set: what was typed in the one left is written, and this one's rows are shown.
    // The same set changed elsewhere (another tab, a script): it is shown, unless there are edits here that a write
    // has not sent yet. While these rows write, the write lays the change over them; when the last write is done,
    // this looks again, so a change that came in the meantime is not missed. A row without a name yet stays.
    effect(() => {
      const holder = this.holder();
      const draft = untracked(this.draft);
      if (draft?.holder.id !== holder.id) {
        untracked(() => {
          if (draft) void this.commit();
          this.vaultFor.set(null);
          this.protectProblem.set(null);
          this.focusedVariableKey.set(null);
          this.draft.set(this.toDraft(holder));
        });
        return;
      }
      if (this.writesInFlight()) return;
      untracked(() => {
        this.draft.set({ ...draft, holder });
        if (this.hasEdits(draft) || JSON.stringify(holder.rows) === JSON.stringify(draft.loaded)) return;
        const rows = applyVariableChanges(draft.vars, variableChanges(draft.loaded, [...holder.rows]));
        this.draft.set({ ...draft, holder, vars: rows, jsonText: jsonOf(rows), loaded: copyRows(holder.rows) });
      });
    });
    effect(() => {
      const asked = this.reveal();
      const draft = this.draft();
      if (!asked || asked === this.revealed || draft?.holder.id !== this.holder().id) return;
      this.revealed = asked;
      untracked(() => {
        this.editorTab.set("pairs");
        if (!draft.vars.some((row) => row.key === asked.key)) this.addVariable(asked.key);
        this.highlightVariable(asked.key);
      });
    });
  }

  /** A tab closed or another opened: what was typed and not yet written is written now (U-060). */
  ngOnDestroy(): void {
    void this.commit();
  }

  /** A new row, named `key` when one is given: the keyboard goes on in its name, or in its value when it is named. */
  addVariable(key = ""): void {
    const draft = this.draft();
    if (!draft) return;
    draft.vars.push({ key, value: "", enabled: true });
    this.updateDraft(draft);
    this.syncJsonFromPairs();
    // The keyboard goes on in the new row (U-145).
    afterNextRender(() => (key ? this.valueInputs() : this.keyInputs()).at(-1)?.nativeElement.focus(), {
      injector: this.injector,
    });
  }

  /** A variable switched on or off is written at once: a click on a box moves no focus out of the rows (U-041). */
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
    if (!draft) return;
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
      console.debug("[wayfarer] mark as secret: no variables are open");
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

  private async protect(draft: VariablesDraft, index: number, pair: Row | undefined): Promise<void> {
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
        afterNextRender(
          () => {
            // Focus alone scrolled Chromium and WebKit only to the field's edge, with Confirm and Create vault under
            // the window (U-183): the whole form is brought in first. A script's scroll asks for reduced motion itself.
            const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
            this.vaultForm()?.nativeElement.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "nearest" });
            this.vaultPassphraseInput()?.nativeElement.focus({ preventScroll: true });
          },
          { injector: this.injector },
        );
        return;
      }
      console.debug("[wayfarer] mark as secret: the vault is locked, asking to unlock");
      if (!(await this.secretsService.ensureUnlocked())) return;
    }
    console.debug("[wayfarer] mark as secret: saving");
    await this.markSecret(draft.holder.id, index);
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
      await this.markSecret(draft.holder.id, index);
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
  private async markSecret(holderId: string, index: number): Promise<void> {
    const draft = this.draft();
    const pair = draft?.vars[index];
    if (!draft || draft.holder.id !== holderId || !pair) return;
    const plaintext = String(pair.value);
    const secretId = await this.secretsService.saveSecret({
      name: pair.key.trim(),
      environmentId: draft.holder.environmentId,
      plaintext,
    });
    this.shortSecretWarning.set(plaintext.length < MIN_SECRET_LENGTH ? pair.key.trim() : null);
    draft.vars[index].value = buildSecretReference(secretId);
    this.updateDraft(draft);
    this.syncJsonFromPairs();
    await this.commit();
  }

  async revealSecret(index: number): Promise<void> {
    const value = this.draft()?.vars[index]?.value;
    const secretId = typeof value === "string" ? extractSecretId(value) : null;
    if (!secretId) return;
    const plaintext = await this.secretsService.readSecret(secretId);
    if (plaintext !== null) this.secretPreview.update((previews) => ({ ...previews, [secretId]: plaintext }));
  }

  getSecretPreview(value: string | undefined): string | null {
    const secretId = extractSecretId(value ?? "");
    return secretId ? (this.secretPreview()[secretId] ?? null) : null;
  }

  get secretsUnlocked(): boolean {
    return this.secretsService.isUnlocked();
  }

  onPairsChange(): void {
    this.syncJsonFromPairs();
  }

  onJsonChange(text: string, valid: boolean, value: unknown): void {
    const draft = this.draft();
    if (!draft) return;
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
   * Writes what these rows changed (DQ9: no Save button). Called when focus
   * leaves a field, when a row is removed, switched or marked, when another
   * set is shown and when the rows close. Only what changed is sent.
   */
  commit(): Promise<void> {
    const draft = this.draft();
    if (!draft) return this.writing;
    this.writesInFlight.update((n) => n + 1);
    const held = this.secretPending;
    this.writing = this.writing
      .then(() => this.write(draft, held))
      .catch((error: unknown) => recordDiagnostic(error, "variables: a write ended in an error"))
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

  private async write(draft: VariablesDraft, held: number | null = null): Promise<void> {
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
    if (!changes.length) return;
    const { holder } = draft;
    let latest: readonly Row[] | null;
    try {
      latest = await holder.write(changes);
    } catch (error) {
      recordDiagnostic(error, "variables: a write was refused");
      this.saveError.set(`${holder.name} was not saved: this browser refused the write. Your edits are still here.`);
      return;
    }
    if (!latest) {
      this.saveError.set(`${holder.name} was not saved: it was deleted in another tab.`);
      return;
    }
    this.saveError.set("");
    const current = this.draft();
    if (current?.holder.id !== holder.id) return;
    // What another tab wrote meanwhile is laid over the rows here, and what
    // was typed here while this write was on its way stays: the store's copy
    // is the newer one when another tab's write landed while this one was
    // returning (F62).
    const theirs = variableChanges(vars, [...latest]);
    const rows = theirs.length ? applyVariableChanges(current.vars, theirs) : current.vars;
    this.draft.set({ ...current, vars: rows, jsonText: jsonOf(rows), loaded: copyRows(latest) });
  }

  /** What a row says of itself when it would not be kept as typed (DQ9: in place, not dropped silently). */
  rowNote(row: Row): string | null {
    const named = !!row.key.trim();
    const valued = !!String(row.value ?? "").length;
    if (!named && valued) return "This row has no name, so it is not kept. Give it one.";
    if (named && !valued) return "This variable has no value.";
    return null;
  }

  private hasEdits(draft: VariablesDraft): boolean {
    const named = draft.vars.filter((row) => row.key.trim());
    const unnamed = draft.vars.some((row) => !row.key.trim() && String(row.value ?? "").length);
    return !draft.jsonValid || unnamed || variableChanges(draft.loaded, named).length > 0;
  }

  private updateDraft(draft: VariablesDraft): void {
    this.draft.set({ ...draft, vars: [...draft.vars] });
  }

  private syncJsonFromPairs(): void {
    const draft = this.draft();
    if (!draft) return;
    this.draft.set({ ...draft, jsonText: jsonOf(draft.vars), jsonValid: true });
  }

  private toDraft(holder: VariableHolder): VariablesDraft {
    const vars = copyRows(holder.rows);
    return { holder, vars, loaded: copyRows(holder.rows), jsonText: jsonOf(vars), jsonValid: true };
  }

  private highlightVariable(key: string): void {
    this.focusedVariableKey.set(key);
    if (this.focusTimeoutHandle) clearTimeout(this.focusTimeoutHandle);
    this.focusTimeoutHandle = setTimeout(() => {
      this.focusedVariableKey.set(null);
      this.focusTimeoutHandle = null;
    }, 2500);
  }
}
