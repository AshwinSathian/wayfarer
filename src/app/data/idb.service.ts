import { Injectable, inject } from "@angular/core";
import {
  Collection,
  CollectionExport,
  CollectionId,
  Folder,
  FolderId,
  RequestDoc,
  RequestDocId,
} from "../models/collections.models";
import { EnvironmentDoc, EnvironmentId } from "../models/environments.models";
import { PastRequest, PastRequestKey } from "../models/history.models";
import { SecretEnvelope, SecretId } from "../models/secrets.models";
import { IdbCoreService } from "./idb-core.service";
import { HistoryRepository } from "./history.repository";
import { CollectionsRepository } from "./collections.repository";
import { FoldersRepository } from "./folders.repository";
import { CollectionRequestsRepository } from "./collection-requests.repository";
import { EnvironmentsRepository } from "./environments.repository";
import { SecretsRepository } from "./secrets.repository";

/**
 * Public facade over the IndexedDB persistence layer. Every existing
 * consumer (AppComponent, CollectionsService, EnvironmentsService,
 * SecretsService, ApiParamsComponent, AppShellComponent) keeps injecting
 * this exact class with this exact API — the actual storage/schema/
 * migration logic and each aggregate's CRUD now live in IdbCoreService and
 * the *.repository.ts files (collections/folders/requests were originally
 * one CollectionsRepository; split into three once that file crossed ~540
 * lines), independently testable without going through this facade. See
 * docs/plans/plan-specimen-modernization.md Part B2 for why this used to be
 * a single 1,300+ line god object.
 */
@Injectable({
  providedIn: "root",
})
export class IdbService {
  private readonly core = inject(IdbCoreService);
  private readonly history = inject(HistoryRepository);
  private readonly collections = inject(CollectionsRepository);
  private readonly folders = inject(FoldersRepository);
  private readonly collectionRequests = inject(CollectionRequestsRepository);
  private readonly environments = inject(EnvironmentsRepository);
  private readonly secrets = inject(SecretsRepository);

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

  async createRequest(payload: {
    collectionId: CollectionId;
    folderId?: FolderId;
    name: string;
    method: PastRequest["method"];
    url: string;
    headers?: Record<string, string>;
    body?: unknown;
    order?: number;
  }): Promise<RequestDoc> {
    return this.collectionRequests.createRequest(payload);
  }

  async renameRequest(id: RequestDocId, name: string): Promise<RequestDoc | null> {
    return this.collectionRequests.renameRequest(id, name);
  }

  async updateRequest(
    id: RequestDocId,
    patch: Partial<
      Pick<
        RequestDoc,
        | "name"
        | "folderId"
        | "method"
        | "url"
        | "params"
        | "headers"
        | "body"
        | "vars"
        | "auth"
        | "preRequestScript"
        | "postRequestScript"
        | "tests"
      >
    >
  ): Promise<RequestDoc | null> {
    return this.collectionRequests.updateRequest(id, patch);
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
    vars?: Record<string, string>;
  }): Promise<EnvironmentDoc> {
    return this.environments.createEnvironment(payload);
  }

  async updateEnvironment(
    id: EnvironmentId,
    updates: Partial<Pick<EnvironmentDoc, "name" | "description" | "vars">>
  ): Promise<EnvironmentDoc | null> {
    return this.environments.updateEnvironment(id, updates);
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

  // ── Cross-cutting ────────────────────────────────────────────────────

  async resetDatabase(): Promise<void> {
    await this.core.resetDatabase();
    this.history.resetLocalState();
  }
}
