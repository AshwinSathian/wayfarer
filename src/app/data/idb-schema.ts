import { DBSchema } from "idb";
import {
  Collection,
  CollectionId,
  Folder,
  FolderId,
  RequestDoc,
  RequestDocId,
} from "../models/collections.models";
import { EnvironmentDoc, EnvironmentId } from "../models/environments.models";
import { PastRequest, PastRequestKey } from "../models/history.models";
import { SecretDoc, SecretId } from "../models/secrets.models";

/**
 * The IndexedDB schema shape shared by `IdbCoreService` and every
 * per-aggregate repository. Split out on its own so a repository that only
 * needs the type (e.g. `HistoryRepository` typing a cursor) doesn't have to
 * import the connection/migration logic that lives alongside it in
 * `idb-core.service.ts`/`idb-migrations.ts`.
 */

export type HistoryRecord = PastRequest & { id: PastRequestKey };

export type StoreName =
  | "history"
  | "collections"
  | "folders"
  | "requests"
  | "environments"
  | "secrets"
  | "meta";

export type StoreCollection = ArrayLike<StoreName>;

export const META_STATE_KEY = "state";

export interface MetaState {
  key: typeof META_STATE_KEY;
  schemaVersion: number;
  activeEnvironmentId?: EnvironmentId | null;
}

export interface ApiSandboxDB extends DBSchema {
  history: {
    key: PastRequestKey;
    value: HistoryRecord;
    indexes: {
      "by-createdAt": number;
      "by-url": string;
      "by-method": PastRequest["method"];
    };
  };
  collections: {
    key: CollectionId;
    value: Collection;
    indexes: {
      "by-order": number;
      "by-name": string;
    };
  };
  folders: {
    key: FolderId;
    value: Folder;
    indexes: {
      "by-collectionId": CollectionId;
      "by-parentFolderId": FolderId;
      "by-order": number;
    };
  };
  requests: {
    key: RequestDocId;
    value: RequestDoc;
    indexes: {
      "by-collectionId": CollectionId;
      "by-folderId": FolderId;
      "by-order": number;
    };
  };
  environments: {
    key: EnvironmentId;
    value: EnvironmentDoc;
    indexes: {
      "by-name": string;
      "by-order": number;
    };
  };
  secrets: {
    key: SecretId;
    value: SecretDoc;
    indexes: {
      "by-environmentId": EnvironmentId;
      "by-name": string;
    };
  };
  meta: {
    key: typeof META_STATE_KEY;
    value: MetaState;
  };
}

// Preserved historical identifier from the project's "API Sandbox" name — never
// shown to users, and renaming it would require a lossy copy-and-migrate of
// every existing user's local data for zero functional benefit. Left as-is
// intentionally; see docs/storage.md.
export const DB_NAME = "api-sandbox";
export const DB_VERSION = 4;
export const DEFAULT_SCHEMA_VERSION = 1;
