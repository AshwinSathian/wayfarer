import { Injectable, computed, inject, signal } from "@angular/core";
import {
  IMPORT_TOO_LARGE,
  VAULT_FILE_FORMAT,
  createVault,
  decryptSecret,
  encryptSecret,
  isOversizedImport,
  newId,
  parseJson,
  rewrapDek,
  unwrapDek,
  validateVaultFile,
  type VaultFile,
  type VaultKey,
} from "@wayfarer/core";
import { Idb } from "../data/idb";
import { SecretDoc, SecretId } from "../models/secrets";
import { Diagnostics } from "./diagnostics";

export interface SaveSecretRequest {
  name: string;
  environmentId?: string;
  plaintext: string;
}

const IDLE_KEY = "wayfarer:vault-idle-minutes";
const DEFAULT_IDLE_MINUTES = 15;
const MAX_IDLE_MINUTES = 240;
const CHANNEL = "wayfarer:vault";

/** What importing a vault file did, or why it did nothing. */
export type VaultImportResult = { imported: number } | { error: string };

/**
 * The secrets vault (plan D8). A passphrase unlocks one data key, which
 * this tab then holds in memory as a key that cannot be exported; secrets
 * are encrypted under it. Nothing that can open a secret is stored: a
 * reload, a lock, or the idle time passing drops the key.
 */
@Injectable({
  providedIn: "root",
})
export class SecretsVault {
  private readonly idb = inject(Idb);
  private readonly diagnostics = inject(Diagnostics);

  private readonly dek = signal<VaultKey | null>(null);
  /** A signal, so every view and effect that reads it follows unlock and lock. */
  readonly isUnlocked = computed(() => this.dek() !== null);

  /** Minutes without a key press or a click before this tab locks itself; 0 never does. */
  readonly idleMinutes = signal(this.loadIdleMinutes());
  private idleTimer: ReturnType<typeof setTimeout> | undefined;

  /** Something needs the vault open: the shell shows the unlock dialog while this is set. */
  readonly unlockRequested = signal(false);
  private answerUnlockRequest: ((unlocked: boolean) => void) | undefined;

  /** A lock in one tab locks them all. */
  private readonly channel = new BroadcastChannel(CHANNEL);

  constructor() {
    this.channel.addEventListener("message", (event: MessageEvent<{ type?: unknown }>) => {
      if (event.data?.type === "lock") this.dropKey();
    });
    for (const type of ["keydown", "pointerdown"] as const) {
      window.addEventListener(type, () => this.restartIdleTimer(), { capture: true, passive: true });
    }
  }

  /** Whether a passphrase has been chosen. */
  async exists(): Promise<boolean> {
    return (await this.idb.readVault()) !== null;
  }

  /**
   * Makes the vault with this passphrase and unlocks it. False when a vault
   * is already there: another tab made one, and its passphrase is the one.
   */
  async create(passphrase: string): Promise<boolean> {
    const { record, dek } = await createVault(passphrase);
    if (!(await this.idb.writeVault(record, false))) return false;
    this.holdKey(dek);
    return true;
  }

  /** False when the passphrase is wrong, or there is no vault. The passphrase is used exactly as typed. */
  async unlock(passphrase: string): Promise<boolean> {
    const record = await this.idb.readVault();
    const dek = record && (await unwrapDek(record, passphrase));
    if (!dek) return false;
    this.holdKey(dek);
    return true;
  }

  /**
   * Resolves at once when the vault is unlocked. Otherwise asks the user for
   * the passphrase, and resolves to whether they gave it: false when they
   * closed the dialog.
   */
  ensureUnlocked(): Promise<boolean> {
    if (this.isUnlocked()) return Promise.resolve(true);
    return new Promise((resolve) => {
      // A second request while one is open takes its place; the first is told no.
      this.answerUnlockRequest?.(false);
      this.answerUnlockRequest = resolve;
      this.unlockRequested.set(true);
    });
  }

  /** The unlock dialog closed, with the vault unlocked or not. */
  unlockDialogClosed(): void {
    this.unlockRequested.set(false);
    this.answerUnlockRequest?.(this.isUnlocked());
    this.answerUnlockRequest = undefined;
  }

  /** Locks this tab and every other tab of the app. */
  lock(): void {
    this.dropKey();
    this.channel.postMessage({ type: "lock" });
  }

  async saveSecret(request: SaveSecretRequest): Promise<SecretId> {
    const id = newId();
    await this.idb.writeCipher({
      id,
      name: request.name,
      environmentId: request.environmentId,
      envelope: await encryptSecret(this.key(), id, request.plaintext),
    });
    return id;
  }

  /** The secret's plaintext, or `null` when the vault is locked or has no such secret. */
  async readSecret(secretId: SecretId): Promise<string | null> {
    const dek = this.dek();
    if (!dek) {
      return null;
    }
    const envelope = await this.idb.readCipher(secretId);
    return envelope ? decryptSecret(dek, secretId, envelope) : null;
  }

  /** All secrets across every environment, ciphertext only — for the dedicated Secrets management view. */
  async listSecrets(): Promise<SecretDoc[]> {
    return this.idb.listSecrets();
  }

  async renameSecret(id: SecretId, name: string): Promise<SecretDoc | null> {
    return this.idb.renameSecret(id, name);
  }

  async deleteSecret(id: SecretId): Promise<void> {
    return this.idb.deleteSecret(id);
  }

  /**
   * Changes the passphrase: the data key is wrapped again under the new
   * one, and no secret is rewritten. False when `current` is wrong.
   */
  async changePassphrase(current: string, next: string): Promise<boolean> {
    const record = await this.idb.readVault();
    const rotated = record && (await rewrapDek(record, current, next));
    return rotated ? this.idb.writeVault(rotated, true) : false;
  }

  /**
   * The vault as a file: the wrapped key and every secret, still encrypted.
   * `null` when the passphrase is wrong: the file opens with that
   * passphrase, so the user must know it.
   */
  async exportFile(passphrase: string): Promise<string | null> {
    const record = await this.idb.readVault();
    if (!record || !(await unwrapDek(record, passphrase))) return null;
    const secrets = (await this.idb.listSecrets()).map(({ id, name, environmentId, envelope }) => ({ id, name, environmentId, envelope }));
    const file: VaultFile = { $id: VAULT_FILE_FORMAT, vault: record, secrets };
    return JSON.stringify(file, null, 2);
  }

  /**
   * Reads a vault file with the passphrase it was written under, and
   * stores its secrets under this vault's key, each with the id it had: an
   * environment that refers to one finds it. All of the file or none.
   */
  async importFile(text: string, filePassphrase: string): Promise<VaultImportResult> {
    if (isOversizedImport(text)) return { error: IMPORT_TOO_LARGE };
    const parsed = parseJson(text);
    if (!parsed.ok) return { error: "The file is not valid JSON." };
    const issues = validateVaultFile(parsed.value);
    if (issues.length) return { error: `${issues[0].path}: ${issues[0].message}` };
    const file = parsed.value as VaultFile;

    const local = this.key();
    const theirs = await unwrapDek(file.vault, filePassphrase);
    if (!theirs) return { error: "That is not the passphrase this file was exported with." };
    const docs = [];
    for (const { id, name, environmentId, envelope } of file.secrets) {
      let plaintext: string;
      try {
        plaintext = await decryptSecret(theirs, id, envelope);
      } catch (error) {
        // AES-GCM authentication failed: this secret is not what the file's vault encrypted.
        if (!(error instanceof DOMException)) throw error;
        return { error: `The secret "${name}" in the file is damaged. Nothing was imported.` };
      }
      docs.push({ id, name, environmentId, envelope: await encryptSecret(local, id, plaintext) });
    }
    await this.idb.writeSecrets(docs);
    return { imported: docs.length };
  }

  setIdleMinutes(value: number): void {
    const minutes = Number.isFinite(value) && value > 0 ? Math.min(Math.floor(value), MAX_IDLE_MINUTES) : 0;
    this.idleMinutes.set(minutes);
    try {
      localStorage.setItem(IDLE_KEY, String(minutes));
    } catch (error) {
      // The setting just won't survive a reload.
      this.diagnostics.record(error, "vault: could not save the idle time");
    }
    this.restartIdleTimer();
  }

  private key(): VaultKey {
    const dek = this.dek();
    if (!dek) {
      throw new Error("Secrets are locked. Unlock before saving new secrets.");
    }
    return dek;
  }

  private holdKey(dek: VaultKey): void {
    this.dek.set(dek);
    this.restartIdleTimer();
  }

  private dropKey(): void {
    this.dek.set(null);
    clearTimeout(this.idleTimer);
  }

  /**
   * Idle time locks this tab only: another tab may be the one in use, and
   * its own timer watches it.
   */
  private restartIdleTimer(): void {
    clearTimeout(this.idleTimer);
    const minutes = this.idleMinutes();
    if (this.dek() && minutes > 0) {
      this.idleTimer = setTimeout(() => this.dropKey(), minutes * 60_000);
    }
  }

  private loadIdleMinutes(): number {
    try {
      const stored = localStorage.getItem(IDLE_KEY);
      const minutes = stored === null ? DEFAULT_IDLE_MINUTES : Number(stored);
      return Number.isFinite(minutes) && minutes >= 0 ? Math.min(Math.floor(minutes), MAX_IDLE_MINUTES) : DEFAULT_IDLE_MINUTES;
    } catch (error) {
      this.diagnostics.record(error, "vault: stored idle time unreadable, using the default");
      return DEFAULT_IDLE_MINUTES;
    }
  }
}
