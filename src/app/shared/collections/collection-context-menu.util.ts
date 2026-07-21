import { MenuItem, TreeNode } from "primeng/api";
import { CollectionNodeData } from "./collection-tree-nodes.util";

/** Names of the sidebar actions a context menu / keyboard shortcut / command palette entry can dispatch through `handleAction`. */
export type CollectionNodeAction = "new-folder" | "new-request" | "rename" | "duplicate" | "delete" | "export";

/**
 * Builds the right-click context menu for a collection/folder/request tree
 * node. Pure given the node and a dispatcher — the sidebar component still
 * owns what each action actually does (`handleAction`/`exportCollection`),
 * this just decides which actions are offered for which node type.
 */
export function buildContextItems(
  node: TreeNode<CollectionNodeData>,
  dispatch: (action: CollectionNodeAction, node: TreeNode<CollectionNodeData>) => void
): MenuItem[] {
  const data = node.data as CollectionNodeData;

  if (data.type === "collection") {
    return [
      { label: "New Folder", icon: "pi pi-folder", command: () => dispatch("new-folder", node) },
      { label: "New Request", icon: "pi pi-plus", command: () => dispatch("new-request", node) },
      { separator: true },
      { label: "Rename", icon: "pi pi-pencil", command: () => dispatch("rename", node) },
      { label: "Duplicate", icon: "pi pi-copy", command: () => dispatch("duplicate", node) },
      { label: "Export", icon: "pi pi-download", command: () => dispatch("export", node) },
      { label: "Delete", icon: "pi pi-trash", command: () => dispatch("delete", node) },
    ];
  }

  if (data.type === "folder") {
    return [
      { label: "New Request", icon: "pi pi-plus", command: () => dispatch("new-request", node) },
      { label: "Rename", icon: "pi pi-pencil", command: () => dispatch("rename", node) },
      { label: "Duplicate", icon: "pi pi-copy", command: () => dispatch("duplicate", node) },
      { label: "Delete", icon: "pi pi-trash", command: () => dispatch("delete", node) },
    ];
  }

  return [
    { label: "Rename", icon: "pi pi-pencil", command: () => dispatch("rename", node) },
    { label: "Duplicate", icon: "pi pi-copy", command: () => dispatch("duplicate", node) },
    { label: "Delete", icon: "pi pi-trash", command: () => dispatch("delete", node) },
  ];
}
