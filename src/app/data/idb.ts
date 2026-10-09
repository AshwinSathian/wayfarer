import { Injectable, inject } from "@angular/core";
import type { Row, VariableChange } from "@wayfarer/core";
import {
  Collection,
  CollectionExport,
  CollectionId,
  Folder,
  FolderId,
  NewRequest,
  RequestDoc,
  RequestDocId,
  RequestPatch,
} from "../models/collections";
import { EnvironmentDoc, EnvironmentId } from "../models/environments";
import { PastRequest, PastRequestKey } from "../models/history";
import { SecretDoc, SecretEnvelope, SecretId } from "../models/secrets";
import { IdbCore } from "./idb-core";
import { HistoryRepository } from "./history-repository";
import { CollectionsRepository } from "./collections-repository";
import { FoldersRepository } from "./folders-repository";
import { CollectionRequestsRepository } from "./collection-requests-repository";
import { EnvironmentsRepository } from "./environments-repository";
import { SecretsRepository } from "./secrets-repository";

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

  async add(req: PastRequest): Promise<PastRequestKey | null> {
    return this.history.add(req);
  }

  async get(id: PastRequestKey): Promise<PastRequest | null> {
    return this.history.get(id);
  }

  async getLatest(limit = 50): Promise<PastRequest[]> {
    return this.history.getLatest(limit);
  }

  async findByUrl(url: string, limit = 20): Promise<PastRequest[]> {
    return this.history.findByUrl(url, limit);
  }

  async delete(id: PastRequestKey): Promise<void> {
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
    id: CollectionId,
    updates: { name?: string; description?: string }
  ): Promise<Collection | null> {
    return this.collections.renameCollection(id, updates);
  }

  async duplicateCollection(id: CollectionId): Promise<Collection | null> {
    return this.collections.duplicateCollection(id);
  }

  async deleteCollection(id: CollectionId): Promise<void> {
    return this.collections.deleteCollection(id);
  }

  async reorderCollections(order: { id: CollectionId; order: number }[]): Promise<void> {
    return this.collections.reorderCollections(order);
  }

  async getCollectionExport(id: CollectionId): Promise<CollectionExport | null> {
    return this.collections.getCollectionExport(id);
  }

  async importCollectionExport(
    payload: CollectionExport,
    options?: { duplicateAsNew?: boolean }
  ): Promise<Collection | null> {
    return this.collections.importCollectionExport(payload, options);
  }

  async listFolders(collectionId: CollectionId): Promise<Folder[]> {
    return this.folders.listFolders(collectionId);
  }

  async createFolder(payload: {
    collectionId: CollectionId;
    name: string;
    parentFolderId?: FolderId;
    order?: number;
  }): Promise<Folder> {
    return this.folders.createFolder(payload);
  }

  async renameFolder(id: FolderId, name: string): Promise<Folder | null> {
    return this.folders.renameFolder(id, name);
  }

  async duplicateFolder(id: FolderId): Promise<Folder | null> {
    return this.folders.duplicateFolder(id);
  }

  async deleteFolder(id: FolderId): Promise<void> {
    return this.folders.deleteFolder(id);
  }

  async reorderFolders(order: { id: FolderId; order: number }[]): Promise<void> {
    return this.folders.reorderFolders(order);
  }

  async listRequests(collectionId: CollectionId): Promise<RequestDoc[]> {
    return this.collectionRequests.listRequests(collectionId);
  }

  async createRequest(payload: NewRequest, files?: ReadonlyMap<string, Blob>): Promise<RequestDoc> {
    return this.collectionRequests.createRequest(payload, files);
  }

  async renameRequest(id: RequestDocId, name: string): Promise<RequestDoc | null> {
    return this.collectionRequests.renameRequest(id, name);
  }

  async updateRequest(id: RequestDocId, patch: RequestPatch, files?: ReadonlyMap<string, Blob>): Promise<RequestDoc | null> {
    return this.collectionRequests.updateRequest(id, patch, files);
  }

  async readFile(id: string): Promise<Blob | undefined> {
    return this.collectionRequests.readFile(id);
  }

  async duplicateRequest(id: RequestDocId): Promise<RequestDoc | null> {
    return this.collectionRequests.duplicateRequest(id);
  }

  async deleteRequest(id: RequestDocId): Promise<void> {
    return this.collectionRequests.deleteRequest(id);
  }

  async reorderRequests(order: { id: RequestDocId; order: number }[]): Promise<void> {
    return this.collectionRequests.reorderRequests(order);
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
    id: EnvironmentId,
    updates: Partial<Pick<EnvironmentDoc, "name" | "description" | "vars">>
  ): Promise<EnvironmentDoc | null> {
    return this.environments.updateEnvironment(id, updates);
  }

  async changeEnvironment(
    id: EnvironmentId,
    changes: VariableChange[],
    details?: Partial<Pick<EnvironmentDoc, "name" | "description">>
  ): Promise<EnvironmentDoc | null> {
    return this.environments.changeEnvironment(id, changes, details);
  }

  async duplicateEnvironment(id: EnvironmentId): Promise<EnvironmentDoc | null> {
    return this.environments.duplicateEnvironment(id);
  }

  async deleteEnvironment(id: EnvironmentId): Promise<void> {
    return this.environments.deleteEnvironment(id);
  }

  async reorderEnvironments(order: { id: EnvironmentId; order: number }[]): Promise<void> {
    return this.environments.reorderEnvironments(order);
  }

  async getActiveEnvironmentId(): Promise<EnvironmentId | null> {
    return this.environments.getActiveEnvironmentId();
  }

  async setActiveEnvironment(id: EnvironmentId | null): Promise<void> {
    return this.environments.setActiveEnvironment(id);
  }

  // ── Secrets ──────────────────────────────────────────────────────────

  async writeCipher(params: {
    id: SecretId;
    name: string;
    environmentId?: EnvironmentId;
    envelope: SecretEnvelope;
  }): Promise<void> {
    return this.secrets.writeCipher(params);
  }

  async readCipher(id: SecretId): Promise<SecretEnvelope | null> {
    return this.secrets.readCipher(id);
  }

  async peekSecretEnvelope(): Promise<SecretEnvelope | null> {
    return this.secrets.peekSecretEnvelope();
  }

  async listSecrets(): Promise<SecretDoc[]> {
    return this.secrets.listAll();
  }

  async renameSecret(id: SecretId, name: string): Promise<SecretDoc | null> {
    return this.secrets.renameSecret(id, name);
  }

  async deleteSecret(id: SecretId): Promise<void> {
    return this.secrets.deleteSecret(id);
  }

  // ── Cross-cutting ────────────────────────────────────────────────────

  async resetDatabase(): Promise<void> {
    await this.core.resetDatabase();
    this.history.resetLocalState();
  }
}
