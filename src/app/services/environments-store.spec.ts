import { TestBed } from "@angular/core/testing";
import { EnvironmentsStore } from "./environments-store";
import { provideRepositories, repositories, type Repositories } from "../../testing/repositories";
import { EnvironmentDoc } from "@wayfarer/core";
import { describe, it, beforeEach, afterEach, expect, vi } from "vitest";

class IdbServiceMock {
  /** The listener the service registers for writes made in another tab. */
  changedElsewhere: (stores: string[]) => void = () => undefined;
  onChangeElsewhere = (listener: (stores: string[]) => void): void => {
    this.changedElsewhere = listener;
  };
  listEnvironments = vi.fn().mockResolvedValue([]);
  getActiveEnvironmentId = vi.fn().mockResolvedValue(null);
  getGlobals = vi.fn().mockResolvedValue([]);
  changeGlobals = vi.fn();
  setActiveEnvironment = vi.fn().mockResolvedValue(undefined);
  createEnvironment = vi.fn();
  updateEnvironment = vi.fn();
  changeEnvironment = vi.fn();
  duplicateEnvironment = vi.fn();
  deleteEnvironment = vi.fn().mockResolvedValue(undefined);
  reorderEnvironments = vi.fn().mockResolvedValue(undefined);
}

function buildEnv(id: string, overrides: Partial<EnvironmentDoc> = {}): EnvironmentDoc {
  return {
    id,
    meta: { id, createdAt: 1, updatedAt: 1 },
    name: `Env ${id}`,
    order: 1,
    vars: {},
    ...overrides,
  } as EnvironmentDoc;
}

describe("EnvironmentsStore", () => {
  it("reads the environments again when another tab changes one, or the active one; and after a change of variables", async () => {
    idb.changedElsewhere(["requests", "history"]);
    expect(idb.listEnvironments).not.toHaveBeenCalled();

    idb.changedElsewhere(["environments"]);
    idb.changedElsewhere(["meta"]);
    await vi.waitFor(() => expect(idb.listEnvironments).toHaveBeenCalledTimes(2));

    idb.changeEnvironment.mockResolvedValue(buildEnv("a"));
    expect(await service.changeEnvironment("a", [{ key: "k", value: "v" }], { name: "A" })).toEqual(buildEnv("a"));
    expect(idb.changeEnvironment).toHaveBeenCalledWith("a", [{ key: "k", value: "v" }], { name: "A" });
    expect(idb.listEnvironments).toHaveBeenCalledTimes(3);
  });

  let service: EnvironmentsStore;
  let idb: IdbServiceMock;

  beforeEach(() => {
    idb = new IdbServiceMock();
    TestBed.configureTestingModule({
      providers: [...provideRepositories(idb)],
    });
    service = TestBed.inject(EnvironmentsStore);
  });

  it("starts with no environments, no active environment, not loading", () => {
    expect(service.environments()).toEqual([]);
    expect(service.activeEnvironment()).toBeNull();
    expect(service.loading()).toBe(false);
  });

  describe("refresh()", () => {
    it("puts the first environment in use when no choice was made", async () => {
      const envA = buildEnv("a");
      const envB = buildEnv("b");
      idb.listEnvironments.mockResolvedValue([envA, envB]);
      idb.getActiveEnvironmentId.mockResolvedValue(undefined);

      await service.refresh();

      expect(service.environments()).toEqual([envA, envB]);
      expect(idb.setActiveEnvironment).toHaveBeenCalledWith("a");
      expect(service.activeEnvironment()).toEqual(envA);
    });

    it("keeps No environment when that was chosen", async () => {
      idb.listEnvironments.mockResolvedValue([buildEnv("a")]);
      idb.getActiveEnvironmentId.mockResolvedValue(null);

      await service.refresh();

      expect(idb.setActiveEnvironment).not.toHaveBeenCalled();
      expect(service.activeEnvironment()).toBeNull();
    });

    it("respects an already-active environment id instead of overriding it", async () => {
      const envA = buildEnv("a");
      const envB = buildEnv("b");
      idb.listEnvironments.mockResolvedValue([envA, envB]);
      idb.getActiveEnvironmentId.mockResolvedValue("b");

      await service.refresh();

      expect(idb.setActiveEnvironment).not.toHaveBeenCalled();
      expect(service.activeEnvironment()).toEqual(envB);
    });

    it("clears the active environment when the list is empty", async () => {
      idb.listEnvironments.mockResolvedValue([]);
      idb.getActiveEnvironmentId.mockResolvedValue(null);

      await service.refresh();

      expect(service.activeEnvironment()).toBeNull();
    });

    it("sets loading true only for the duration of the refresh", async () => {
      let loadingDuringCall: boolean | undefined;
      idb.listEnvironments.mockImplementation(async () => {
        loadingDuringCall = service.loading();
        return [];
      });

      await service.refresh();

      expect(loadingDuringCall).toBe(true);
      expect(service.loading()).toBe(false);
    });

    it("resets loading to false even if the underlying call throws", async () => {
      idb.listEnvironments.mockRejectedValue(new Error("boom"));

      await expect(service.refresh()).rejects.toThrow();

      expect(service.loading()).toBe(false);
    });
  });

  describe("ensureLoaded()", () => {
    it("triggers a refresh the first time when there are no environments yet", async () => {
      idb.listEnvironments.mockResolvedValue([buildEnv("a")]);

      await service.ensureLoaded();

      expect(idb.listEnvironments).toHaveBeenCalledTimes(1);
    });

    it("does not refresh again once environments are already loaded", async () => {
      idb.listEnvironments.mockResolvedValue([buildEnv("a")]);
      await service.ensureLoaded();

      await service.ensureLoaded();

      expect(idb.listEnvironments).toHaveBeenCalledTimes(1);
    });
  });

  describe("mutation methods refresh state from the repository afterward", () => {
    it("createEnvironment() persists then re-reads the full list", async () => {
      const created = buildEnv("new");
      idb.createEnvironment.mockResolvedValue(created);
      idb.listEnvironments.mockResolvedValue([created]);
      idb.getActiveEnvironmentId.mockResolvedValue("new");

      const result = await service.createEnvironment({ name: "New" });

      expect(idb.createEnvironment).toHaveBeenCalledWith({ name: "New" });
      expect(result).toEqual(created);
      expect(service.environments()).toEqual([created]);
    });

    // L-19 (D5-e): an environment made while none is in use is the one meant to be used.
    it("createEnvironment() puts the new one in use when none is, and leaves the one in use otherwise", async () => {
      let stored: string | null = null;
      idb.setActiveEnvironment.mockImplementation(async (id: string | null) => void (stored = id));
      idb.getActiveEnvironmentId.mockImplementation(async () => stored);
      const [envA, envB, envC] = [buildEnv("a"), buildEnv("b"), buildEnv("c")];
      idb.listEnvironments.mockResolvedValue([envA]);
      await service.refresh();
      await service.setActiveEnvironment(null);

      idb.createEnvironment.mockResolvedValue(envB);
      idb.listEnvironments.mockResolvedValue([envA, envB]);
      await service.createEnvironment({ name: "B" });
      expect(service.activeEnvironment()).toEqual(envB);

      idb.createEnvironment.mockResolvedValue(envC);
      idb.listEnvironments.mockResolvedValue([envA, envB, envC]);
      await service.createEnvironment({ name: "C" });
      expect(service.activeEnvironment()).toEqual(envB);
    });

    it("updateEnvironment() persists then refreshes", async () => {
      const updated = buildEnv("a", { name: "Renamed" });
      idb.updateEnvironment.mockResolvedValue(updated);
      idb.listEnvironments.mockResolvedValue([updated]);
      idb.getActiveEnvironmentId.mockResolvedValue("a");

      const result = await service.updateEnvironment("a", { name: "Renamed" });

      expect(idb.updateEnvironment).toHaveBeenCalledWith("a", { name: "Renamed" });
      expect(result).toEqual(updated);
      expect(service.environments()).toEqual([updated]);
    });

    it("deleteEnvironment() persists then refreshes", async () => {
      idb.listEnvironments.mockResolvedValue([]);
      idb.getActiveEnvironmentId.mockResolvedValue(null);

      await service.deleteEnvironment("a");

      expect(idb.deleteEnvironment).toHaveBeenCalledWith("a");
      expect(idb.listEnvironments).toHaveBeenCalled();
    });
  });

  describe("setActiveEnvironment()", () => {
    it("persists the choice and updates activeEnvironment synchronously without a full refresh", async () => {
      const envA = buildEnv("a");
      idb.listEnvironments.mockResolvedValue([envA]);
      idb.getActiveEnvironmentId.mockResolvedValue(null);
      await service.refresh();
      idb.listEnvironments.mockClear();

      await service.setActiveEnvironment("a");

      expect(idb.setActiveEnvironment).toHaveBeenCalledWith("a");
      expect(service.activeEnvironment()).toEqual(envA);
      // setActiveEnvironment() only updates the local active-id signal, it
      // doesn't re-fetch the whole environments list from the repository.
      expect(idb.listEnvironments).not.toHaveBeenCalled();
    });

    it("can clear the active environment by passing null", async () => {
      const envA = buildEnv("a");
      idb.listEnvironments.mockResolvedValue([envA]);
      idb.getActiveEnvironmentId.mockResolvedValue("a");
      await service.refresh();

      await service.setActiveEnvironment(null);

      expect(service.activeEnvironment()).toBeNull();
    });
  });
});

// Over the real IndexedDB: the choice of environment through a refresh and a reload.
describe("EnvironmentsStore: the environment in use (real IndexedDB)", () => {
  let core: Repositories;
  /** A reload: a new store over the same database. */
  const reload = () => TestBed.runInInjectionContext(() => new EnvironmentsStore());

  beforeEach(() => {
    TestBed.configureTestingModule({});
    core = repositories();
  });

  afterEach(async () => {
    await core.resetDatabase();
  });

  it("puts the first environment in use when no choice was ever made", async () => {
    const dev = await core.environments.createEnvironment({ name: "Dev" });
    await core.environments.createEnvironment({ name: "Prod" });

    const store = reload();
    await store.refresh();

    expect(store.activeEnvironment()?.meta.id).toBe(dev.meta.id);
  });

  it("keeps No environment through a refresh", async () => {
    const store = TestBed.inject(EnvironmentsStore);
    const dev = await store.createEnvironment({ name: "Dev" });
    expect(store.activeEnvironment()?.meta.id).toBe(dev.meta.id);

    await store.setActiveEnvironment(null);
    await store.updateEnvironment(dev.meta.id, { name: "Development" });

    expect(store.activeEnvironment()).toBeNull();
  });

  it("keeps No environment through a reload", async () => {
    const store = TestBed.inject(EnvironmentsStore);
    await store.createEnvironment({ name: "Dev" });
    await store.setActiveEnvironment(null);

    const reloaded = reload();
    await reloaded.refresh();
    expect(reloaded.environments().length).toBe(1);
    expect(reloaded.activeEnvironment()).toBeNull();
  });

  it("puts a new environment in use while No environment is chosen", async () => {
    const store = TestBed.inject(EnvironmentsStore);
    await store.createEnvironment({ name: "Dev" });
    await store.setActiveEnvironment(null);

    const staging = await store.createEnvironment({ name: "Staging" });

    expect(store.activeEnvironment()?.meta.id).toBe(staging.meta.id);
  });

  it("puts the first environment in use after the one in use is deleted", async () => {
    const store = TestBed.inject(EnvironmentsStore);
    const dev = await store.createEnvironment({ name: "Dev" });
    const prod = await store.createEnvironment({ name: "Prod" });
    await store.setActiveEnvironment(prod.meta.id);

    await store.deleteEnvironment(prod.meta.id);

    expect(store.activeEnvironment()?.meta.id).toBe(dev.meta.id);
  });
});
