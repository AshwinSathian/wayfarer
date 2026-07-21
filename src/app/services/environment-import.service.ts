import { Injectable, inject, signal } from "@angular/core";
import { EnvironmentsService } from "./environments.service";
import { EnvironmentDoc, EnvironmentId } from "../models/environments.models";
import { validateEnvironmentExport } from "../shared/environments/environment-io.util";

export interface EnvironmentImportEntry {
  doc: EnvironmentDoc;
  action: "merge" | "replace";
  targetId?: EnvironmentId | null;
}

/**
 * Owns the "import an environments JSON export" dialog's state and the
 * validate -> per-entry merge/replace review -> confirm pipeline, previously
 * all directly on `EnvironmentsManagerComponent`. Same extraction pattern as
 * `RequestSaveService`/`CollectionImportService` — independently testable
 * against a mocked `EnvironmentsService`.
 */
@Injectable({ providedIn: "root" })
export class EnvironmentImportService {
  private readonly envService = inject(EnvironmentsService);

  readonly dialogVisible = signal(false);
  readonly errors = signal<string[]>([]);
  readonly pendingEntries = signal<EnvironmentImportEntry[]>([]);
  readonly fileName = signal("");

  /** Validates a picked file's text, matches each environment against an existing one by name, and stages the review dialog. */
  stageFile(fileName: string, text: string, existing: EnvironmentDoc[]): void {
    const parsed = validateEnvironmentExport(text);
    this.errors.set(parsed.errors ?? []);
    this.pendingEntries.set(
      parsed.payload ? this.buildEntries(parsed.payload, existing) : []
    );
    this.fileName.set(fileName);
    this.dialogVisible.set(true);
  }

  setEntryAction(index: number, action: "merge" | "replace"): void {
    const current = this.pendingEntries()[index];
    if (!current) {
      return;
    }
    if (action === "replace" && !current.targetId) {
      return;
    }
    this.pendingEntries.update((entries) =>
      entries.map((entry, i) => (i === index ? { ...current, action } : entry))
    );
  }

  async confirm(existing: EnvironmentDoc[]): Promise<void> {
    if (!this.pendingEntries().length || this.errors().length) {
      this.close();
      return;
    }
    const usedNames = new Set(existing.map((env) => env.name));
    for (const entry of this.pendingEntries()) {
      if (entry.action === "replace" && entry.targetId) {
        await this.envService.updateEnvironment(entry.targetId, {
          name: entry.doc.name,
          description: entry.doc.description,
          vars: entry.doc.vars,
        });
        usedNames.add(entry.doc.name);
      } else {
        const name = this.ensureUniqueName(entry.doc.name, usedNames);
        await this.envService.createEnvironment({
          name,
          description: entry.doc.description,
          vars: entry.doc.vars,
        });
      }
    }
    this.close();
  }

  close(): void {
    this.dialogVisible.set(false);
    this.errors.set([]);
    this.pendingEntries.set([]);
    this.fileName.set("");
  }

  private buildEntries(
    payload: EnvironmentDoc[],
    existing: EnvironmentDoc[]
  ): EnvironmentImportEntry[] {
    return payload.map((doc) => {
      const target = existing.find((env) => env.name === doc.name);
      return {
        doc,
        action: target ? "replace" : "merge",
        targetId: target?.id ?? target?.meta.id ?? null,
      };
    });
  }

  private ensureUniqueName(name: string, used: Set<string>): string {
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
}
