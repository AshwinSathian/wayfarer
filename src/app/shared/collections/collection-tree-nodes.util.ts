import { TreeNode } from "primeng/api";
import { Collection, Folder, RequestDoc } from "../../models/collections.models";
import { CollectionTree } from "../../services/collections.service";

/** Discriminated union backing every PrimeNG `TreeNode.data` in the collections sidebar. */
export type CollectionNodeData =
  | { type: "collection"; ref: Collection }
  | { type: "folder"; ref: Folder }
  | { type: "request"; ref: RequestDoc };

/** Pure conversion from the collections service's tree shape to PrimeNG `p-tree` nodes. */
export function collectionsToNodes(trees: CollectionTree[]): TreeNode<CollectionNodeData>[] {
  return trees.map((entry) => toCollectionNode(entry));
}

function toCollectionNode(entry: CollectionTree): TreeNode<CollectionNodeData> {
  return {
    key: `collection:${entry.collection.meta.id}`,
    label: entry.collection.name,
    data: { type: "collection", ref: entry.collection },
    expanded: true,
    children: [
      ...entry.folders.map((folder) => toFolderNode(folder, entry)),
      ...entry.requests.filter((req) => !req.folderId).map((req) => toRequestNode(req)),
    ],
  };
}

function toFolderNode(folder: Folder, entry: CollectionTree): TreeNode<CollectionNodeData> {
  const children = entry.requests
    .filter((req) => req.folderId === folder.meta.id)
    .map((req) => toRequestNode(req));
  return {
    key: `folder:${folder.meta.id}`,
    label: folder.name,
    data: { type: "folder", ref: folder },
    children,
  };
}

function toRequestNode(req: RequestDoc): TreeNode<CollectionNodeData> {
  return {
    key: `request:${req.meta.id}`,
    label: req.name || req.url || req.method,
    data: { type: "request", ref: req },
    leaf: true,
  };
}

export function isCollectionRef(ref: Collection | Folder | RequestDoc): ref is Collection {
  return !("collectionId" in ref) && !("method" in ref);
}

export function isFolderRef(ref: Collection | Folder | RequestDoc): ref is Folder {
  return "collectionId" in ref && !("method" in ref);
}

export function isRequestRef(ref: Collection | Folder | RequestDoc): ref is RequestDoc {
  return "method" in ref;
}
