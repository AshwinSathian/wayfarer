// D1.5's bake-off: what every candidate shares, so that only the widget
// library differs between them. Prototype only: this folder is never merged.

export type Kind = "collection" | "folder" | "request";

export interface BakeNode {
  key: string;
  label: string;
  kind: Kind;
  method?: string;
  children?: BakeNode[];
}

/** A tree like the collections list: two collections, folders, requests. `size` adds folders of 20 requests, for timing. */
export function sample(size = 0): BakeNode[] {
  const request = (key: string, method: string, label: string): BakeNode => ({ key, label, kind: "request", method });
  const tree: BakeNode[] = [
    {
      key: "shop",
      label: "Shop API",
      kind: "collection",
      children: [
        {
          key: "users",
          label: "Users",
          kind: "folder",
          children: [request("list-users", "GET", "List users"), request("get-user", "GET", "Get user"), request("create-user", "POST", "Create user")],
        },
        { key: "orders", label: "Orders", kind: "folder", children: [request("list-orders", "GET", "List orders"), request("cancel-order", "DELETE", "Cancel order")] },
        request("health", "GET", "Health"),
      ],
    },
    { key: "billing", label: "Billing", kind: "collection", children: [request("invoices", "GET", "Invoices")] },
  ];
  if (size > 0) {
    const big: BakeNode = { key: "big", label: "Large", kind: "collection", children: [] };
    for (let f = 0; f < Math.ceil(size / 20); f++) {
      big.children?.push({
        key: `f${f}`,
        label: `Folder ${f}`,
        kind: "folder",
        children: Array.from({ length: 20 }, (_, r) => request(`f${f}-r${r}`, "GET", `Request ${f}.${r}`)),
      });
    }
    tree.push(big);
  }
  return tree;
}

/** The siblings of `key` and its parent, or null when no node has that key. */
export function locate(nodes: BakeNode[], key: string, parent: BakeNode | null = null): { siblings: BakeNode[]; parent: BakeNode | null } | null {
  for (const node of nodes) {
    if (node.key === key) return { siblings: nodes, parent };
    const found = node.children && locate(node.children, key, node);
    if (found) return found;
  }
  return null;
}

/** A copy of the tree with `key` moved `delta` places among its siblings; the same tree when it cannot move. */
export function moveBy(nodes: BakeNode[], key: string, delta: -1 | 1): BakeNode[] {
  const at = locate(nodes, key);
  if (!at) return nodes;
  const from = at.siblings.findIndex((node) => node.key === key);
  const to = from + delta;
  if (to < 0 || to >= at.siblings.length) return nodes;
  return replaceSiblings(nodes, at.parent?.key ?? null, swap(at.siblings, from, to));
}

/** A copy of the tree with `key` dropped before or after `target`, or null when the two have different parents. */
export function moveTo(nodes: BakeNode[], key: string, target: string, before: boolean): BakeNode[] | null {
  const from = locate(nodes, key);
  const to = locate(nodes, target);
  if (!from || !to || key === target || from.parent !== to.parent) return null;
  const order = from.siblings.filter((node) => node.key !== key);
  const moved = from.siblings.find((node) => node.key === key);
  if (!moved) return null;
  order.splice(order.findIndex((node) => node.key === target) + (before ? 0 : 1), 0, moved);
  return replaceSiblings(nodes, from.parent?.key ?? null, order);
}

function swap(list: BakeNode[], from: number, to: number): BakeNode[] {
  const copy = [...list];
  copy.splice(to, 0, ...copy.splice(from, 1));
  return copy;
}

function replaceSiblings(nodes: BakeNode[], parent: string | null, siblings: BakeNode[]): BakeNode[] {
  if (parent === null) return siblings;
  return nodes.map((node) =>
    node.key === parent ? { ...node, children: siblings } : node.children ? { ...node, children: replaceSiblings(node.children, parent, siblings) } : node
  );
}

/** What the context menu offers: it depends on what was clicked. */
export function menuItems(node: BakeNode): string[] {
  if (node.kind === "collection") return ["New request", "New folder", "Rename", "Delete"];
  if (node.kind === "folder") return ["New request", "Rename", "Duplicate", "Delete"];
  return ["Open in new tab", "Rename", "Duplicate", "Delete"];
}

export const ENVIRONMENTS = [
  { id: "dev", name: "Development" },
  { id: "staging", name: "Staging" },
  { id: "prod", name: "Production" },
] as const;

export const METHOD_SHORT: Readonly<Record<string, string>> = { DELETE: "DEL", OPTIONS: "OPT" };

/** How long the first render of the tree took, for the timing test. Written once, read by Playwright. */
export function markRendered(started: number): void {
  if (document.body.dataset["rendered"]) return;
  document.body.dataset["rendered"] = String(Math.round(performance.now() - started));
}

/** A copy of the tree with `key`'s siblings in the order of `keys` (what Material's tree hands back). */
export function setOrder(nodes: BakeNode[], key: string, keys: string[]): BakeNode[] {
  const at = locate(nodes, key);
  if (!at) return nodes;
  const byKey = new Map(at.siblings.map((node) => [node.key, node]));
  const order = keys.flatMap((k) => byKey.get(k) ?? []);
  return order.length === at.siblings.length ? replaceSiblings(nodes, at.parent?.key ?? null, order) : nodes;
}
