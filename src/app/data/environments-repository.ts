import { Injectable, inject } from "@angular/core";
import { applyVariableChanges, type Row, type VariableChange } from "@wayfarer/core";
import { EnvironmentDoc, EnvironmentId } from "../models/environments";
import { IdbCore, META_STATE_KEY } from "./idb-core";
import { GlobalsRecord, META_GLOBALS_KEY, MetaState } from "./idb-schema";

@Injectable({ providedIn: "root" })
export class EnvironmentsRepository {
  private readonly core = inject(IdbCore);

  async listEnvironments(): Promise<EnvironmentDoc[]> {
    await this.core.ensurePersistentSupport();
    const tx = await this.core.txReadonly(["environments"]);
    const index = tx.objectStore("environments").index("by-order");
    const items = await index.getAll();
    await tx.done;
    return this.core.ensureIds(items);
  }

  async createEnvironment(payload: {
    name: string;
    description?: string;
    vars?: Row[];
  }): Promise<EnvironmentDoc> {
    await this.core.ensurePersistentSupport();
    const tx = await this.core.txReadWrite(["environments"]);
    const store = tx.objectStore("environments");
    return this.core.commitOrRollback(tx, async () => {
      const meta = this.core.createMeta();
      const doc: EnvironmentDoc = {
        id: meta.id,
        meta,
        name: payload.name.trim(),
        description: payload.description?.trim() || undefined,
        vars: payload.vars ?? [],
        order: await this.core.nextOrder(store.index("by-order")),
      };
      this.core.ensureId(doc);
      await store.add(doc);
      return doc;
    });
  }

  async updateEnvironment(
    id: EnvironmentId,
    updates: Partial<Pick<EnvironmentDoc, "name" | "description" | "vars">>
  ): Promise<EnvironmentDoc | null> {
    await this.core.ensurePersistentSupport();
    const tx = await this.core.txReadWrite(["environments"]);
    const store = tx.objectStore("environments");
    return this.core.commitOrRollback(tx, async () => {
      const doc = await store.get(id);
      if (!doc) {
        return null;
      }
      if (updates.name !== undefined) {
        doc.name = updates.name.trim();
      }
      if (updates.description !== undefined) {
        doc.description = updates.description.trim() || undefined;
      }
      if (updates.vars !== undefined) {
        doc.vars = updates.vars.map((row) => ({ ...row }));
      }
      doc.meta = this.core.touchMeta(doc.meta);
      this.core.ensureId(doc);
      await store.put(doc);
      return doc;
    });
  }

  /**
   * Changes some variables of an environment, and its name or description
   * when given, reading the stored document inside the transaction that
   * writes it. Another tab's change to another variable, made since this
   * tab last read the environment, is therefore kept (D22).
   */
  async changeEnvironment(
    id: EnvironmentId,
    changes: VariableChange[],
    details: Partial<Pick<EnvironmentDoc, "name" | "description">> = {}
  ): Promise<EnvironmentDoc | null> {
    await this.core.ensurePersistentSupport();
    const tx = await this.core.txReadWrite(["environments"]);
    const store = tx.objectStore("environments");
    return this.core.commitOrRollback(tx, async () => {
      const doc = await store.get(id);
      if (!doc) {
        return null;
      }
      if (details.name !== undefined) {
        doc.name = details.name.trim();
      }
      if (details.description !== undefined) {
        doc.description = details.description.trim() || undefined;
      }
      doc.vars = applyVariableChanges(doc.vars, changes);
      doc.meta = this.core.touchMeta(doc.meta);
      this.core.ensureId(doc);
      await store.put(doc);
      return doc;
    });
  }

  async duplicateEnvironment(id: EnvironmentId): Promise<EnvironmentDoc | null> {
    await this.core.ensurePersistentSupport();
    const tx = await this.core.txReadWrite(["environments"]);
    const store = tx.objectStore("environments");
    return this.core.commitOrRollback(tx, async () => {
      const doc = await store.get(id);
      if (!doc) {
        return null;
      }
      const meta = this.core.createMeta();
      const clone: EnvironmentDoc = {
        ...structuredClone(doc),
        id: meta.id,
        meta,
        name: `${doc.name} copy`,
        order: await this.core.nextOrder(store.index("by-order")),
      };
      this.core.ensureId(clone);
      await store.add(clone);
      return clone;
    });
  }

  async deleteEnvironment(id: EnvironmentId): Promise<void> {
    await this.core.ensurePersistentSupport();
    const tx = await this.core.txReadWrite(["environments"]);
    await this.core.commitOrRollback(tx, async () => {
      await tx.objectStore("environments").delete(id);
    });

    const meta = await this.core.getMetaState();
    if (meta.activeEnvironmentId === id) {
      await this.setActiveEnvironment(null);
    }
  }

  async reorderEnvironments(order: { id: EnvironmentId; order: number }[]): Promise<void> {
    await this.core.ensurePersistentSupport();
    const tx = await this.core.txReadWrite(["environments"]);
    const store = tx.objectStore("environments");
    await this.core.commitOrRollback(tx, async () => {
      for (const entry of order) {
        const doc = await store.get(entry.id);
        if (!doc) {
          continue;
        }
        doc.order = entry.order;
        doc.meta = this.core.touchMeta(doc.meta);
        await store.put(doc);
      }
    });
  }

  /** The global variables: usable by every request, under any environment. */
  async getGlobals(): Promise<Row[]> {
    await this.core.ensurePersistentSupport();
    const tx = await this.core.txReadonly(["meta"]);
    const record = (await tx.objectStore("meta").get(META_GLOBALS_KEY)) as GlobalsRecord | undefined;
    await tx.done;
    return record?.variables ?? [];
  }

  /** Changes some global variables, reading the stored rows inside the transaction that writes them (D22). */
  async changeGlobals(changes: VariableChange[]): Promise<Row[]> {
    await this.core.ensurePersistentSupport();
    const tx = await this.core.txReadWrite(["meta"]);
    const store = tx.objectStore("meta");
    return this.core.commitOrRollback(tx, async () => {
      const record = (await store.get(META_GLOBALS_KEY)) as GlobalsRecord | undefined;
      const variables = applyVariableChanges(record?.variables ?? [], changes);
      await store.put({ key: META_GLOBALS_KEY, variables });
      return variables;
    });
  }

  async getActiveEnvironmentId(): Promise<EnvironmentId | null> {
    await this.core.ensurePersistentSupport();
    const meta = await this.core.getMetaState();
    return meta.activeEnvironmentId ?? null;
  }

  async setActiveEnvironment(id: EnvironmentId | null): Promise<void> {
    await this.core.ensurePersistentSupport();
    const tx = await this.core.txReadWrite(["meta"]);
    const store = tx.objectStore("meta");
    await this.core.commitOrRollback(tx, async () => {
      const state: MetaState = ((await store.get(META_STATE_KEY)) as MetaState | undefined) ?? {
        key: META_STATE_KEY,
        schemaVersion: 1,
        activeEnvironmentId: null,
      };
      state.activeEnvironmentId = id;
      await store.put(state);
    });
  }
}
