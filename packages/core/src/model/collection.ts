import type { ScriptTrust } from "../scripting/trust";
import type { AuthConfig, OwnAuth, RequestContent, Row, Scripts } from "./request";

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
  /** Which of this collection's scripts may run. A collection made here is trusted; an import is not until its scripts are reviewed (D6). */
  scriptTrust: ScriptTrust;
}

export interface Folder extends BaseDocument {
  collectionId: string;
  parentFolderId?: string;
  name: string;
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

/**
 * What a request inherits from, in the order it applies: the collection,
 * then its folders from the outside in. `name` says which it is, as a
 * person reads it: `collection "Shop"`, `folder "Admin"`.
 */
export type Ancestor = Pick<Collection | Folder, "name" | "variables" | "auth" | "scripts">;

export function ancestorsOf(collection: Collection, folders: Folder[], folderId: string | undefined): Ancestor[] {
  const named = (kind: string, { name, variables, auth, scripts }: Ancestor): Ancestor => ({ name: `${kind} "${name}"`, variables, auth, scripts });
  return [named("collection", collection), ...folderChain(folders, folderId).map((folder) => named("folder", folder))];
}
