import { ComponentFixture, TestBed } from "@angular/core/testing";
import { inCollection, inFolder, requestContent } from "../../../testing/request-fixtures";
import { signal } from "@angular/core";
import { CollectionsSidebar } from "./collections-sidebar";
import { UndoNotice } from "../../services/undo-notice";
import type { Removed } from "../../data/removed";
import { CollectionsStore, CollectionTree } from "../../services/collections-store";
import { Collection, Folder, Meta, RequestDoc } from "../../models/collections";
import { describe, it, beforeEach, expect } from "vitest";

function meta(id: string): Meta {
  return { id, createdAt: 1, updatedAt: 1 };
}

function makeCollection(id: string, name = `Collection ${id}`, order = 0): Collection {
  return { id, meta: meta(id), name, order, variables: [], ...inCollection, scriptTrust: { trusted: true } };
}

function makeFolder(id: string, collectionId: string, order = 0, parentFolderId?: string): Folder {
  return {
    id,
    meta: meta(id),
    collectionId,
    ...(parentFolderId && { parentFolderId }),
    name: `Folder ${id}`,
    order,
    ...inFolder,
  };
}

function makeRequest(id: string, collectionId: string, folderId?: string, order = 0): RequestDoc {
  return {
    id,
    meta: meta(id),
    collectionId,
    folderId,
    name: `Request ${id}`,
    order,
    ...requestContent({ url: "https://example.com" }),
  };
}

class CollectionsServiceStub {
  private readonly treeState = signal<CollectionTree[]>([]);
  readonly tree = this.treeState.asReadonly();
  readonly loading = signal(false);

  readonly createCollectionCalls: unknown[] = [];
  readonly deleteCollectionCalls: string[] = [];
  readonly deleteFolderCalls: string[] = [];
  readonly deleteRequestCalls: string[] = [];
  readonly duplicateCollectionCalls: string[] = [];

  setTree(tree: CollectionTree[]): void {
    this.treeState.set(tree);
  }

  async ensureLoaded(): Promise<void> {
    // no-op — tree is set directly via setTree() in tests
  }

  async createCollection(payload: { name: string }): Promise<Collection> {
    this.createCollectionCalls.push(payload);
    return makeCollection("new-col", payload.name);
  }

  async deleteCollection(id: string): Promise<Removed> {
    this.deleteCollectionCalls.push(id);
    return { collections: [], folders: [], requests: [], files: [] };
  }

  async duplicateCollection(id: string): Promise<Collection | null> {
    this.duplicateCollectionCalls.push(id);
    return null;
  }

  async deleteFolder(id: string): Promise<Removed> {
    this.deleteFolderCalls.push(id);
    return { collections: [], folders: [], requests: [], files: [] };
  }

  async deleteRequest(id: string): Promise<Removed> {
    this.deleteRequestCalls.push(id);
    return { ...{ collections: [], folders: [], requests: [], files: [] }, requests: [makeRequest(id, "c1")] };
  }

  readonly restoreCalls: Removed[] = [];
  async restore(removed: Removed): Promise<void> {
    this.restoreCalls.push(removed);
  }

  async exportCollectionJson(): Promise<string | null> {
    return null;
  }

  readonly reorderCalls: { kind: string; order: { id: string; order: number }[] }[] = [];
  readonly renameCalls: { id: string; name: string }[] = [];

  async reorderCollections(order: { id: string; order: number }[]): Promise<void> {
    this.reorderCalls.push({ kind: "collections", order });
  }

  async reorderChildren(order: { id: string; order: number }[]): Promise<void> {
    this.reorderCalls.push({ kind: "children", order });
  }

  async renameRequest(id: string, name: string): Promise<null> {
    this.renameCalls.push({ id, name });
    return null;
  }
}

describe("CollectionsSidebar", () => {
  let component: CollectionsSidebar;
  let fixture: ComponentFixture<CollectionsSidebar>;
  let collectionsService: CollectionsServiceStub;

  beforeEach(async () => {
    collectionsService = new CollectionsServiceStub();

    await TestBed.configureTestingModule({
      imports: [CollectionsSidebar],
      providers: [{ provide: CollectionsStore, useValue: collectionsService }],
    }).compileComponents();

    fixture = TestBed.createComponent(CollectionsSidebar);
    component = fixture.componentInstance;
  });

  describe("tree construction", () => {
    it("converts a CollectionTree into nested tree nodes, folders and unfoldered requests as children", () => {
      const collection = makeCollection("c1");
      const folder = makeFolder("f1", "c1");
      const rootRequest = makeRequest("r1", "c1");
      const folderedRequest = makeRequest("r2", "c1", "f1");

      collectionsService.setTree([{ collection, folders: [folder], requests: [rootRequest, folderedRequest] }]);

      const nodes = component.nodes();
      expect(nodes.length).toBe(1);
      expect(nodes[0].key).toBe("collection:c1");
      expect(nodes[0].children?.length).toBe(2); // 1 folder + 1 root-level request

      const folderNode = nodes[0].children?.find((n) => n.key === "folder:f1");
      expect(folderNode?.children?.length).toBe(1);
      expect(folderNode?.children?.[0].key).toBe("request:r2");

      const requestNode = nodes[0].children?.find((n) => n.key === "request:r1");
      expect(requestNode?.children).toBeUndefined();
    });

    it("a parent's folders and requests are one list in their one order, a folder inside its folder", () => {
      collectionsService.setTree([
        {
          collection: makeCollection("c1"),
          folders: [makeFolder("f2", "c1", 4), makeFolder("f1", "c1", 2), makeFolder("deep", "c1", 2, "f1")],
          requests: [
            makeRequest("r3", "c1", undefined, 3),
            makeRequest("r1", "c1", undefined, 1),
            makeRequest("in-b", "c1", "f1", 3),
            makeRequest("in-a", "c1", "f1", 1),
            makeRequest("deepest", "c1", "deep", 1),
          ],
        },
      ]);

      const keys = (nodes: ReturnType<typeof component.nodes>): unknown[] =>
        nodes.map((node) => (node.children ? [node.key, keys(node.children)] : node.key));
      expect(keys(component.nodes()[0].children!)).toEqual([
        "request:r1",
        ["folder:f1", ["request:in-a", ["folder:deep", ["request:deepest"]], "request:in-b"]],
        "request:r3",
        ["folder:f2", []],
      ]);
    });

    it("a folder whose parent is not there, and folders that name each other, are at the top: none is hidden", () => {
      collectionsService.setTree([
        {
          collection: makeCollection("c1"),
          folders: [makeFolder("lost", "c1", 1, "gone"), makeFolder("a", "c1", 2, "b"), makeFolder("b", "c1", 3, "a")],
          requests: [makeRequest("r1", "c1")],
        },
      ]);

      const [collection] = component.nodes();
      expect(collection.children!.map((node) => node.key)).toEqual(["request:r1", "folder:lost", "folder:a"]);
      expect(collection.children![2].children!.map((node) => node.key)).toEqual(["folder:b"]);
      expect(collection.children![2].children![0].children).toEqual([]);
    });
  });

  describe("the rendered tree", () => {
    const rows = () =>
      Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('[role="treeitem"]'));
    // A request's row is named as it reads, its method first: found here by what it is called.
    const row = (name: string) =>
      rows().find((r) => r.getAttribute("aria-label")?.replace(/^(GET|POST|PUT|PATCH|DEL|HEAD|OPT) /, "") === name)!;

    beforeEach(async () => {
      document.body.append(fixture.nativeElement);
      collectionsService.setTree([
        {
          collection: makeCollection("c1"),
          folders: [makeFolder("f1", "c1", 1), makeFolder("f2", "c1", 2)],
          requests: [
            makeRequest("r1", "c1", undefined, 3),
            makeRequest("r2", "c1", undefined, 4),
            makeRequest("r3", "c1", "f1"),
          ],
        },
        { collection: makeCollection("c2"), folders: [], requests: [] },
      ]);
      await fixture.whenStable();
    });

    it("lists collections expanded and folders collapsed, a collection's folders and requests in their one order", () => {
      expect(rows().map((r) => `${r.getAttribute("aria-level")} ${r.getAttribute("aria-label")}`)).toEqual([
        "1 Collection c1",
        "2 Folder f1",
        "2 Folder f2",
        "2 GET Request r1",
        "2 GET Request r2",
        "1 Collection c2",
      ]);
      expect(row("Folder f1").getAttribute("aria-expanded")).toBe("false");
    });

    it("saves a new order for what moved: the collections, or a parent's folders and requests together", async () => {
      const [c1, c2] = component.nodes();
      const [f1, f2, r1, r2] = c1.children!;

      await component.handleReorder({ node: c2, siblings: [c2, c1] });
      await component.handleReorder({ node: r2, siblings: [r2, f1, f2, r1] });

      expect(collectionsService.reorderCalls).toEqual([
        {
          kind: "collections",
          order: [
            { id: "c2", order: 1 },
            { id: "c1", order: 2 },
          ],
        },
        {
          kind: "children",
          order: [
            { id: "r2", order: 1 },
            { id: "f1", order: 2 },
            { id: "f2", order: 3 },
            { id: "r1", order: 4 },
          ],
        },
      ]);
    });

    it("Alt+ArrowUp on a request moves it among the folders and requests around it: the first request goes above the folder before it", async () => {
      row("Request r1").focus();
      row("Request r1").dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowUp", altKey: true, bubbles: true, cancelable: true }),
      );
      await fixture.whenStable();

      expect(collectionsService.reorderCalls).toEqual([
        {
          kind: "children",
          order: [
            { id: "f1", order: 1 },
            { id: "r1", order: 2 },
            { id: "f2", order: 3 },
            { id: "r2", order: 4 },
          ],
        },
      ]);
    });

    it("a single-key shortcut pressed on a row reaches the panel: the tree's own keys do not swallow it", async () => {
      row("Collection c1").focus();
      row("Collection c1").dispatchEvent(new KeyboardEvent("keydown", { key: "c", bubbles: true, cancelable: true }));
      await fixture.whenStable();

      expect(component.creationDialogVisible()).toBe(true);
    });

    it("a collection is not moved among another collection's rows, nor a row out of its folder", () => {
      const [c1, c2] = component.nodes();
      expect(component.nodeKind(c1)).toBe(component.nodeKind(c2));
      expect(component.nodeKind(c1.children![0])).toBe(component.nodeKind(c1.children![2]));
      expect(component.nodeKind(c1)).not.toBe(component.nodeKind(c1.children![0]));
    });

    it("F2 starts an inline rename with the name selected; Enter saves it and focus goes back to the row", async () => {
      const settle = async () => {
        await fixture.whenStable();
        await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
        await fixture.whenStable();
      };
      row("Request r1").focus();
      row("Request r1").dispatchEvent(new KeyboardEvent("keydown", { key: "F2", bubbles: true, cancelable: true }));
      await settle();

      const field = row("Request r1").querySelector("input")!;
      expect(document.activeElement).toBe(field);
      expect(field.value).toBe("Request r1");
      expect([field.selectionStart, field.selectionEnd]).toEqual([0, "Request r1".length]);

      field.value = "Renamed";
      field.dispatchEvent(new Event("input"));
      const enter = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
      field.dispatchEvent(enter);
      await settle();

      expect(collectionsService.renameCalls).toEqual([{ id: "r1", name: "Renamed" }]);
      expect(row("Request r1").querySelector("input")).toBeNull();
      expect(document.activeElement).toBe(row("Request r1"));
    });

    it("Escape leaves the rename without saving and does not reach a drawer around the tree", async () => {
      component.beginRename(component.nodes()[0].children![2]);
      await fixture.whenStable();
      const field = row("Request r1").querySelector("input")!;

      const escape = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
      field.dispatchEvent(escape);
      await fixture.whenStable();

      expect(escape.defaultPrevented).toBe(true);
      expect(collectionsService.renameCalls).toEqual([]);
      expect(row("Request r1").querySelector("input")).toBeNull();
    });
  });

  describe("context menu", () => {
    it("offers New Folder/New Request/Export among a collection node's actions", () => {
      const collection = makeCollection("c1");
      collectionsService.setTree([{ collection, folders: [], requests: [] }]);
      const node = component.nodes()[0];

      component.handleNodeSelect(node);

      const labels = component.contextItems().map((item) => ("label" in item ? item.label : undefined));
      expect(labels).toContain("New folder");
      expect(labels).toContain("New request");
      expect(labels).toContain("Export…");
      expect(labels).toContain("Delete");
    });

    it("offers only Rename/Duplicate/Delete for a request node (no New Folder/Export)", () => {
      const collection = makeCollection("c1");
      const request = makeRequest("r1", "c1");
      collectionsService.setTree([{ collection, folders: [], requests: [request] }]);
      const requestNode = component.nodes()[0].children?.[0];
      expect(requestNode).toBeDefined();

      component.handleNodeSelect(requestNode!);

      const labels = component.contextItems().map((item) => ("label" in item ? item.label : undefined));
      expect(labels).toEqual(["Rename", "Duplicate", "Delete"]);
    });
  });

  describe("handleAction dispatch", () => {
    it("deletes at once and offers Undo, which puts back what went (U-080, U-056)", async () => {
      const collection = makeCollection("c1");
      const request = makeRequest("r1", "c1");
      collectionsService.setTree([{ collection, folders: [], requests: [request] }]);
      const undo = TestBed.inject(UndoNotice);

      await component.handleAction("delete", component.nodes()[0].children![0]);

      expect(collectionsService.deleteRequestCalls).toEqual(["r1"]);
      expect(undo.current()?.message).toBe(`Deleted ${request.name}.`);
      await undo.undo();
      expect(collectionsService.restoreCalls.map((removed) => removed.requests.map((r) => r.meta.id))).toEqual([
        ["r1"],
      ]);
      expect(undo.current()).toBeNull();
    });

    it("the line after a folder is deleted says how many folders and requests went with it", async () => {
      const collection = makeCollection("c1");
      const requests = [
        makeRequest("r1", "c1", "f1", 1),
        makeRequest("r2", "c1", "f2", 1),
        makeRequest("r3", "c1", undefined, 3),
      ];
      collectionsService.setTree([
        {
          collection,
          folders: [makeFolder("f1", "c1", 1), makeFolder("f2", "c1", 2, "f1"), makeFolder("f3", "c1", 2)],
          requests,
        },
      ]);
      const folderNode = component.nodes()[0].children!.find((node) => node.key === "folder:f1");

      await component.handleAction("delete", folderNode!);

      expect(TestBed.inject(UndoNotice).current()?.message).toBe(
        "Deleted Folder f1. The 1 folder and 2 requests in it went with it.",
      );
      expect(collectionsService.deleteFolderCalls).toEqual(["f1"]);
    });

    it("creates a folder under the collection when dispatched 'new-folder' on a collection node", async () => {
      const collection = makeCollection("c1");
      collectionsService.setTree([{ collection, folders: [], requests: [] }]);
      const node = component.nodes()[0];

      await component.handleAction("new-folder", node);

      expect(component.creationDialogVisible()).toBe(true);
      expect(component.creationTitle).toBe("New folder");
    });
  });

  describe("palette commands", () => {
    it("always offers New collection", () => {
      expect(component.commands().map((a) => a.label)).toEqual(["New collection"]);
    });

    it("adds what can be done to the selected collection", () => {
      const collection = makeCollection("c1", "My Collection");
      collectionsService.setTree([{ collection, folders: [], requests: [] }]);
      component.handleNodeSelect(component.nodes()[0]);

      const labels = component.commands().map((a) => a.label);
      expect(labels).toContain("New folder in My Collection");
      expect(labels).toContain("New request in My Collection");
      expect(labels).toContain("Duplicate My Collection");
      expect(labels).toContain("Export My Collection…");
      expect(labels).toContain("Delete My Collection");
    });
  });

  describe("creation dialog", () => {
    it("disables submission until a name is entered, and (for requests) a method is chosen", () => {
      const collection = makeCollection("c1");
      collectionsService.setTree([{ collection, folders: [], requests: [] }]);

      void component.handleCreateCollection();
      expect(component.creationDisabled).toBe(true);

      component.onCreationNameChange("  ");
      expect(component.creationDisabled).toBe(true);

      component.onCreationNameChange("Real Name");
      expect(component.creationDisabled).toBe(false);
    });

    it("submitCreation creates a collection with the trimmed name and closes the dialog", async () => {
      void component.handleCreateCollection();
      component.onCreationNameChange("  Trimmed  ");

      await component.submitCreation();

      expect(collectionsService.createCollectionCalls).toEqual([{ name: "Trimmed" }]);
      expect(component.creationDialogVisible()).toBe(false);
    });
  });

  describe("keyboard shortcuts", () => {
    it("runs the single-key shortcut C only while focus is inside the panel", () => {
      const press = (target: Element) => {
        const event = new KeyboardEvent("keydown", { key: "c" });
        Object.defineProperty(event, "target", { value: target });
        component.handleGlobalKeydown(event);
      };

      press(document.body);
      expect(component.creationDialogVisible()).toBe(false);

      press(fixture.nativeElement as HTMLElement);
      expect(component.creationDialogVisible()).toBe(true);
    });

    it("ignores the single-key shortcuts in a form field", () => {
      const input = document.createElement("input");
      const typed = new KeyboardEvent("keydown", { key: "c" });
      Object.defineProperty(typed, "target", { value: input });
      component.handleGlobalKeydown(typed);
      expect(component.creationDialogVisible()).toBe(false);
    });
  });
});
