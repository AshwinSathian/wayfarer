import { TestBed } from "@angular/core/testing";
import { IdbCoreService } from "./idb-core.service";

describe("IdbCoreService", () => {
  let service: IdbCoreService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [IdbCoreService] });
    service = TestBed.inject(IdbCoreService);
  });

  afterEach(async () => {
    await service.resetDatabase();
  });

  it("opens a real IndexedDB connection when available", async () => {
    await service.init();
    expect(service.useMemoryFallback).toBeFalse();
    const db = await service.getDatabase();
    expect(db).not.toBeNull();
  });

  it("falls back to memory mode when indexedDB is unavailable", async () => {
    const original = globalThis.indexedDB;
    delete (globalThis as unknown as Record<string, unknown>).indexedDB;

    const svc = new IdbCoreService();
    await svc.init();

    expect(svc.useMemoryFallback).toBeTrue();
    expect(await svc.getDatabase()).toBeNull();

    (globalThis as unknown as Record<string, unknown>).indexedDB = original;
  });

  it("switches to memory mode when the database promise rejects", async () => {
    // Deliberately doesn't open a real connection first (unlike the other
    // tests here) — stubbing init() and forcing a rejected dbPromise directly
    // isolates the promise-rejection-handling branch in getDatabase() without
    // leaving a real IndexedDB connection dangling for resetDatabase() to
    // (fail to) clean up afterward.
    const svc = new IdbCoreService();
    spyOn(svc, "init").and.resolveTo();
    const error = new Error("resolve failed");
    (svc as any).dbPromise = Promise.reject(error);
    const errorSpy = spyOn(console, "error");

    const result = await svc.getDatabase();

    expect(result).toBeNull();
    expect(svc.useMemoryFallback).toBeTrue();
    expect(errorSpy).toHaveBeenCalledWith(
      "[IDB] Failed to resolve database instance. Switching to in-memory store.",
      error
    );
  });

  it("ensurePersistentSupport() throws once memory fallback is active", async () => {
    const original = globalThis.indexedDB;
    delete (globalThis as unknown as Record<string, unknown>).indexedDB;
    const svc = new IdbCoreService();
    await svc.init();
    (globalThis as unknown as Record<string, unknown>).indexedDB = original;

    await expectAsync(svc.ensurePersistentSupport()).toBeRejectedWithError(
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

  it("clone() deep-copies without sharing references", () => {
    const original = { nested: { value: 1 } };
    const cloned = service.clone(original);
    cloned.nested.value = 2;
    expect(original.nested.value).toBe(1);
  });

  it("resetDatabase() clears connection state so a subsequent init() starts fresh", async () => {
    await service.init();
    expect(service.useMemoryFallback).toBeFalse();

    await service.resetDatabase();
    await service.init();

    expect(service.useMemoryFallback).toBeFalse();
    const db = await service.getDatabase();
    expect(db).not.toBeNull();
  });
});
