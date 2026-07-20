import { Injectable, inject } from "@angular/core";
import { EnvironmentId } from "../models/environments.models";
import { Meta } from "../models/collections.models";
import { SecretDoc, SecretEnvelope, SecretId } from "../models/secrets.models";
import { IdbCoreService } from "./idb-core.service";

@Injectable({ providedIn: "root" })
export class SecretsRepository {
  private readonly core = inject(IdbCoreService);

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

  async readCipher(id: SecretId): Promise<SecretEnvelope | null> {
    await this.core.ensurePersistentSupport();
    const tx = await this.core.txReadonly(["secrets"]);
    const doc = await tx.objectStore("secrets").get(id);
    await tx.done;
    return doc?.envelope ?? null;
  }

  async peekSecretEnvelope(): Promise<SecretEnvelope | null> {
    await this.core.ensurePersistentSupport();
    const tx = await this.core.txReadonly(["secrets"]);
    const store = tx.objectStore("secrets");
    const cursor = await store.openCursor();
    const envelope = cursor?.value?.envelope ?? null;
    await tx.done;
    return envelope;
  }
}
