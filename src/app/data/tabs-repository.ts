import { Injectable, inject } from "@angular/core";
import { IdbCore } from "./idb-core";
import { StoredTab } from "./idb-schema";

/** The composer's tabs as they are stored (P5.1). Without a database there are none: the tabs live in the page only. */
@Injectable({ providedIn: "root" })
export class TabsRepository {
  private readonly core = inject(IdbCore);

  /** Every stored tab, in the strip's order. */
  async readAll(): Promise<StoredTab[]> {
    const db = await this.core.getDatabase();
    if (!db) return [];
    return (await db.getAll("tabs")).sort((a, b) => a.order - b.order);
  }

  /** Stores `put` and deletes `remove`, in one transaction, and tells the other browser tabs. */
  async write(put: StoredTab[], remove: string[]): Promise<void> {
    if (!(await this.core.getDatabase())) return;
    const tx = await this.core.txReadWrite(["tabs"]);
    await this.core.commitOrRollback(tx, async () => {
      const store = tx.objectStore("tabs");
      for (const record of put) await store.put(record);
      for (const id of remove) await store.delete(id);
    });
  }
}
