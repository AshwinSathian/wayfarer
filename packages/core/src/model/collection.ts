import type { ScriptTrust } from "../scripting/trust";
import type { AuthConfig, OwnAuth, RequestContent, Route, Row, Scripts } from "./request";

export interface Meta {
  id: string;
  createdAt: number;
  updatedAt: number;
  version: 1;
}

interface BaseDocument {
  id: string;
  meta: Meta;
}

export interface Collection extends BaseDocument {
  name: string;
  description?: string;
  order: number;
  /** Variables every request of the collection can use. A folder's and an environment's variable of the same name win. */
  variables: Row[];
  /** What a request or a folder set to inherit is sent with. A collection has nothing above it to inherit from. */
  auth: OwnAuth;
  /** Run for every request of the collection, before the folders' and the request's own. */
  scripts: Scripts;
  /** How its requests are sent when a request names no route of its own (P6.4). Absent: the device's. */
  route?: Route;
  /** Which of this collection's scripts may run. A collection made here is trusted; an import is not until its scripts are reviewed (D6). */
  scriptTrust: ScriptTrust;
}

export interface Folder extends BaseDocument {
  collectionId: string;
  parentFolderId?: string;
  name: string;
  /** Kept from a file that had one, and written back to it. The app does not show it yet. */
  description?: string;
  order: number;
  /** Variables the requests in this folder can use. They win over the collection's and lose to the environment's. */
  variables: Row[];
  auth: AuthConfig;
  /** Run for every request in the folder, after the collection's and before the request's own. */
  scripts: Scripts;
}

export interface RequestDoc extends BaseDocument, RequestContent {
  collectionId: string;
  folderId?: string;
  name: string;
  /** As a folder's. */
  description?: string;
  order: number;
}

export const COLLECTION_FORMAT = "wayfarer/collection/3";

/** A collection file. Trust is not content: the file leaves it out and an import starts untrusted. */
export interface CollectionExport {
  $id: typeof COLLECTION_FORMAT;
  meta: Meta;
  collection: Omit<Collection, "scriptTrust">;
  folders: Folder[];
  requests: RequestDoc[];
}

/**
 * The folders a request (or a folder) is in, outermost first, the one named
 * last. A file may name folders as each other's parents: a folder is taken
 * once.
 */
export function folderChain(folders: Folder[], folderId: string | undefined): Folder[] {
  const chain: Folder[] = [];
  let next = folderId;
  while (next !== undefined) {
    const id: string = next;
    const folder = folders.find((entry) => entry.meta.id === id);
    if (!folder || chain.includes(folder)) break;
    chain.unshift(folder);
    next = folder.parentFolderId;
  }
  return chain;
}

/** A folder or a request, as its parent lists it. */
type TreeChild<F, R> = { folder: F; request?: undefined } | { request: R; folder?: undefined };

/**
 * What a folder holds, or with no `parent` what stands at the top of the
 * collection: its folders and its requests as one list, by the one `order`
 * they share, as a Postman file has its items. Two of one number: a folder
 * before a request, then by id.
 */
export function childrenInOrder<F extends Pick<Folder, "id" | "order" | "parentFolderId">, R extends Pick<RequestDoc, "id" | "order" | "folderId">>(tree: { folders: readonly F[]; requests: readonly R[] }, parent?: string): TreeChild<F, R>[] {
  const entries = [
    ...tree.folders.filter((folder) => folder.parentFolderId === parent).map((folder) => ({ order: folder.order, kind: 0, id: folder.id, child: { folder } as TreeChild<F, R> })),
    ...tree.requests.filter((request) => request.folderId === parent).map((request) => ({ order: request.order, kind: 1, id: request.id, child: { request } as TreeChild<F, R> })),
  ];
  return entries.sort((a, b) => a.order - b.order || a.kind - b.kind || a.id.localeCompare(b.id)).map((entry) => entry.child);
}

/**
 * What a request inherits from, in the order it applies: the collection,
 * then its folders from the outside in. `name` says which it is, as a
 * person reads it: `collection "Shop"`, `folder "Admin"`.
 */
export type Ancestor = Pick<Collection | Folder, "name" | "variables" | "auth" | "scripts">;

export function ancestorsOf(collection: Ancestor, folders: Folder[], folderId: string | undefined): Ancestor[] {
  const named = (kind: string, { name, variables, auth, scripts }: Ancestor): Ancestor => ({ name: `${kind} "${name}"`, variables, auth, scripts });
  return [named("collection", collection), ...folderChain(folders, folderId).map((folder) => named("folder", folder))];
}

/** A collection with what is in it, as the app holds it in memory. */
export interface CollectionTree {
  collection: Collection;
  folders: Folder[];
  requests: RequestDoc[];
}

export interface EnvironmentDoc {
  id: string;
  meta: Meta;
  name: string;
  description?: string;
  /** Ordered. A later enabled row wins over an earlier one of the same name. */
  vars: Row[];
  order: number;
}

export const ENVIRONMENTS_FORMAT = "wayfarer/environments/2";
