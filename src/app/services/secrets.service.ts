import { Injectable, inject } from "@angular/core";
import { IdbService } from "../data/idb.service";
import { SecretDoc, SecretEnvelope, SecretId } from "../models/secrets.models";
import { SecretCryptoService } from "../shared/secrets/secret-crypto.service";

export interface SaveSecretRequest {
  name: string;
  environmentId?: string;
  plaintext: string;
}

@Injectable({
  providedIn: "root",
})
export class SecretsService {
  private readonly idb = inject(IdbService);
  private readonly crypto = inject(SecretCryptoService);


  async saveSecret(request: SaveSecretRequest): Promise<SecretId> {
    if (!this.crypto.isUnlocked) {
      throw new Error("Secrets are locked. Unlock before saving new secrets.");
    }
    const envelope = await this.crypto.encryptWithSession(request.plaintext);
    const id = this.randomId();
    await this.idb.writeCipher({
      id,
      name: request.name,
      environmentId: request.environmentId,
      envelope,
    });
    return id;
  }

  async readSecret(secretId: SecretId): Promise<string | null> {
    if (!this.crypto.isUnlocked) {
      return null;
    }
    const envelope = await this.idb.readCipher(secretId);
    if (!envelope) {
      return null;
    }
    return this.crypto.decryptWithSession(envelope);
  }

  async decryptEnvelope(
    envelope: SecretEnvelope
  ): Promise<string | null> {
    if (!this.crypto.isUnlocked) {
      return null;
    }
    return this.crypto.decryptWithSession(envelope);
  }

  async hasAnySecrets(): Promise<boolean> {
    return (await this.idb.peekSecretEnvelope()) !== null;
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

  async verifyAndUnlock(passphrase: string): Promise<boolean> {
    const sample = await this.idb.peekSecretEnvelope();
    if (!sample) {
      await this.crypto.unlock(passphrase);
      return true;
    }
    try {
      await this.crypto.decrypt(sample, passphrase);
      await this.crypto.unlock(passphrase);
      return true;
    } catch {
      return false;
    }
  }

  private randomId(): SecretId {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
  }
}
