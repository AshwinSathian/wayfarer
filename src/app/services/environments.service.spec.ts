import { TestBed } from "@angular/core/testing";
import { EnvironmentsService } from "./environments.service";
import { IdbService } from "../data/idb.service";
import { EnvironmentDoc } from "../models/environments.models";

class IdbServiceMock {
  listEnvironments = jasmine.createSpy("listEnvironments").and.resolveTo([]);
  getActiveEnvironmentId = jasmine.createSpy("getActiveEnvironmentId").and.resolveTo(null);
  setActiveEnvironment = jasmine.createSpy("setActiveEnvironment").and.resolveTo();
  createEnvironment = jasmine.createSpy("createEnvironment");
  updateEnvironment = jasmine.createSpy("updateEnvironment");
  duplicateEnvironment = jasmine.createSpy("duplicateEnvironment");
  deleteEnvironment = jasmine.createSpy("deleteEnvironment").and.resolveTo();
  reorderEnvironments = jasmine.createSpy("reorderEnvironments").and.resolveTo();
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
    expect(service.loading()).toBeFalse();
  });

  describe("refresh()", () => {
    it("auto-activates the first environment when none is active", async () => {
      const envA = buildEnv("a");
      const envB = buildEnv("b");
      idb.listEnvironments.and.resolveTo([envA, envB]);
      idb.getActiveEnvironmentId.and.resolveTo(null);

      await service.refresh();

      expect(service.environments()).toEqual([envA, envB]);
      expect(idb.setActiveEnvironment).toHaveBeenCalledWith("a");
      expect(service.activeEnvironment()).toEqual(envA);
    });

    it("respects an already-active environment id instead of overriding it", async () => {
      const envA = buildEnv("a");
      const envB = buildEnv("b");
      idb.listEnvironments.and.resolveTo([envA, envB]);
      idb.getActiveEnvironmentId.and.resolveTo("b");

      await service.refresh();

      expect(idb.setActiveEnvironment).not.toHaveBeenCalled();
      expect(service.activeEnvironment()).toEqual(envB);
    });

    it("clears the active environment when the list is empty", async () => {
      idb.listEnvironments.and.resolveTo([]);
      idb.getActiveEnvironmentId.and.resolveTo(null);

      await service.refresh();

      expect(service.activeEnvironment()).toBeNull();
    });

    it("sets loading true only for the duration of the refresh", async () => {
      let loadingDuringCall: boolean | undefined;
      idb.listEnvironments.and.callFake(async () => {
        loadingDuringCall = service.loading();
        return [];
      });

      await service.refresh();

      expect(loadingDuringCall).toBeTrue();
      expect(service.loading()).toBeFalse();
    });

    it("resets loading to false even if the underlying call throws", async () => {
      idb.listEnvironments.and.rejectWith(new Error("boom"));

      await expectAsync(service.refresh()).toBeRejected();

      expect(service.loading()).toBeFalse();
    });
  });

  describe("ensureLoaded()", () => {
    it("triggers a refresh the first time when there are no environments yet", async () => {
      idb.listEnvironments.and.resolveTo([buildEnv("a")]);

      await service.ensureLoaded();

      expect(idb.listEnvironments).toHaveBeenCalledTimes(1);
    });

    it("does not refresh again once environments are already loaded", async () => {
      idb.listEnvironments.and.resolveTo([buildEnv("a")]);
      await service.ensureLoaded();

      await service.ensureLoaded();

      expect(idb.listEnvironments).toHaveBeenCalledTimes(1);
    });
  });

  describe("mutation methods refresh state from IdbService afterward", () => {
    it("createEnvironment() persists then re-reads the full list", async () => {
      const created = buildEnv("new");
      idb.createEnvironment.and.resolveTo(created);
      idb.listEnvironments.and.resolveTo([created]);
      idb.getActiveEnvironmentId.and.resolveTo("new");

      const result = await service.createEnvironment({ name: "New" });

      expect(idb.createEnvironment).toHaveBeenCalledWith({ name: "New" });
      expect(result).toEqual(created);
      expect(service.environments()).toEqual([created]);
    });

    it("updateEnvironment() persists then refreshes", async () => {
      const updated = buildEnv("a", { name: "Renamed" });
      idb.updateEnvironment.and.resolveTo(updated);
      idb.listEnvironments.and.resolveTo([updated]);
      idb.getActiveEnvironmentId.and.resolveTo("a");

      const result = await service.updateEnvironment("a", { name: "Renamed" });

      expect(idb.updateEnvironment).toHaveBeenCalledWith("a", { name: "Renamed" });
      expect(result).toEqual(updated);
      expect(service.environments()).toEqual([updated]);
    });

    it("deleteEnvironment() persists then refreshes", async () => {
      idb.listEnvironments.and.resolveTo([]);
      idb.getActiveEnvironmentId.and.resolveTo(null);

      await service.deleteEnvironment("a");

      expect(idb.deleteEnvironment).toHaveBeenCalledWith("a");
      expect(idb.listEnvironments).toHaveBeenCalled();
    });
  });

  describe("setActiveEnvironment()", () => {
    it("persists the choice and updates activeEnvironment synchronously without a full refresh", async () => {
      const envA = buildEnv("a");
      idb.listEnvironments.and.resolveTo([envA]);
      idb.getActiveEnvironmentId.and.resolveTo(null);
      await service.refresh();
      idb.listEnvironments.calls.reset();

      await service.setActiveEnvironment("a");

      expect(idb.setActiveEnvironment).toHaveBeenCalledWith("a");
      expect(service.activeEnvironment()).toEqual(envA);
      // setActiveEnvironment() only updates the local active-id signal, it
      // doesn't re-fetch the whole environments list from IdbService.
      expect(idb.listEnvironments).not.toHaveBeenCalled();
    });

    it("can clear the active environment by passing null", async () => {
      const envA = buildEnv("a");
      idb.listEnvironments.and.resolveTo([envA]);
      idb.getActiveEnvironmentId.and.resolveTo("a");
      await service.refresh();

      await service.setActiveEnvironment(null);

      expect(service.activeEnvironment()).toBeNull();
    });
  });
});
