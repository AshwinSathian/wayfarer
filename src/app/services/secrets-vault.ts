import { Injectable, inject } from "@angular/core";
import { Idb } from "../data/idb";
import { SecretDoc, SecretEnvelope, SecretId } from "../models/secrets";
import { SecretCrypto } from "../shared/secrets/secret-crypto";
import { newId } from "@wayfarer/core";

export interface SaveSecretRequest {
  name: string;
  environmentId?: string;
  plaintext: string;
}

@Injectable({
  providedIn: "root",
})
export class SecretsVault {
  private readonly idb = inject(Idb);
  private readonly crypto = inject(SecretCrypto);


  async saveSecret(request: SaveSecretRequest): Promise<SecretId> {
    if (!this.crypto.isUnlocked) {
      throw new Error("Secrets are locked. Unlock before saving new secrets.");
    }
    const envelope = await this.crypto.encryptWithSession(request.plaintext);
    const id = newId();
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
    } catch (error) {
      // AES-GCM authentication failure: the passphrase is wrong. Anything
      // else (a corrupt envelope) is a real error and must surface.
      if (error instanceof DOMException && error.name === "OperationError") return false;
      throw error;
    }
  }
}
