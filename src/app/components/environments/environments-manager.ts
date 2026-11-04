import { UndoNotice } from "../../services/undo-notice";
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  OnDestroy,
  OnInit,
  afterNextRender,
  computed,
  effect,
  signal,
  untracked,
  viewChild,
  WritableSignal,
  inject,
  output,
} from "@angular/core";
import { FormsModule } from "@angular/forms";
import { UiInput } from "../../ui/input";
import { UiButton } from "../../ui/button";
import { UiTooltip } from "../../ui/tooltip";
import type { EnvironmentDoc, Row, VariableChange } from "@wayfarer/core";
import { EnvironmentsStore } from "../../services/environments-store";
import { recordDiagnostic } from "../../services/diagnostics";
import { VariableFocus } from "../../services/variable-focus";
import { ImportPipeline } from "../../services/import-pipeline";
import { Icon } from "../../shared/icon/icon";
import { VariablesDialog } from "../variables/variables-dialog";
import { VariableRows, type VariableHolder } from "../variables/variable-rows";
import { EnvironmentExportDialog } from "./environment-export-dialog";
import { StoragePersistence } from "../../services/storage-persistence";

/** The environment open in the editor: its name and description as typed. Its variables are the rows' own. */
interface EnvironmentDraft {
  id: string;
  name: string;
  description?: string;
}

@Component({
  selector: "app-environments-manager",
  imports: [UiInput, Icon, FormsModule, UiButton, UiTooltip, VariableRows, VariablesDialog, EnvironmentExportDialog],
  templateUrl: "./environments-manager.html",
  styleUrl: "./environments-manager.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EnvironmentsManager implements OnInit, OnDestroy {
  private readonly envService = inject(EnvironmentsStore);
  private readonly undo = inject(UndoNotice);
  private readonly variableFocus = inject(VariableFocus);
  /** Every file picked here goes down the one import road (P4.1). */
  protected readonly importPipeline = inject(ImportPipeline);
  private readonly persistence = inject(StoragePersistence);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly newEnvField = viewChild<ElementRef<HTMLInputElement>>("newEnvField");

  readonly requestUnlock = output<void>();

  readonly environments = this.envService.environments;
  readonly activeEnvironment = this.envService.activeEnvironment;
  readonly loading = this.envService.loading;
  readonly globals = this.envService.globals;
  readonly globalsVisible = signal(false);
  readonly globalsHint =
    "Every request can use these as {{name}}, whichever environment is active. An environment's or a collection's variable with the same name wins.";
  readonly selectedId: WritableSignal<string | null> = signal(null);
  readonly draft: WritableSignal<EnvironmentDraft | null> = signal(null);
  /** The open environment's variables, for the rows: they write what changed through the store. */
  readonly holder = computed<VariableHolder | null>(() => {
    const env = this.environments().find((doc) => doc.meta.id === this.selectedId());
    if (!env) return null;
    const id = env.meta.id;
    return {
      id,
      name: env.name,
      rows: env.vars,
      environmentId: id,
      write: (changes) => this.writeVariables(id, changes),
    };
  });
  /** A variable a chip asked to see (U-132), handed to the rows. */
  readonly reveal = signal<{ key: string } | null>(null);

  /** Each write of the name and the description waits for the one before it. */
  private writing: Promise<void> = Promise.resolve();
  /** Why the last write of the name or the description did not land. */
  readonly saveError = signal("");

  readonly newEnvDialogVisible = signal(false);
  readonly newEnvForm = signal({
    name: "",
    description: "",
  });

  constructor() {
    effect(() => {
      const env = this.activeEnvironment();
      if (env && !this.selectedId()) {
        this.selectEnvironment(env.meta.id);
      }
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
        // Shown; a variable the request uses and nothing sets (D4.12's preview) is a new row, its value to type.
        this.reveal.set({ key: token.key });
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
    // The environment being left keeps its name as typed; its rows write theirs when they are shown another's.
    if (this.draft()?.id !== id) void this.commit();
    const env = this.environments().find((doc) => doc.meta.id === id);
    this.selectedId.set(id);
    if (env) this.draft.set({ id, name: env.name, description: env.description });
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
      this.reveal.set({ key: first });
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
    this.selectedId.set(null);
    this.draft.set(null);
    if (remaining.length) this.selectEnvironment(remaining[0].meta.id);
    if (removed)
      this.undo.offer(`Removed ${env.name}.`, async () => {
        await this.envService.restoreEnvironment(removed);
        this.selectEnvironment(removed.doc.meta.id);
      });
  }

  async setActive(env: EnvironmentDoc): Promise<void> {
    await this.envService.setActiveEnvironment(env.meta.id);
  }

  syncDraft(form: EnvironmentDraft): void {
    this.draft.set({ ...form });
  }

  /** The rows' writes: what changed, then the rows the store holds (F62: another tab's write may be in them). */
  private async writeVariables(id: string, changes: VariableChange[]): Promise<readonly Row[] | null> {
    if (!this.environments().some((env) => env.meta.id === id)) return null;
    // Something worth keeping is being written: ask the browser to keep it.
    void this.persistence.request();
    const saved = await this.envService.changeEnvironment(id, changes);
    return saved ? (this.environments().find((env) => env.meta.id === id)?.vars ?? saved.vars) : null;
  }

  /** Writes the name and the description as they are left (DQ9: no Save button). */
  commit(): Promise<void> {
    const draft = this.draft();
    if (!draft) return this.writing;
    this.writing = this.writing
      .then(() => this.writeDetails(draft))
      .catch((error: unknown) => recordDiagnostic(error, "environments: a write ended in an error"));
    return this.writing;
  }

  private async writeDetails(draft: EnvironmentDraft): Promise<void> {
    const stored = this.environments().find((env) => env.meta.id === draft.id);
    if (!stored) return;
    const name = draft.name.trim() || stored.name;
    const description = draft.description?.trim() ?? "";
    if (name === stored.name && description === (stored.description ?? "")) return;
    void this.persistence.request();
    let saved: EnvironmentDoc | null;
    try {
      saved = await this.envService.changeEnvironment(draft.id, [], { name, description });
    } catch (error) {
      recordDiagnostic(error, "environments: a write was refused");
      this.saveError.set(`${name} was not saved: this browser refused the write. Your edits are still here.`);
      return;
    }
    this.saveError.set(saved ? "" : `${name} was not saved: it was deleted in another tab.`);
  }
}
