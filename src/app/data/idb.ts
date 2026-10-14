import { Injectable, inject } from "@angular/core";
import type { Row, VariableChange } from "@wayfarer/core";
import {
  Collection,
  CollectionExport,
  Folder,
  InheritedPatch,
  NewRequest,
  RequestDoc,
  RequestPatch,
} from "../models/collections";
import { EnvironmentDoc } from "@wayfarer/core";
import { PastRequest } from "@wayfarer/core";
import type { SecretEnvelope, VaultRecord } from "@wayfarer/core";
import { SecretDoc } from "../models/secrets";
import { IdbCore } from "./idb-core";
import { HistoryRepository } from "./history-repository";
import { CollectionsRepository } from "./collections-repository";
import { FoldersRepository } from "./folders-repository";
import { CollectionRequestsRepository } from "./collection-requests-repository";
import { EnvironmentsRepository } from "./environments-repository";
import { SecretsRepository } from "./secrets-repository";
import { WorkspaceRepository, type WorkspaceStores } from "./workspace-repository";

/**
 * Public facade over the IndexedDB persistence layer. Every existing
 * consumer (App, CollectionsStore, EnvironmentsStore,
 * SecretsVault, WorkspaceStore, AppShell) keeps injecting
 * this exact class with this exact API. The actual storage/schema/
 * migration logic and each aggregate's CRUD now live in IdbCore and
 * the *.repository.ts files (collections/folders/requests were originally
 * one CollectionsRepository; split into three once that file crossed ~540
 * lines), independently testable without going through this facade. This
 * facade used to be a single 1,300+ line god object.
 */
@Injectable({
  providedIn: "root",
})
export class Idb {
  private readonly core = inject(IdbCore);
  private readonly history = inject(HistoryRepository);
  private readonly collections = inject(CollectionsRepository);
  private readonly folders = inject(FoldersRepository);
  private readonly collectionRequests = inject(CollectionRequestsRepository);
  private readonly environments = inject(EnvironmentsRepository);
  private readonly secrets = inject(SecretsRepository);
  private readonly workspace = inject(WorkspaceRepository);

  /** True once another tab reset all data; see IdbCore.closedByOtherTab. */
  readonly closedByOtherTab = this.core.closedByOtherTab.asReadonly();
  /** True when the browser gives the app no storage; see IdbCore.memoryOnly. */
  readonly memoryOnly = this.core.memoryOnly.asReadonly();
  readonly updatedElsewhere = this.core.updatedElsewhere.asReadonly();
  readonly upgradeBlocked = this.core.upgradeBlocked.asReadonly();
  readonly olderThanData = this.core.olderThanData.asReadonly();
  readonly clearedOldData = this.core.clearedOldData.asReadonly();

  /** Calls `listener` when another tab has written to the database, with the stores it touched. */
  onChangeElsewhere(listener: (stores: string[]) => void): void {
    this.core.onChangeElsewhere(listener);
  }

  async init(): Promise<void> {
    return this.core.init();
  }

  // ── History ──────────────────────────────────────────────────────────

  async add(req: PastRequest, cap: number): Promise<number | null> {
    return this.history.add(req, cap);
  }

  async get(id: number): Promise<PastRequest | null> {
    return this.history.get(id);
  }

  async getLatest(limit?: number): Promise<PastRequest[]> {
    return this.history.getLatest(limit);
  }

  async delete(id: number): Promise<void> {
    return this.history.delete(id);
  }

  async clear(): Promise<void> {
    return this.history.clear();
  }

  // ── Collections / folders / requests ────────────────────────────────

  async listCollections(): Promise<Collection[]> {
    return this.collections.listCollections();
  }

  async createCollection(payload: { name: string; description?: string }): Promise<Collection> {
    return this.collections.createCollection(payload);
  }

  async renameCollection(
    id: string,
    updates: { name?: string; description?: string }
  ): Promise<Collection | null> {
    return this.collections.renameCollection(id, updates);
  }

  async setCollectionInherited(id: string, patch: InheritedPatch<Collection>): Promise<Collection | null> {
    return this.collections.setCollectionInherited(id, patch);
  }

  async setFolderInherited(id: string, patch: InheritedPatch<Folder>): Promise<Folder | null> {
    return this.folders.setFolderInherited(id, patch);
  }

  async changeFolderVariables(id: string, changes: VariableChange[]): Promise<Folder | null> {
    return this.folders.changeFolderVariables(id, changes);
  }

  async duplicateCollection(id: string): Promise<Collection | null> {
    return this.collections.duplicateCollection(id);
  }

  async approveScripts(id: string, digests: string[], review: boolean): Promise<Collection | null> {
    return this.collections.approveScripts(id, digests, review);
  }

  async changeCollectionVariables(id: string, changes: VariableChange[]): Promise<Collection | null> {
    return this.collections.changeCollectionVariables(id, changes);
  }

  async deleteCollection(id: string): Promise<void> {
    return this.collections.deleteCollection(id);
  }

  async reorderCollections(order: { id: string; order: number }[]): Promise<void> {
    return this.collections.reorderCollections(order);
  }

  async getCollectionExport(id: string): Promise<CollectionExport | null> {
    return this.collections.getCollectionExport(id);
  }

  async importCollectionExport(
    payload: CollectionExport,
    options?: { duplicateAsNew?: boolean }
  ): Promise<Collection | null> {
    return this.collections.importCollectionExport(payload, options);
  }

  async listFolders(collectionId: string): Promise<Folder[]> {
    return this.folders.listFolders(collectionId);
  }

  async createFolder(payload: {
    collectionId: string;
    name: string;
    parentFolderId?: string;
    order?: number;
  }): Promise<Folder> {
    return this.folders.createFolder(payload);
  }

  async renameFolder(id: string, name: string): Promise<Folder | null> {
    return this.folders.renameFolder(id, name);
  }

  async duplicateFolder(id: string): Promise<Folder | null> {
    return this.folders.duplicateFolder(id);
  }

  async deleteFolder(id: string): Promise<void> {
    return this.folders.deleteFolder(id);
  }

  async reorderChildren(order: { id: string | string; order: number }[]): Promise<void> {
    return this.folders.reorderChildren(order);
  }

  async listRequests(collectionId: string): Promise<RequestDoc[]> {
    return this.collectionRequests.listRequests(collectionId);
  }

  async createRequest(payload: NewRequest, files?: ReadonlyMap<string, Blob>): Promise<RequestDoc> {
    return this.collectionRequests.createRequest(payload, files);
  }

  async renameRequest(id: string, name: string): Promise<RequestDoc | null> {
    return this.collectionRequests.renameRequest(id, name);
  }

  async updateRequest(id: string, patch: RequestPatch, files?: ReadonlyMap<string, Blob>): Promise<RequestDoc | null> {
    return this.collectionRequests.updateRequest(id, patch, files);
  }

  async readFile(id: string): Promise<Blob | undefined> {
    return this.collectionRequests.readFile(id);
  }

  async duplicateRequest(id: string): Promise<RequestDoc | null> {
    return this.collectionRequests.duplicateRequest(id);
  }

  async deleteRequest(id: string): Promise<void> {
    return this.collectionRequests.deleteRequest(id);
  }

  // ── Environments ─────────────────────────────────────────────────────

  async listEnvironments(): Promise<EnvironmentDoc[]> {
    return this.environments.listEnvironments();
  }

  async createEnvironment(payload: {
    name: string;
    description?: string;
    vars?: Row[];
  }): Promise<EnvironmentDoc> {
    return this.environments.createEnvironment(payload);
  }

  async updateEnvironment(
    id: string,
    updates: Partial<Pick<EnvironmentDoc, "name" | "description" | "vars">>
  ): Promise<EnvironmentDoc | null> {
    return this.environments.updateEnvironment(id, updates);
  }

  async changeEnvironment(
    id: string,
    changes: VariableChange[],
    details?: Partial<Pick<EnvironmentDoc, "name" | "description">>
  ): Promise<EnvironmentDoc | null> {
    return this.environments.changeEnvironment(id, changes, details);
  }

  async duplicateEnvironment(id: string): Promise<EnvironmentDoc | null> {
    return this.environments.duplicateEnvironment(id);
  }

  async deleteEnvironment(id: string): Promise<void> {
    return this.environments.deleteEnvironment(id);
  }

  async reorderEnvironments(order: { id: string; order: number }[]): Promise<void> {
    return this.environments.reorderEnvironments(order);
  }

  async getGlobals(): Promise<Row[]> {
    return this.environments.getGlobals();
  }

  async changeGlobals(changes: VariableChange[]): Promise<Row[]> {
    return this.environments.changeGlobals(changes);
  }

  async getActiveEnvironmentId(): Promise<string | null> {
    return this.environments.getActiveEnvironmentId();
  }

  async setActiveEnvironment(id: string | null): Promise<void> {
    return this.environments.setActiveEnvironment(id);
  }

  // ── Secrets ──────────────────────────────────────────────────────────

  async writeCipher(params: {
    id: string;
    name: string;
    environmentId?: string;
    envelope: SecretEnvelope;
  }): Promise<void> {
    return this.secrets.writeCipher(params);
  }

  async replaceCipher(id: string, envelope: SecretEnvelope): Promise<boolean> {
    return this.secrets.replaceCipher(id, envelope);
  }

  async readCipher(id: string): Promise<SecretEnvelope | null> {
    return this.secrets.readCipher(id);
  }

  async readVault(): Promise<VaultRecord | null> {
    return this.secrets.readVault();
  }

  async writeVault(record: VaultRecord, replace: boolean): Promise<boolean> {
    return this.secrets.writeVault(record, replace);
  }

  async writeSecrets(docs: Pick<SecretDoc, "id" | "name" | "environmentId" | "envelope">[]): Promise<void> {
    return this.secrets.writeSecrets(docs);
  }

  async listSecrets(): Promise<SecretDoc[]> {
    return this.secrets.listAll();
  }

  async renameSecret(id: string, name: string): Promise<SecretDoc | null> {
    return this.secrets.renameSecret(id, name);
  }

  async deleteSecret(id: string): Promise<void> {
    return this.secrets.deleteSecret(id);
  }

  // ── Cross-cutting ────────────────────────────────────────────────────

  async readWorkspace(includeHistory: boolean): Promise<WorkspaceStores> {
    return this.workspace.readAll(includeHistory);
  }

  async restoreWorkspace(stores: WorkspaceStores): Promise<void> {
    return this.workspace.replaceAll(stores);
  }

  async resetDatabase(options: { untilReload?: boolean } = {}): Promise<void> {
    await this.core.resetDatabase(options);
    this.history.resetLocalState();
  }
}
