import { ComponentFixture, TestBed } from "@angular/core/testing";
import { rowsOf } from "../../../testing/request-fixtures";
import { signal } from "@angular/core";
import { EnvironmentsManager } from "./environments-manager";
import { EnvironmentsStore } from "../../services/environments-store";
import { EnvironmentDoc } from "@wayfarer/core";
import { describe, it, beforeEach, expect, vi } from "vitest";

function makeEnv(id: string, vars: Record<string, string> = {}): EnvironmentDoc {
  return {
    id,
    meta: { id, createdAt: 1, updatedAt: 1 },
    name: `Env ${id}`,
    vars: rowsOf(vars),
    order: 0,
  };
}

class EnvironmentsServiceStub {
  private readonly environmentsState = signal<EnvironmentDoc[]>([]);
  private readonly activeState = signal<EnvironmentDoc | null>(null);
  readonly environments = this.environmentsState.asReadonly();
  readonly activeEnvironment = this.activeState.asReadonly();
  readonly globals = signal([]);
  readonly loading = signal(false);

  readonly createCalls: unknown[] = [];
  readonly updateCalls: { id: string; updates: unknown }[] = [];
  readonly duplicateCalls: string[] = [];
  readonly deleteCalls: string[] = [];
  readonly setActiveCalls: (string | null)[] = [];

  setEnvironments(envs: EnvironmentDoc[]): void {
    this.environmentsState.set(envs);
  }

  setActive(env: EnvironmentDoc | null): void {
    this.activeState.set(env);
  }

  async ensureLoaded(): Promise<void> {
    // no-op — environments are set directly via setEnvironments() in tests
  }

  async createEnvironment(payload: {
    name: string;
    description?: string;
    vars?: Record<string, string>;
  }): Promise<EnvironmentDoc> {
    this.createCalls.push(payload);
    const doc = makeEnv("new-env", payload.vars ?? {});
    this.environmentsState.update((envs) => [...envs, doc]);
    return doc;
  }

  async updateEnvironment(
    id: string,
    updates: Partial<Pick<EnvironmentDoc, "name" | "description" | "vars">>,
  ): Promise<EnvironmentDoc | null> {
    this.updateCalls.push({ id, updates });
    return null;
  }

  readonly changeCalls: { id: string; changes: unknown; details: unknown }[] = [];
  /** What the stored environment is after the change, as another tab may have left it. */
  changeResult: EnvironmentDoc | null = null;

  async changeEnvironment(id: string, changes: unknown, details: unknown): Promise<EnvironmentDoc | null> {
    this.changeCalls.push({ id, changes, details });
    // As the store does: it has read the environments again by the time a change returns.
    const result = this.changeResult;
    if (result) {
      this.environmentsState.update((envs) => envs.map((env) => (env.meta.id === id ? result : env)));
    }
    return result;
  }

  async duplicateEnvironment(id: string): Promise<EnvironmentDoc | null> {
    this.duplicateCalls.push(id);
    return null;
  }

  async deleteEnvironment(id: string): Promise<void> {
    this.deleteCalls.push(id);
  }

  async setActiveEnvironment(id: string | null): Promise<void> {
    this.setActiveCalls.push(id);
  }
}

describe("EnvironmentsManager", () => {
  let component: EnvironmentsManager;
  let fixture: ComponentFixture<EnvironmentsManager>;
  let envService: EnvironmentsServiceStub;

  beforeEach(async () => {
    envService = new EnvironmentsServiceStub();

    await TestBed.configureTestingModule({
      imports: [EnvironmentsManager],
      providers: [{ provide: EnvironmentsStore, useValue: envService }],
    }).compileComponents();

    fixture = TestBed.createComponent(EnvironmentsManager);
    component = fixture.componentInstance;
  });

  describe("selecting an environment", () => {
    it("opens its name and description, and hands its variables to the rows", () => {
      const env = makeEnv("e1", { API_KEY: "abc" });
      envService.setEnvironments([env]);

      component.selectEnvironment("e1");

      expect(component.selectedId()).toBe("e1");
      expect(component.draft()).toEqual({ id: "e1", name: "Env e1", description: undefined });
      expect(component.holder()).toMatchObject({ id: "e1", name: "Env e1", environmentId: "e1", rows: env.vars });
    });

    it("auto-selects the active environment on construction if nothing is selected yet", () => {
      const env = makeEnv("e1");
      envService.setEnvironments([env]);
      envService.setActive(env);

      // The auto-select effect runs on the next change-detection tick.
      fixture.detectChanges();

      expect(component.selectedId()).toBe("e1");
    });
  });

  describe("writing as it goes", () => {
    beforeEach(() => {
      envService.setEnvironments([makeEnv("e1", { A: "1" }), makeEnv("e2", { B: "2" })]);
      component.selectEnvironment("e1");
    });

    it("commit() sends a trimmed name and no variable", async () => {
      component.draft.update((d) => (d ? { ...d, name: "  Renamed  " } : d));
      await component.commit();
      expect(envService.changeCalls).toEqual([
        { id: "e1", changes: [], details: { name: "Renamed", description: "" } },
      ]);
    });

    it("commit() writes nothing when the name and the description are as stored", async () => {
      await component.commit();
      expect(envService.changeCalls).toEqual([]);
    });

    it("the rows' writes go to the open environment, and give back what the store holds then (F62)", async () => {
      envService.changeEnvironment = async (id, changes, details) => {
        envService.changeCalls.push({ id, changes, details });
        // Another tab's save landed after this one's: the store has read it, and the save returns its own.
        envService.setEnvironments([makeEnv("e1", { A: "1", mine: "1", theirs: "2" })]);
        return makeEnv("e1", { A: "1", mine: "1" });
      };
      const stored = await component.holder()!.write([{ key: "mine", value: "1" }]);
      expect(envService.changeCalls).toEqual([
        { id: "e1", changes: [{ key: "mine", value: "1" }], details: undefined },
      ]);
      expect(stored?.map((row) => row.key)).toEqual(["A", "mine", "theirs"]);
    });

    it("writes the name when the editor is destroyed (× and Escape)", async () => {
      component.draft.update((d) => (d ? { ...d, name: "typed" } : d));
      fixture.destroy();
      await vi.waitFor(() => expect(envService.changeCalls).toHaveLength(1));
      expect(envService.changeCalls[0].details).toEqual({ name: "typed", description: "" });
    });

    it("writes the environment being left when another is chosen", async () => {
      component.draft.update((d) => (d ? { ...d, name: "typed" } : d));
      component.selectEnvironment("e2");
      await vi.waitFor(() => expect(envService.changeCalls).toHaveLength(1));
      expect(envService.changeCalls[0].id).toBe("e1");
      expect(component.draft()?.id).toBe("e2");
    });

    it("says so when the browser refuses the write", async () => {
      envService.changeEnvironment = async () => {
        throw new DOMException("quota", "QuotaExceededError");
      };
      vi.spyOn(console, "warn").mockImplementation(() => undefined);
      component.draft.update((d) => (d ? { ...d, name: "typed" } : d));
      await component.commit();
      expect(component.saveError()).toBe(
        "typed was not saved: this browser refused the write. Your edits are still here.",
      );
    });

    it("says when the environment was deleted in another tab", async () => {
      envService.changeResult = null;
      component.draft.update((d) => (d ? { ...d, name: "typed" } : d));
      await component.commit();
      expect(component.saveError()).toBe("typed was not saved: it was deleted in another tab.");
    });
  });

  describe("lifecycle actions", () => {
    it("duplicate() selects the newly-created copy", async () => {
      const env = makeEnv("e1");
      const copy = makeEnv("e1-copy");
      envService.duplicateEnvironment = async () => copy;
      envService.setEnvironments([env]);

      await component.duplicate(env);

      expect(component.selectedId()).toBe("e1-copy");
    });

    it("setActive() delegates to EnvironmentsStore.setActiveEnvironment", async () => {
      const env = makeEnv("e1");

      await component.setActive(env);

      expect(envService.setActiveCalls).toEqual(["e1"]);
    });
  });
});
