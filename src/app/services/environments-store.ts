import { Injectable, Signal, computed, signal, inject } from "@angular/core";
import type { Row, VariableChange } from "@wayfarer/core";
import {
  EnvironmentDoc,
  EnvironmentId,
} from "../models/environments";
import { Idb } from "../data/idb";

@Injectable({
  providedIn: "root",
})
export class EnvironmentsStore {
  private readonly idb = inject(Idb);

  private readonly environmentsState = signal<EnvironmentDoc[]>([]);
  private readonly activeIdState = signal<EnvironmentId | null>(null);
  private readonly loadingState = signal(false);
  private readonly globalsState = signal<Row[]>([]);

  constructor() {
    // Another tab changed an environment, or which one is active.
    this.idb.onChangeElsewhere((stores) => {
      if (stores.includes("environments") || stores.includes("meta")) {
        void this.refresh();
      }
    });
  }

  readonly environments: Signal<EnvironmentDoc[]> = computed(() =>
    this.environmentsState()
  );
  readonly activeEnvironment: Signal<EnvironmentDoc | null> = computed(() => {
    const id = this.activeIdState();
    return id
      ? this.environmentsState().find((env) => env.meta.id === id) ?? null
      : null;
  });
  readonly loading: Signal<boolean> = computed(() => this.loadingState());
  /** The global variables: any request can use them, under any environment. */
  readonly globals = this.globalsState.asReadonly();

  async ensureLoaded(): Promise<void> {
    if (!this.environmentsState().length && !this.loadingState()) {
      await this.refresh();
    }
  }

  async refresh(): Promise<void> {
    this.loadingState.set(true);
    try {
      const environments = await this.idb.listEnvironments();
      this.environmentsState.set(environments);
      this.globalsState.set(await this.idb.getGlobals());
      const active = await this.idb.getActiveEnvironmentId();
      if (active) {
        this.activeIdState.set(active);
      } else if (environments.length) {
        const firstId = environments[0].meta.id;
        await this.idb.setActiveEnvironment(firstId);
        this.activeIdState.set(firstId);
      } else {
        this.activeIdState.set(null);
      }
    } finally {
      this.loadingState.set(false);
    }
  }

  async createEnvironment(payload: {
    name: string;
    description?: string;
    vars?: Row[];
  }): Promise<EnvironmentDoc> {
    const doc = await this.idb.createEnvironment(payload);
    await this.refresh();
    return doc;
  }

  async updateEnvironment(
    id: EnvironmentId,
    updates: Partial<Pick<EnvironmentDoc, "name" | "description" | "vars">>
  ): Promise<EnvironmentDoc | null> {
    const doc = await this.idb.updateEnvironment(id, updates);
    await this.refresh();
    return doc;
  }

  /** Changes some variables (and the name or description) without replacing the rest: see `EnvironmentsRepository.changeEnvironment`. */
  async changeEnvironment(
    id: EnvironmentId,
    changes: VariableChange[],
    details?: Partial<Pick<EnvironmentDoc, "name" | "description">>
  ): Promise<EnvironmentDoc | null> {
    const doc = await this.idb.changeEnvironment(id, changes, details);
    await this.refresh();
    return doc;
  }

  /** Changes some global variables without replacing the rest; gives back what is stored now. */
  async changeGlobals(changes: VariableChange[]): Promise<Row[]> {
    const stored = await this.idb.changeGlobals(changes);
    this.globalsState.set(stored);
    return stored;
  }

  async duplicateEnvironment(id: EnvironmentId): Promise<EnvironmentDoc | null> {
    const doc = await this.idb.duplicateEnvironment(id);
    await this.refresh();
    return doc;
  }

  async deleteEnvironment(id: EnvironmentId): Promise<void> {
    await this.idb.deleteEnvironment(id);
    await this.refresh();
  }

  async reorderEnvironments(order: { id: EnvironmentId; order: number }[]): Promise<void> {
    await this.idb.reorderEnvironments(order);
    await this.refresh();
  }

  async setActiveEnvironment(id: EnvironmentId | null): Promise<void> {
    await this.idb.setActiveEnvironment(id);
    this.activeIdState.set(id);
  }
}
