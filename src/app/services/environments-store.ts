import { Injectable, Signal, computed, signal, inject } from "@angular/core";
import type { Row, VariableChange } from "@wayfarer/core";
import { EnvironmentDoc } from "@wayfarer/core";
import { EnvironmentsRepository } from "../data/environments-repository";
import { IdbCore } from "../data/idb-core";

@Injectable({
  providedIn: "root",
})
export class EnvironmentsStore {
  private readonly environmentsRepository = inject(EnvironmentsRepository);
  private readonly idb = inject(IdbCore);

  private readonly environmentsState = signal<EnvironmentDoc[]>([]);
  private readonly activeIdState = signal<string | null>(null);
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
      const environments = await this.environmentsRepository.listEnvironments();
      this.environmentsState.set(environments);
      this.globalsState.set(await this.environmentsRepository.getGlobals());
      const active = await this.environmentsRepository.getActiveEnvironmentId();
      if (active) {
        this.activeIdState.set(active);
      } else if (environments.length) {
        const firstId = environments[0].meta.id;
        await this.environmentsRepository.setActiveEnvironment(firstId);
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
    const doc = await this.environmentsRepository.createEnvironment(payload);
    await this.refresh();
    return doc;
  }

  async updateEnvironment(
    id: string,
    updates: Partial<Pick<EnvironmentDoc, "name" | "description" | "vars">>
  ): Promise<EnvironmentDoc | null> {
    const doc = await this.environmentsRepository.updateEnvironment(id, updates);
    await this.refresh();
    return doc;
  }

  /** Changes some variables (and the name or description) without replacing the rest: see `EnvironmentsRepository.changeEnvironment`. */
  async changeEnvironment(
    id: string,
    changes: VariableChange[],
    details?: Partial<Pick<EnvironmentDoc, "name" | "description">>
  ): Promise<EnvironmentDoc | null> {
    const doc = await this.environmentsRepository.changeEnvironment(id, changes, details);
    await this.refresh();
    return doc;
  }

  /** Changes some global variables without replacing the rest; gives back what is stored now. */
  async changeGlobals(changes: VariableChange[]): Promise<Row[]> {
    const stored = await this.environmentsRepository.changeGlobals(changes);
    this.globalsState.set(stored);
    return stored;
  }

  async duplicateEnvironment(id: string): Promise<EnvironmentDoc | null> {
    const doc = await this.environmentsRepository.duplicateEnvironment(id);
    await this.refresh();
    return doc;
  }

  async deleteEnvironment(id: string): Promise<void> {
    await this.environmentsRepository.deleteEnvironment(id);
    await this.refresh();
  }

  async reorderEnvironments(order: { id: string; order: number }[]): Promise<void> {
    await this.environmentsRepository.reorderEnvironments(order);
    await this.refresh();
  }

  async setActiveEnvironment(id: string | null): Promise<void> {
    await this.environmentsRepository.setActiveEnvironment(id);
    this.activeIdState.set(id);
  }
}
