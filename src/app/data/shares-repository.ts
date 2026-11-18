import { Injectable, inject } from "@angular/core";
import { IdbCore } from "./idb-core";
import type { Base, Share } from "./idb-schema";

/** The folder a collection is kept in (T2.2) and what that folder held when the app last wrote or took it (T2.4). */
@Injectable({ providedIn: "root" })
export class SharesRepository {
  private readonly core = inject(IdbCore);

  async shares(): Promise<Share[]> {
    const db = await this.core.getDatabase();
    return db ? db.getAll("shares") : [];
  }

  async base(collectionId: string): Promise<Base | undefined> {
    const db = await this.core.getDatabase();
    return db?.get("bases", collectionId);
  }

  /** The share and its base, in one transaction: a folder is never kept without what it held. */
  async keep(share: Share, base: Base): Promise<void> {
    await this.core.ensurePersistentSupport();
    const tx = await this.core.txReadWrite(["shares", "bases"]);
    await this.core.commitOrRollback(tx, async () => {
      await tx.objectStore("shares").put(share);
      await tx.objectStore("bases").put(base);
    });
  }

  async putBase(base: Base): Promise<void> {
    await this.core.ensurePersistentSupport();
    const tx = await this.core.txReadWrite(["bases"]);
    await this.core.commitOrRollback(tx, () => tx.objectStore("bases").put(base));
  }

  async remove(collectionId: string): Promise<void> {
    await this.core.ensurePersistentSupport();
    const tx = await this.core.txReadWrite(["shares", "bases"]);
    await this.core.commitOrRollback(tx, async () => {
      await tx.objectStore("shares").delete(collectionId);
      await tx.objectStore("bases").delete(collectionId);
    });
  }
}
