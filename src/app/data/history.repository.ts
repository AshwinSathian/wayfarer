import { Injectable, inject } from "@angular/core";
import { PastRequest, PastRequestKey } from "../models/history.models";
import { HistoryRecord, IdbCoreService } from "./idb-core.service";

@Injectable({ providedIn: "root" })
export class HistoryRepository {
  private readonly core = inject(IdbCoreService);

  private memoryStore: HistoryRecord[] = [];
  private memorySequence = 1;

  async add(req: PastRequest): Promise<PastRequestKey | null> {
    try {
      const item: PastRequest = {
        ...req,
        createdAt: req.createdAt ?? Date.now(),
      };

      if (this.core.useMemoryFallback) {
        return this.addToMemory(item);
      }

      const db = await this.core.getDatabase();
      if (!db) {
        return this.addToMemory(item);
      }

      const tx = db.transaction("history", "readwrite");
      const key = await tx.store.add(item as HistoryRecord);
      await tx.done;
      return key;
    } catch (error) {
      this.core.logError("add operation failed.", error);
      return null;
    }
  }

  async get(id: PastRequestKey): Promise<PastRequest | null> {
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

  async getLatest(limit = 50): Promise<PastRequest[]> {
    try {
      if (this.core.useMemoryFallback) {
        return this.memoryStore.slice(0, limit);
      }

      const db = await this.core.getDatabase();
      if (!db) {
        return this.memoryStore.slice(0, limit);
      }

      const tx = db.transaction("history", "readonly");
      const index = tx.store.index("by-createdAt");
      const results: PastRequest[] = [];
      let cursor = await index.openCursor(null, "prev");
      while (cursor && results.length < limit) {
        results.push(cursor.value);
        cursor = await cursor.continue();
      }
      await tx.done;
      return results;
    } catch (error) {
      this.core.logError("getLatest operation failed.", error);
      return this.memoryStore.slice(0, limit);
    }
  }

  async findByUrl(url: string, limit = 20): Promise<PastRequest[]> {
    try {
      if (this.core.useMemoryFallback) {
        return this.memoryStore.filter((item) => item.url === url).slice(0, limit);
      }

      const db = await this.core.getDatabase();
      if (!db) {
        return this.memoryStore.filter((item) => item.url === url).slice(0, limit);
      }

      const tx = db.transaction("history", "readonly");
      const index = tx.store.index("by-url");
      const results: PastRequest[] = [];
      const range = IDBKeyRange.only(url);
      let cursor = await index.openCursor(range, "prev");

      while (cursor && results.length < limit) {
        results.push(cursor.value);
        cursor = await cursor.continue();
      }

      await tx.done;
      return results;
    } catch (error) {
      this.core.logError("findByUrl operation failed.", error);
      return this.memoryStore.filter((item) => item.url === url).slice(0, limit);
    }
  }

  async delete(id: PastRequestKey): Promise<void> {
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
    } catch (error) {
      this.core.logError("clear operation failed.", error);
    }
  }

  /** Called by IdbService.resetDatabase() after IdbCoreService's own reset. */
  resetLocalState(): void {
    this.memoryStore = [];
    this.memorySequence = 1;
  }

  private addToMemory(item: PastRequest): PastRequestKey {
    const record = { ...item, id: this.memorySequence++ } as HistoryRecord;
    this.memoryStore.push(record);
    this.sortMemoryStore();
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
