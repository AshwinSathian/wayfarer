import { Injectable, computed, inject, signal } from "@angular/core";
import {
  IMPORT_TOO_LARGE,
  WORKSPACE_FORMAT,
  isOversizedImport,
  parseJson,
  validateWorkspaceFile,
} from "@wayfarer/core";
import { WorkspaceRepository } from "../data/workspace-repository";
import { WorkspaceStores } from "../data/workspace-repository";
import { Diagnostics } from "./diagnostics";
import { StoragePersistence } from "./storage-persistence";

/** A whole workspace as one file. The vault's secrets are in it encrypted, as they are stored. */
export interface WorkspaceFile {
  $id: typeof WORKSPACE_FORMAT;
  exportedAt: number;
  stores: WorkspaceStores;
}

const LAST_BACKUP_KEY = "wayfarer:last-backup";
const REMINDER_FROM_KEY = "wayfarer:backup-reminder-from";
const DISMISSED_KEY = "wayfarer:backup-dismissed";
const DAY_MS = 24 * 60 * 60 * 1000;
const REMINDER_AFTER_MS = 14 * DAY_MS;
/** While the browser has not promised to keep the data: Safari deletes it after seven days without a visit (U-137). */
const UNKEPT_REMINDER_AFTER_MS = 5 * DAY_MS;

/** Backup and restore of everything the app stores, and the reminder to make one (P2.11). */
@Injectable({ providedIn: "root" })
export class WorkspaceBackup {
  private readonly workspaceRepository = inject(WorkspaceRepository);
  private readonly diagnostics = inject(Diagnostics);
  private readonly persistence = inject(StoragePersistence);
  /** Moves when a backup or a Not now is stored, so the reminder is worked out again. */
  private readonly answered = signal(0);

  constructor() {
    // First use: the 14 days start now.
    if (!this.time(LAST_BACKUP_KEY) && !this.time(REMINDER_FROM_KEY)) this.remember(REMINDER_FROM_KEY);
  }

  /**
   * Whether to remind: 14 days after the last backup or Not now, counted
   * from the first use. While the browser has not promised to keep the data,
   * also at the first save, and then 5 days after the last backup or Not now
   * (U-137).
   */
  readonly reminderDue = computed(() => {
    this.answered();
    const last = Math.max(this.time(LAST_BACKUP_KEY), this.time(REMINDER_FROM_KEY));
    if (last > 0 && Date.now() - last > REMINDER_AFTER_MS) return true;
    if (this.persistence.persisted() !== false) return false;
    const answered = Math.max(this.time(LAST_BACKUP_KEY), this.time(DISMISSED_KEY));
    return answered ? Date.now() - answered > UNKEPT_REMINDER_AFTER_MS : this.persistence.firstSave() > 0;
  });

  /**
   * The workspace as a file: collections, folders, requests, environments,
   * globals, the vault (encrypted, as stored) and, when asked for, history.
   * The files of request bodies are not in it: a request names its file, as
   * in a collection file.
   */
  async exportJson(options: { history?: boolean } = {}): Promise<string> {
    const file: WorkspaceFile = {
      $id: WORKSPACE_FORMAT,
      exportedAt: Date.now(),
      stores: await this.workspaceRepository.readAll(options.history ?? false),
    };
    this.remember(LAST_BACKUP_KEY);
    this.answered.update((n) => n + 1);
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

  /** Not now: ask again in 14 days, or in 5 while the browser has not promised to keep the data. */
  dismissReminder(): void {
    this.remember(REMINDER_FROM_KEY);
    this.remember(DISMISSED_KEY);
    this.answered.update((n) => n + 1);
  }

  private time(key: string): number {
    try {
      return Number(localStorage.getItem(key)) || 0;
    } catch (error) {
      this.diagnostics.record(error, "backup: could not read when the last backup was made");
      return 0;
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
