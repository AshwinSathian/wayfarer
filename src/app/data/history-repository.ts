import { Injectable, inject } from "@angular/core";
import { PastRequest } from "@wayfarer/core";
import { HistoryRecord, IdbCore } from "./idb-core";

/**
 * What History lists of an entry, and the palette and the count read: no template, no headers, no bodies, no record
 * but its host. Kept for the whole session in every tab, so it is small; a row that is opened or exported reads its
 * entry by id (`get`).
 */
export type HistorySummary = Pick<PastRequest, "id" | "createdAt" | "durationMs" | "error" | "model" | "sentFrom"> & {
  sent: Pick<PastRequest["sent"], "method" | "url">;
  response?: Pick<NonNullable<PastRequest["response"]>, "status">;
  record?: { host: string };
};

function summaryOf(entry: PastRequest): HistorySummary {
  const { id, createdAt, durationMs, error, model, sentFrom, sent, response, record } = entry;
  return {
    id,
    createdAt,
    durationMs,
    error,
    model,
    sentFrom,
    sent: { method: sent.method, url: sent.url },
    ...(response && { response: { status: response.status } }),
    ...(record && { record: { host: record.host } }),
  };
}

@Injectable({ providedIn: "root" })
export class HistoryRepository {
  private readonly core = inject(IdbCore);

  private memoryStore: HistoryRecord[] = [];
  private memorySequence = 1;

  /**
   * Records an exchange and deletes the oldest ones beyond `cap`, in one
   * transaction: the store never holds more than `cap` entries.
   */
  async add(req: PastRequest, cap: number): Promise<number | null> {
    try {
      if (this.core.useMemoryFallback) {
        return this.addToMemory(req, cap);
      }

      const db = await this.core.getDatabase();
      if (!db) {
        return this.addToMemory(req, cap);
      }

      const tx = db.transaction("history", "readwrite");
      const key = await tx.store.add(req as HistoryRecord);
      let excess = (await tx.store.count()) - cap;
      for (
        let cursor = await tx.store.index("by-createdAt").openCursor();
        cursor && excess > 0;
        cursor = await cursor.continue(), excess--
      ) {
        await cursor.delete();
      }
      await tx.done;
      this.core.announce(["history"]);
      return key;
    } catch (error) {
      this.core.logError("add operation failed.", error);
      return null;
    }
  }

  async get(id: number): Promise<PastRequest | null> {
    try {
      if (this.core.useMemoryFallback) {
        return this.memoryStore.find((item) => item.id === id) ?? null;
      }

      const db = await this.core.getDatabase();
      if (!db) {
        return this.memoryStore.find((item) => item.id === id) ?? null;
      }

      const tx = db.transaction("history", "readonly");
      const result = await tx.store.get(id);
      await tx.done;
      return result ?? null;
    } catch (error) {
      this.core.logError("get operation failed.", error);
      return null;
    }
  }

  /** The newest entries first, as History lists them. */
  async getLatest(limit = Number.POSITIVE_INFINITY): Promise<HistorySummary[]> {
    try {
      if (this.core.useMemoryFallback) {
        return this.memoryStore.slice(0, limit).map(summaryOf);
      }

      const db = await this.core.getDatabase();
      if (!db) {
        return this.memoryStore.slice(0, limit).map(summaryOf);
      }

      const tx = db.transaction("history", "readonly");
      const index = tx.store.index("by-createdAt");
      const results: HistorySummary[] = [];
      let cursor = await index.openCursor(null, "prev");
      while (cursor && results.length < limit) {
        results.push(summaryOf(cursor.value));
        cursor = await cursor.continue();
      }
      await tx.done;
      return results;
    } catch (error) {
      this.core.logError("getLatest operation failed.", error);
      return this.memoryStore.slice(0, limit).map(summaryOf);
    }
  }

  async delete(id: number): Promise<void> {
    try {
      if (this.core.useMemoryFallback) {
        this.memoryStore = this.memoryStore.filter((item) => item.id !== id);
        return;
      }

      const db = await this.core.getDatabase();
      if (!db) {
        this.memoryStore = this.memoryStore.filter((item) => item.id !== id);
        return;
      }

      const tx = db.transaction("history", "readwrite");
      await tx.store.delete(id);
      await tx.done;
      this.core.announce(["history"]);
    } catch (error) {
      this.core.logError("delete operation failed.", error);
    }
  }

  async clear(): Promise<void> {
    try {
      if (this.core.useMemoryFallback) {
        this.resetMemoryStore();
        return;
      }

      const db = await this.core.getDatabase();
      if (!db) {
        this.resetMemoryStore();
        return;
      }

      const tx = db.transaction("history", "readwrite");
      await tx.store.clear();
      await tx.done;
      this.core.announce(["history"]);
    } catch (error) {
      this.core.logError("clear operation failed.", error);
    }
  }

  /** Called by Idb.resetDatabase() after IdbCore's own reset. */
  resetLocalState(): void {
    this.memoryStore = [];
    this.memorySequence = 1;
  }

  private addToMemory(item: PastRequest, cap: number): number {
    const record = { ...item, id: this.memorySequence++ } as HistoryRecord;
    this.memoryStore.push(record);
    this.sortMemoryStore();
    this.memoryStore.length = Math.min(this.memoryStore.length, cap);
    return record.id;
  }

  private resetMemoryStore(): void {
    this.memoryStore = [];
    this.memorySequence = 1;
  }

  private sortMemoryStore(): void {
    this.memoryStore.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  }
}
