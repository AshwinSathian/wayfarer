import { Injectable, inject, signal } from "@angular/core";
import { IMPORT_TOO_LARGE, WORKSPACE_FORMAT, isOversizedImport, parseJson, validateWorkspaceFile } from "@wayfarer/core";
import { WorkspaceRepository } from "../data/workspace-repository";
import { WorkspaceStores } from "../data/workspace-repository";
import { Diagnostics } from "./diagnostics";

/** A whole workspace as one file. The vault's secrets are in it encrypted, as they are stored. */
export interface WorkspaceFile {
  $id: typeof WORKSPACE_FORMAT;
  exportedAt: number;
  stores: WorkspaceStores;
}

const LAST_BACKUP_KEY = "wayfarer:last-backup";
const REMINDER_FROM_KEY = "wayfarer:backup-reminder-from";
const REMINDER_AFTER_MS = 14 * 24 * 60 * 60 * 1000;

/** Backup and restore of everything the app stores, and the reminder to make one (P2.11). */
@Injectable({ providedIn: "root" })
export class WorkspaceBackup {
  private readonly workspaceRepository = inject(WorkspaceRepository);
  private readonly diagnostics = inject(Diagnostics);

  /** True when the last backup, or the first use when there is none, is more than 14 days ago. */
  readonly reminderDue = signal(this.isReminderDue());

  /**
   * The workspace as a file: collections, folders, requests, environments,
   * globals, the vault (encrypted, as stored) and, when asked for, history.
   * The files of request bodies are not in it: a request names its file, as
   * in a collection file.
   */
  async exportJson(options: { history?: boolean } = {}): Promise<string> {
    const file: WorkspaceFile = { $id: WORKSPACE_FORMAT, exportedAt: Date.now(), stores: await this.workspaceRepository.readAll(options.history ?? false) };
    this.remember(LAST_BACKUP_KEY);
    this.reminderDue.set(false);
    return JSON.stringify(file, null, 2);
  }

  /**
   * Replaces the workspace with the one in the file. Returns what is wrong
   * with the file, and then nothing was changed. A restored collection's
   * scripts are not trusted until approved, like any import (D6): a file
   * cannot grant itself trust.
   */
  async restore(text: string): Promise<string[]> {
    if (isOversizedImport(text)) return [IMPORT_TOO_LARGE];
    const parsed = parseJson(text);
    if (!parsed.ok) return ["The file is not valid JSON."];
    const errors = validateWorkspaceFile(parsed.value);
    if (errors.length) return errors;
    const { stores } = parsed.value as WorkspaceFile;
    await this.workspaceRepository.replaceAll({
      ...stores,
      collections: stores.collections.map((collection) => ({ ...collection, scriptTrust: { trusted: false } })),
    });
    return [];
  }

  /** Not now: ask again in 14 days. */
  dismissReminder(): void {
    this.remember(REMINDER_FROM_KEY);
    this.reminderDue.set(false);
  }

  private isReminderDue(): boolean {
    try {
      const from = Math.max(Number(localStorage.getItem(LAST_BACKUP_KEY)) || 0, Number(localStorage.getItem(REMINDER_FROM_KEY)) || 0);
      if (!from) {
        // First use: the 14 days start now.
        localStorage.setItem(REMINDER_FROM_KEY, String(Date.now()));
        return false;
      }
      return Date.now() - from > REMINDER_AFTER_MS;
    } catch (error) {
      this.diagnostics.record(error, "backup: could not read when the last backup was made");
      return false;
    }
  }

  private remember(key: string): void {
    try {
      localStorage.setItem(key, String(Date.now()));
    } catch (error) {
      this.diagnostics.record(error, `backup: could not save ${key}`);
    }
  }
}
