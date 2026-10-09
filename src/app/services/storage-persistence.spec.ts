import { TestBed } from "@angular/core/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StoragePersistence } from "./storage-persistence";

describe("StoragePersistence", () => {
  afterEach(() => vi.restoreAllMocks());

  it("asks the browser to keep the data, once: not again when it has agreed", async () => {
    const persist = vi.spyOn(navigator.storage, "persist").mockResolvedValue(true);
    const service = TestBed.inject(StoragePersistence);
    expect(service.persisted()).toBeNull();

    await service.request();
    await service.request();

    expect(persist).toHaveBeenCalledTimes(1);
    expect(service.persisted()).toBe(true);
  });

  it("asks again at the next save when the browser said no", async () => {
    const persist = vi.spyOn(navigator.storage, "persist").mockResolvedValue(false);
    const service = TestBed.inject(StoragePersistence);

    await service.request();
    await service.request();

    expect(persist).toHaveBeenCalledTimes(2);
    expect(service.persisted()).toBe(false);
  });

  it("reads the state and the estimate without asking for anything", async () => {
    const persist = vi.spyOn(navigator.storage, "persist");
    vi.spyOn(navigator.storage, "persisted").mockResolvedValue(false);
    vi.spyOn(navigator.storage, "estimate").mockResolvedValue({ usage: 1024, quota: 4096 });
    const service = TestBed.inject(StoragePersistence);

    await service.refresh();

    expect(service.persisted()).toBe(false);
    expect(service.estimate()).toEqual({ usage: 1024, quota: 4096 });
    expect(persist).not.toHaveBeenCalled();
  });

  it("records a browser that fails to answer instead of throwing", async () => {
    vi.spyOn(navigator.storage, "persist").mockRejectedValue(new DOMException("no", "SecurityError"));
    vi.spyOn(navigator.storage, "persisted").mockRejectedValue(new DOMException("no", "SecurityError"));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const service = TestBed.inject(StoragePersistence);

    await service.request();
    await service.refresh();

    expect(service.persisted()).toBeNull();
  });
});
