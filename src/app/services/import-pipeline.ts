import { Injectable, inject, signal } from "@angular/core";
import { readImportText, type EnvironmentDoc, type Imported, type ValidationIssue } from "@wayfarer/core";
import { ImportRefused, ImportWorkerClient } from "../shared/import/import-worker-client";
import { CollectionsStore } from "./collections-store";
import { Diagnostics } from "./diagnostics";
import { EnvironmentsStore } from "./environments-store";

/** An environment of the file, and what storing it does: a new one, or one that replaces the environment of that name. */
export interface EnvironmentImportEntry {
  doc: EnvironmentDoc;
  action: "merge" | "replace";
  targetId?: string | null;
}

/**
 * The one road by which a file reaches the stores (plan P4.1): read, map
 * and validate (in the worker), report, confirm, write. Nothing is stored
 * until `confirm`; `close` stores nothing.
 */
@Injectable({ providedIn: "root" })
export class ImportPipeline {
  private readonly collections = inject(CollectionsStore);
  private readonly environments = inject(EnvironmentsStore);
  private readonly worker = inject(ImportWorkerClient);
  private readonly diagnostics = inject(Diagnostics);

  readonly dialogVisible = signal(false);
  readonly fileName = signal("");
  /** The worker has the file. */
  readonly reading = signal(false);
  /** Why the file cannot be imported. */
  readonly refused = signal<{ message: string; issues: ValidationIssue[] } | null>(null);
  /** The file in the app's model, with its report: what `confirm` will store. */
  readonly imported = signal<Imported | null>(null);
  readonly duplicateAsNew = signal(false);
  readonly environmentEntries = signal<EnvironmentImportEntry[]>([]);
  readonly storing = signal(false);

  private text = "";

  /** A file was chosen in a file input. The input is cleared, so the same file can be chosen again. */
  async pick(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (file) await this.stage(file.name, await readImportText(file));
  }

  /** Maps and checks a file's text, and opens the report. */
  async stage(fileName: string, text: string): Promise<void> {
    this.text = text;
    this.fileName.set(fileName);
    this.duplicateAsNew.set(false);
    this.dialogVisible.set(true);
    await this.read();
  }

  /** A Wayfarer collection as a copy under new ids: the file is mapped again. */
  async toggleDuplicateAsNew(value: boolean): Promise<void> {
    this.duplicateAsNew.set(value);
    await this.read();
  }

  setEntryAction(index: number, action: "merge" | "replace"): void {
    const current = this.environmentEntries()[index];
    if (!current || (action === "replace" && !current.targetId)) return;
    this.environmentEntries.update((entries) => entries.map((entry, i) => (i === index ? { ...current, action } : entry)));
  }

  /** Stores what the report showed: each collection in a transaction of its own, scripts unapproved (D6). */
  async confirm(): Promise<void> {
    const imported = this.imported();
    if (!imported || this.refused()) {
      this.close();
      return;
    }
    this.storing.set(true);
    try {
      for (const { payload } of imported.collections) {
        await this.collections.importCollection(payload, { duplicateAsNew: this.duplicateAsNew() });
      }
      await this.storeEnvironments();
    } finally {
      this.storing.set(false);
    }
    this.close();
  }

  close(): void {
    this.dialogVisible.set(false);
    this.refused.set(null);
    this.imported.set(null);
    this.environmentEntries.set([]);
    this.duplicateAsNew.set(false);
    this.fileName.set("");
    this.text = "";
  }

  private async read(): Promise<void> {
    this.reading.set(true);
    this.refused.set(null);
    try {
      const imported = await this.worker.run(this.text, { duplicateAsNew: this.duplicateAsNew() });
      this.imported.set(imported);
      this.environmentEntries.set(this.entriesOf(imported.environments));
    } catch (error) {
      this.imported.set(null);
      this.environmentEntries.set([]);
      if (error instanceof ImportRefused) {
        this.refused.set({ message: error.message, issues: error.issues });
      } else {
        this.diagnostics.record(error, "import: the worker failed");
        this.refused.set({ message: "The file could not be read: the import stopped with an error.", issues: [] });
      }
    } finally {
      this.reading.set(false);
    }
  }

  /** Each environment of the file against the one of the same name here, if there is one. */
  private entriesOf(environments: EnvironmentDoc[]): EnvironmentImportEntry[] {
    const existing = this.environments.environments();
    return environments.map((doc) => {
      const target = existing.find((env) => env.name === doc.name);
      return { doc, action: target ? "replace" : "merge", targetId: target?.id ?? target?.meta.id ?? null };
    });
  }

  private async storeEnvironments(): Promise<void> {
    const usedNames = new Set(this.environments.environments().map((env) => env.name));
    for (const entry of this.environmentEntries()) {
      const { name, description, vars } = entry.doc;
      if (entry.action === "replace" && entry.targetId) {
        await this.environments.updateEnvironment(entry.targetId, { name, description, vars });
        usedNames.add(name);
      } else {
        await this.environments.createEnvironment({ name: uniqueName(name, usedNames), description, vars });
      }
    }
  }
}

/** `name`, or `name (2)` and so on when it is taken; the name given is then taken too. */
function uniqueName(name: string, used: Set<string>): string {
  let candidate = name;
  for (let counter = 2; used.has(candidate); counter += 1) candidate = `${name} (${counter})`;
  used.add(candidate);
  return candidate;
}
