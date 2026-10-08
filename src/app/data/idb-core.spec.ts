import { TestBed } from "@angular/core/testing";
import { DatabaseResetBlockedError, IdbCore } from "./idb-core";
import { DB_NAME } from "./idb-schema";
import { describe, it, beforeEach, afterEach, expect, vi } from "vitest";

describe("IdbCore", () => {
  let service: IdbCore;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [IdbCore] });
    service = TestBed.inject(IdbCore);
  });

  afterEach(async () => {
    await service.resetDatabase();
  });

  it("opens a real IndexedDB connection when available", async () => {
    await service.init();
    expect(service.useMemoryFallback).toBe(false);
    const db = await service.getDatabase();
    expect(db).not.toBeNull();
  });

  it("falls back to memory mode when indexedDB is unavailable", async () => {
    const original = globalThis.indexedDB;
    delete (globalThis as unknown as Record<string, unknown>)["indexedDB"];

    const svc = new IdbCore();
    await svc.init();

    expect(svc.useMemoryFallback).toBe(true);
    expect(svc.memoryOnly()).toBe(true);
    expect(await svc.getDatabase()).toBeNull();

    (globalThis as unknown as Record<string, unknown>)["indexedDB"] = original;
  });

  it("switches to memory mode when the database promise rejects", async () => {
    // Deliberately doesn't open a real connection first (unlike the other
    // tests here) — stubbing init() and forcing a rejected dbPromise directly
    // isolates the promise-rejection-handling branch in getDatabase() without
    // leaving a real IndexedDB connection dangling for resetDatabase() to
    // (fail to) clean up afterward.
    const svc = new IdbCore();
    vi.spyOn(svc, "init").mockResolvedValue(undefined);
    const error = new Error("resolve failed");
    (svc as unknown as { dbPromise: Promise<unknown> }).dbPromise = Promise.reject(error);
    const errorSpy = vi.spyOn(console, "error");

    const result = await svc.getDatabase();

    expect(result).toBeNull();
    expect(svc.useMemoryFallback).toBe(true);
    expect(errorSpy).toHaveBeenCalledWith(
      "[IDB] Failed to resolve database instance. Switching to in-memory store.",
      error
    );
  });

  it("ensurePersistentSupport() throws once memory fallback is active", async () => {
    const original = globalThis.indexedDB;
    delete (globalThis as unknown as Record<string, unknown>)["indexedDB"];
    const svc = new IdbCore();
    await svc.init();
    (globalThis as unknown as Record<string, unknown>)["indexedDB"] = original;

    await expect(svc.ensurePersistentSupport()).rejects.toThrow(
      "Persistent storage is not available in this environment."
    );
  });

  it("creates meta with a fresh id/timestamps and touchMeta only bumps updatedAt", () => {
    const meta = service.createMeta();
    expect(meta.id).toBeTruthy();
    expect(meta.createdAt).toBe(meta.updatedAt);

    const touched = service.touchMeta(meta);
    expect(touched.id).toBe(meta.id);
    expect(touched.createdAt).toBe(meta.createdAt);
    expect(touched.updatedAt).toBeGreaterThanOrEqual(meta.updatedAt);
  });

  it("ensureId backfills a doc's top-level id from meta.id, and is a no-op if already set", () => {
    const meta = service.createMeta();
    const doc = { meta } as { meta: typeof meta; id?: string };
    service.ensureId(doc);
    expect(doc.id).toBe(meta.id);

    const withId = { meta, id: "explicit" };
    service.ensureId(withId);
    expect(withId.id).toBe("explicit");
  });

  it("resetDatabase() clears connection state so a subsequent init() starts fresh", async () => {
    await service.init();
    expect(service.useMemoryFallback).toBe(false);

    await service.resetDatabase();
    await service.init();

    expect(service.useMemoryFallback).toBe(false);
    const db = await service.getDatabase();
    expect(db).not.toBeNull();
  });

  describe("honest reset (P0.7, #94)", () => {
    it("opens one connection no matter how many callers init() concurrently", async () => {
      const open = vi.spyOn(indexedDB, "open");
      try {
        await Promise.all([service.init(), service.getDatabase(), service.init()]);
        expect(open).toHaveBeenCalledTimes(1);
      } finally {
        open.mockRestore();
      }
    });

    it("fails with the close-other-tabs message while another connection holds the database", async () => {
      await service.init();
      // A connection that ignores versionchange, like a tab running a build
      // from before this fix.
      const held = await new Promise<IDBDatabase>((resolve, reject) => {
        const open = indexedDB.open(DB_NAME);
        open.onsuccess = () => resolve(open.result);
        open.onerror = () => reject(open.error);
      });

      try {
        await expect(service.resetDatabase()).rejects.toThrow(DatabaseResetBlockedError);
        await expect(service.resetDatabase()).rejects.toThrow("Close other Wayfarer tabs and try again");
      } finally {
        held.close();
      }
    }, 15_000);

    it("closes this tab's connection and flags it when another tab resets", async () => {
      const otherTab = new IdbCore();
      await otherTab.init();
      await service.init();

      await service.resetDatabase();

      await vi.waitFor(() => expect(otherTab.closedByOtherTab()).toBe(true));
      await expect(otherTab.getDatabase()).rejects.toThrow(/reset in another tab/);
      expect(service.closedByOtherTab()).toBe(false);
    });
  });
});
