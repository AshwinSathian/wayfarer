import { Injectable, inject, signal } from "@angular/core";
import {
  IMPORT_TOO_LARGE,
  VAULT_FILE_FORMAT,
  isOversizedImport,
  parseJson,
  validateCollection,
  validateEnvironmentExport,
  validateRequestContent,
  validateRows,
  validateVaultFile,
} from "@wayfarer/core";
import { Idb } from "../data/idb";
import { META_GLOBALS_KEY, META_STATE_KEY, META_VAULT_KEY } from "../data/idb-schema";
import { WorkspaceStores } from "../data/workspace-repository";
import { COLLECTION_FORMAT } from "../models/collections";
import { ENVIRONMENTS_FORMAT } from "../models/environments";
import { Diagnostics } from "./diagnostics";

export const WORKSPACE_FORMAT = "wayfarer/workspace/3";

/** A whole workspace as one file. The vault's secrets are in it encrypted, as they are stored. */
export interface WorkspaceFile {
  $id: typeof WORKSPACE_FORMAT;
  exportedAt: number;
  stores: WorkspaceStores;
}

const LAST_BACKUP_KEY = "wayfarer:last-backup";
const REMINDER_FROM_KEY = "wayfarer:backup-reminder-from";
const REMINDER_AFTER_MS = 14 * 24 * 60 * 60 * 1000;

type Fields = Record<string, unknown>;
const isObject = (value: unknown): value is Fields => typeof value === "object" && value !== null && !Array.isArray(value);
const own = (value: Fields, key: string): unknown => (Object.hasOwn(value, key) ? value[key] : undefined);

/**
 * Checks a workspace file against what the app writes, store by store, with
 * the validators the single-store importers use. A file is untrusted.
 */
export function validateWorkspaceFile(value: unknown): string[] {
  if (!isObject(value) || own(value, "$id") !== WORKSPACE_FORMAT) {
    return [`Not a Wayfarer workspace file: "$id" must be "${WORKSPACE_FORMAT}".`];
  }
  const stores = own(value, "stores");
  if (!isObject(stores)) return ["stores: Value must be an object."];
  const errors: string[] = [];
  const list = (name: string): Fields[] => {
    const records = own(stores, name);
    if (!Array.isArray(records) || !records.every(isObject)) {
      errors.push(`stores.${name}: Value must be an array of objects.`);
      return [];
    }
    return records as Fields[];
  };
  const [collections, folders, requests, environments, secrets, meta] = ["collections", "folders", "requests", "environments", "secrets", "meta"].map(list);
  if (errors.length) return errors;

  // Each collection with its folders and requests, as a collection file would hold them.
  const idOf = (doc: Fields) => (isObject(doc["meta"]) ? doc["meta"]["id"] : undefined);
  const known = new Set(collections.map(idOf));
  for (const collection of collections) {
    const id = idOf(collection);
    const result = validateCollection({
      $id: COLLECTION_FORMAT,
      meta: collection["meta"],
      collection,
      folders: folders.filter((folder) => folder["collectionId"] === id),
      requests: requests.filter((request) => request["collectionId"] === id),
    });
    errors.push(...(result.errors ?? []).map((issue) => `collection "${String(collection["name"])}": ${issue.path}: ${issue.message}`));
    if (!isObject(collection["scriptTrust"])) errors.push(`collection "${String(collection["name"])}": scriptTrust is missing.`);
  }
  for (const [kind, docs] of [["folders", folders], ["requests", requests]] as const) {
    docs.forEach((doc, index) => {
      if (!known.has(doc["collectionId"])) errors.push(`stores.${kind}[${index}]: belongs to a collection that is not in the file.`);
    });
  }
  errors.push(...(validateEnvironmentExport({ $id: ENVIRONMENTS_FORMAT, environments }).errors ?? []));

  // The meta records: the active environment, the globals, the vault.
  let vault: Fields | undefined;
  for (const record of meta) {
    const key = record["key"];
    if (key === META_STATE_KEY) {
      const active = record["activeEnvironmentId"];
      if (active !== null && active !== undefined && typeof active !== "string") errors.push("stores.meta: the active environment must be an id or null.");
    } else if (key === META_GLOBALS_KEY) {
      errors.push(...validateRows(record["variables"], "stores.meta.globals.variables").map((issue) => `${issue.path}: ${issue.message}`));
    } else if (key === META_VAULT_KEY) {
      vault = record;
    } else {
      errors.push(`stores.meta: "${String(key)}" is not a record the app keeps.`);
    }
  }
  if (vault || secrets.length) {
    const issues = validateVaultFile({ $id: VAULT_FILE_FORMAT, vault, secrets });
    errors.push(...issues.map((issue) => `vault: ${issue.path}: ${issue.message}`));
    secrets.forEach((secret, index) => {
      if (!isObject(secret["meta"]) || secret["meta"]["id"] !== secret["id"]) errors.push(`stores.secrets[${index}]: meta.id must be the secret's id.`);
    });
  }

  const history = own(stores, "history");
  if (history !== undefined) {
    list("history").forEach((entry, index) => {
      const path = `stores.history[${index}]`;
      const sent = entry["sent"];
      if (typeof entry["createdAt"] !== "number") errors.push(`${path}.createdAt: Value must be a number.`);
      if (entry["route"] !== "direct" && entry["route"] !== "bridge") errors.push(`${path}.route: Value must be direct or bridge.`);
      if (!isObject(sent) || typeof sent["method"] !== "string" || typeof sent["url"] !== "string" || !Array.isArray(sent["headers"])) {
        errors.push(`${path}.sent: Value must hold a method, a URL and headers.`);
      }
      errors.push(...validateRequestContent(entry["template"], `${path}.template`).map((issue) => `${issue.path}: ${issue.message}`));
    });
  }
  return errors;
}

/** Backup and restore of everything the app stores, and the reminder to make one (P2.11). */
@Injectable({ providedIn: "root" })
export class WorkspaceBackup {
  private readonly idb = inject(Idb);
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
    const file: WorkspaceFile = { $id: WORKSPACE_FORMAT, exportedAt: Date.now(), stores: await this.idb.readWorkspace(options.history ?? false) };
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
    await this.idb.restoreWorkspace({
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
