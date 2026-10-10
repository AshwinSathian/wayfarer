import { Injectable, inject } from "@angular/core";
import { EnvironmentId } from "../models/environments";
import { Meta } from "../models/collections";
import type { SecretEnvelope, VaultRecord } from "@wayfarer/core";
import { SecretDoc, SecretId } from "../models/secrets";
import { IdbCore } from "./idb-core";
import { META_VAULT_KEY, VaultRecordDoc } from "./idb-schema";

@Injectable({ providedIn: "root" })
export class SecretsRepository {
  private readonly core = inject(IdbCore);

  async writeCipher(params: {
    id: SecretId;
    name: string;
    environmentId?: EnvironmentId;
    envelope: SecretEnvelope;
  }): Promise<void> {
    await this.core.ensurePersistentSupport();
    const tx = await this.core.txReadWrite(["secrets"]);
    const store = tx.objectStore("secrets");
    await this.core.commitOrRollback(tx, async () => {
      const doc: SecretDoc = {
        id: params.id,
        meta: this.core.createMetaWithId(params.id),
        name: params.name,
        environmentId: params.environmentId,
        envelope: params.envelope,
      };
      this.core.ensureId(doc as unknown as { meta: Meta; id?: string });
      await store.put(doc);
    });
  }

  /** Gives a secret that is there a new ciphertext, under its id and name. False when the vault has no such secret. */
  async replaceCipher(id: SecretId, envelope: SecretEnvelope): Promise<boolean> {
    await this.core.ensurePersistentSupport();
    const tx = await this.core.txReadWrite(["secrets"]);
    const store = tx.objectStore("secrets");
    return this.core.commitOrRollback(tx, async () => {
      const doc = await store.get(id);
      if (!doc) return false;
      await store.put({ ...doc, envelope });
      return true;
    });
  }

  async readCipher(id: SecretId): Promise<SecretEnvelope | null> {
    await this.core.ensurePersistentSupport();
    const tx = await this.core.txReadonly(["secrets"]);
    const doc = await tx.objectStore("secrets").get(id);
    await tx.done;
    return doc?.envelope ?? null;
  }

  /** The vault record, or `null` when no passphrase has been chosen yet. */
  async readVault(): Promise<VaultRecord | null> {
    await this.core.ensurePersistentSupport();
    const tx = await this.core.txReadonly(["meta"]);
    const stored = (await tx.objectStore("meta").get(META_VAULT_KEY)) as VaultRecordDoc | undefined;
    await tx.done;
    if (!stored) return null;
    const { key: _key, ...record } = stored;
    return record;
  }

  /**
   * Stores the vault record. With `replace` false it is the first one and is
   * not written when a record is already there (another tab chose a
   * passphrase first); with `replace` true it is a change of passphrase and
   * is not written when there is none. Says whether it was written.
   */
  async writeVault(record: VaultRecord, replace: boolean): Promise<boolean> {
    await this.core.ensurePersistentSupport();
    const tx = await this.core.txReadWrite(["meta"]);
    const store = tx.objectStore("meta");
    return this.core.commitOrRollback(tx, async () => {
      const exists = (await store.get(META_VAULT_KEY)) !== undefined;
      if (exists !== replace) return false;
      await store.put({ ...record, key: META_VAULT_KEY });
      return true;
    });
  }

  /** Writes secrets from a vault file, each under the id it had there, in one transaction. */
  async writeSecrets(docs: Pick<SecretDoc, "id" | "name" | "environmentId" | "envelope">[]): Promise<void> {
    await this.core.ensurePersistentSupport();
    const tx = await this.core.txReadWrite(["secrets"]);
    const store = tx.objectStore("secrets");
    await this.core.commitOrRollback(tx, async () => {
      for (const doc of docs) {
        await store.put({ ...doc, meta: this.core.createMetaWithId(doc.id) });
      }
    });
  }

  /**
   * Metadata for every secret in the vault, across all environments —
   * ciphertext envelopes included (needed to decrypt on reveal) but never
   * plaintext, which this repository never sees. Backs the dedicated
   * Secrets management view (Part D/E, Phase 3).
   */
  async listAll(): Promise<SecretDoc[]> {
    await this.core.ensurePersistentSupport();
    const tx = await this.core.txReadonly(["secrets"]);
    const items = await tx.objectStore("secrets").getAll();
    await tx.done;
    return this.core.ensureIds(items);
  }

  async renameSecret(id: SecretId, name: string): Promise<SecretDoc | null> {
    await this.core.ensurePersistentSupport();
    const tx = await this.core.txReadWrite(["secrets"]);
    const store = tx.objectStore("secrets");
    return this.core.commitOrRollback(tx, async () => {
      const doc = await store.get(id);
      if (!doc) {
        return null;
      }
      doc.name = name.trim() || doc.name;
      await store.put(doc);
      return doc;
    });
  }

  async deleteSecret(id: SecretId): Promise<void> {
    await this.core.ensurePersistentSupport();
    const tx = await this.core.txReadWrite(["secrets"]);
    await this.core.commitOrRollback(tx, async () => {
      await tx.objectStore("secrets").delete(id);
    });
  }
}
