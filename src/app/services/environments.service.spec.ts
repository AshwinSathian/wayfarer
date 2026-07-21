import { TestBed } from "@angular/core/testing";
import { EnvironmentsService } from "./environments.service";
import { IdbService } from "../data/idb.service";
import { EnvironmentDoc } from "../models/environments.models";
import { describe, it, beforeEach, expect, vi } from "vitest";

class IdbServiceMock {
  listEnvironments = vi.fn().mockResolvedValue([]);
  getActiveEnvironmentId = vi.fn().mockResolvedValue(null);
  setActiveEnvironment = vi.fn().mockResolvedValue(undefined);
  createEnvironment = vi.fn();
  updateEnvironment = vi.fn();
  duplicateEnvironment = vi.fn();
  deleteEnvironment = vi.fn().mockResolvedValue(undefined);
  reorderEnvironments = vi.fn().mockResolvedValue(undefined);
}

function buildEnv(id: string, overrides: Partial<EnvironmentDoc> = {}): EnvironmentDoc {
  return {
    id,
    meta: { id, createdAt: 1, updatedAt: 1, version: 1 },
    name: `Env ${id}`,
    order: 1,
    vars: {},
    ...overrides,
  } as EnvironmentDoc;
}

describe("EnvironmentsService", () => {
  let service: EnvironmentsService;
  let idb: IdbServiceMock;

  beforeEach(() => {
    idb = new IdbServiceMock();
    TestBed.configureTestingModule({
      providers: [{ provide: IdbService, useValue: idb }],
    });
    service = TestBed.inject(EnvironmentsService);
  });

  it("starts with no environments, no active environment, not loading", () => {
    expect(service.environments()).toEqual([]);
    expect(service.activeEnvironment()).toBeNull();
    expect(service.loading()).toBe(false);
  });

  describe("refresh()", () => {
    it("auto-activates the first environment when none is active", async () => {
      const envA = buildEnv("a");
      const envB = buildEnv("b");
      idb.listEnvironments.mockResolvedValue([envA, envB]);
      idb.getActiveEnvironmentId.mockResolvedValue(null);

      await service.refresh();

      expect(service.environments()).toEqual([envA, envB]);
      expect(idb.setActiveEnvironment).toHaveBeenCalledWith("a");
      expect(service.activeEnvironment()).toEqual(envA);
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

  describe("mutation methods refresh state from IdbService afterward", () => {
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
      // doesn't re-fetch the whole environments list from IdbService.
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
