import { Injectable, inject } from "@angular/core";
import { IdbCore } from "./idb-core";
import { StoredCookie } from "./idb-schema";

/** The cookie jar as it is stored (P5.3). Without a database there is none: the jar lives in the page only. */
@Injectable({ providedIn: "root" })
export class CookiesRepository {
  private readonly core = inject(IdbCore);

  async readAll(): Promise<StoredCookie[]> {
    const db = await this.core.getDatabase();
    return db ? db.getAll("cookies") : [];
  }

  /** Stores `put` and deletes `remove`, in one transaction, and tells the other browser tabs. */
  async write(put: StoredCookie[], remove: string[]): Promise<void> {
    if (!(await this.core.getDatabase())) return;
    const tx = await this.core.txReadWrite(["cookies"]);
    await this.core.commitOrRollback(tx, async () => {
      const store = tx.objectStore("cookies");
      for (const record of put) await store.put(record);
      for (const key of remove) await store.delete(key);
    });
  }

  async clear(): Promise<void> {
    if (!(await this.core.getDatabase())) return;
    const tx = await this.core.txReadWrite(["cookies"]);
    await this.core.commitOrRollback(tx, () => tx.objectStore("cookies").clear());
  }
}
