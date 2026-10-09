import { Injectable, inject } from "@angular/core";
import { Collection, Folder, RequestDoc } from "../models/collections";
import { EnvironmentDoc } from "../models/environments";
import { PastRequest } from "../models/history";
import { SecretDoc } from "../models/secrets";
import { IdbCore } from "./idb-core";
import { GlobalsRecord, MetaState, StoreName, VaultRecordDoc } from "./idb-schema";

/** Every record of the workspace, by store. History is there only when asked for; file bytes never are. */
export interface WorkspaceStores {
  collections: Collection[];
  folders: Folder[];
  requests: RequestDoc[];
  environments: EnvironmentDoc[];
  secrets: SecretDoc[];
  meta: (MetaState | GlobalsRecord | VaultRecordDoc)[];
  history?: PastRequest[];
}

const ALWAYS: StoreName[] = ["collections", "folders", "requests", "environments", "secrets", "meta"];

/** Reads and replaces the whole workspace, for backup and restore (P2.11). */
@Injectable({ providedIn: "root" })
export class WorkspaceRepository {
  private readonly core = inject(IdbCore);

  /** One read transaction over every store: the backup is the workspace at one moment. */
  async readAll(includeHistory: boolean): Promise<WorkspaceStores> {
    await this.core.ensurePersistentSupport();
    const tx = await this.core.txReadonly(includeHistory ? [...ALWAYS, "history"] : ALWAYS);
    const stores: WorkspaceStores = {
      collections: await tx.objectStore("collections").getAll(),
      folders: await tx.objectStore("folders").getAll(),
      requests: await tx.objectStore("requests").getAll(),
      environments: await tx.objectStore("environments").getAll(),
      secrets: await tx.objectStore("secrets").getAll(),
      meta: await tx.objectStore("meta").getAll(),
      ...(includeHistory && { history: await tx.objectStore("history").getAll() }),
    };
    await tx.done;
    return stores;
  }

  /**
   * Replaces the workspace with `stores`, in one transaction: all of it or
   * none. History is replaced only when the backup has one. The files of
   * request bodies are not in a backup, so the ones stored here go: no
   * request of the restored workspace has its file in this browser.
   */
  async replaceAll(stores: WorkspaceStores): Promise<void> {
    await this.core.ensurePersistentSupport();
    const names: StoreName[] = [...ALWAYS, "files", ...(stores.history ? (["history"] as const) : [])];
    const tx = await this.core.txReadWrite(names);
    await this.core.commitOrRollback(tx, async () => {
      for (const name of names) {
        await tx.objectStore(name).clear();
      }
      for (const doc of stores.collections) await tx.objectStore("collections").put(doc);
      for (const doc of stores.folders) await tx.objectStore("folders").put(doc);
      for (const doc of stores.requests) await tx.objectStore("requests").put(doc);
      for (const doc of stores.environments) await tx.objectStore("environments").put(doc);
      for (const doc of stores.secrets) await tx.objectStore("secrets").put(doc);
      for (const record of stores.meta) await tx.objectStore("meta").put(record);
      for (const entry of stores.history ?? []) await tx.objectStore("history").put(entry as PastRequest & { id: number });
    });
  }
}
