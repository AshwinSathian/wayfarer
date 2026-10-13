import { DBSchema } from "idb";
import type { Cookie, RequestContent, Row, VaultRecord } from "@wayfarer/core";
import {
  Collection,
  CollectionId,
  Folder,
  FolderId,
  RequestDoc,
  RequestDocId,
} from "../models/collections";
import { EnvironmentDoc, EnvironmentId } from "../models/environments";
import { PastRequest, PastRequestKey } from "../models/history";
import { SecretDoc, SecretId } from "../models/secrets";

/**
 * The IndexedDB schema shape shared by `IdbCore` and every
 * per-aggregate repository. Split out on its own so a repository that only
 * needs the type (e.g. `HistoryRepository` typing a cursor) doesn't have to
 * import the connection/migration logic that lives alongside it in
 * `idb-core.ts`/`idb-migrations.ts`.
 */

export type HistoryRecord = PastRequest & { id: PastRequestKey };

export type StoreName =
  | "history"
  | "collections"
  | "folders"
  | "requests"
  | "environments"
  | "secrets"
  | "files"
  | "tabs"
  | "cookies"
  | "meta";

export type StoreCollection = ArrayLike<StoreName>;

/**
 * A file as it is stored: its bytes and its type, not a `Blob`. With a
 * `Blob` in the store, saving a request failed in WebKit (the e2e test
 * "multipart: … also after the request is saved" in Playwright's WebKit,
 * whose contexts are private windows). Bytes are stored by all three engines.
 */
export interface StoredFile {
  bytes: ArrayBuffer;
  type: string;
}

/**
 * A tab of the composer as it is stored (P5.1): what a saved request holds,
 * so a typed credential is text and a vault secret is its reference. No
 * response is here: `historyKey` names the history entry that has it, masked.
 */
export interface StoredTab {
  id: string;
  /** Its place in the strip. */
  order: number;
  draft: RequestContent;
  /** The draft as it was when the tab was opened, loaded or saved, as JSON: a tab whose draft differs is unsaved. */
  baseline: string;
  /** The saved request the tab is bound to. */
  requestId?: RequestDocId;
  /** The history entry of the tab's last send, or the one it was opened from. */
  historyKey?: PastRequestKey;
  /** The SHA-256 of each script of the draft that was allowed to run when the tab was stored (plan D6). */
  scripts: string[];
}

/**
 * A cookie of the app's jar as it is stored (P5.3): the cookie, with its
 * value as the server sent it, under its name, domain and path. A cookie
 * whose value holds a vault secret is never written here.
 */
export type StoredCookie = Cookie & { key: string };

export const META_STATE_KEY = "state";
export const META_GLOBALS_KEY = "globals";
export const META_VAULT_KEY = "vault";

export interface MetaState {
  key: typeof META_STATE_KEY;
  schemaVersion: number;
  activeEnvironmentId?: EnvironmentId | null;
}

/** The global variables: one record, so a change to them is one read and one write in one transaction. */
export interface GlobalsRecord {
  key: typeof META_GLOBALS_KEY;
  variables: Row[];
}

/** The vault: how its passphrase key is derived, and the data key wrapped under it. Absent until a passphrase is chosen. */
export type VaultRecordDoc = VaultRecord & { key: typeof META_VAULT_KEY };

/** What an upgrade removed, for the notice the shell shows once: "all", or the stores it emptied that held something. */
export type RemovedData = "all" | ("secrets" | "history" | "collections")[];

export interface ApiSandboxDB extends DBSchema {
  history: {
    key: PastRequestKey;
    value: HistoryRecord;
    indexes: {
      "by-createdAt": number;
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
  /** The files of multipart and binary bodies, by the id a body refers to them with. */
  files: {
    key: string;
    value: StoredFile;
  };
  /** The composer's tabs, by the tab's id. */
  tabs: {
    key: string;
    value: StoredTab;
  };
  /** The cookie jar, by `domain|path|name`. */
  cookies: {
    key: string;
    value: StoredCookie;
  };
  meta: {
    key: typeof META_STATE_KEY | typeof META_GLOBALS_KEY | typeof META_VAULT_KEY;
    value: MetaState | GlobalsRecord | VaultRecordDoc;
  };
}

// The project's first name, "API Sandbox". Never shown to users; see docs/storage.md.
export const DB_NAME = "api-sandbox";
export const DB_VERSION = 13;
export const DEFAULT_SCHEMA_VERSION = 1;
