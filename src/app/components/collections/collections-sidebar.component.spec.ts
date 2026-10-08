import { ComponentFixture, TestBed } from "@angular/core/testing";
import { signal } from "@angular/core";
import { ConfirmService } from "../../ui/confirm.service";
import { CollectionsSidebarComponent, PaletteAction } from "./collections-sidebar.component";
import { CollectionsService, CollectionTree } from "../../services/collections.service";
import { Collection, Folder, Meta, RequestDoc } from "../../models/collections.models";
import { describe, it, beforeEach, expect, vi } from "vitest";

function meta(id: string): Meta {
  return { id, createdAt: 1, updatedAt: 1, version: 1 };
}

function makeCollection(id: string, name = `Collection ${id}`, order = 0): Collection {
  return { id, meta: meta(id), name, order };
}

function makeFolder(id: string, collectionId: string, order = 0): Folder {
  return { id, meta: meta(id), collectionId, name: `Folder ${id}`, order };
}

function makeRequest(id: string, collectionId: string, folderId?: string): RequestDoc {
  return {
    id,
    meta: meta(id),
    collectionId,
    folderId,
    name: `Request ${id}`,
    order: 0,
    method: "GET",
    url: "https://example.com",
    headers: {},
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

  async deleteCollection(id: string): Promise<void> {
    this.deleteCollectionCalls.push(id);
  }

  async duplicateCollection(id: string): Promise<Collection | null> {
    this.duplicateCollectionCalls.push(id);
    return null;
  }

  async deleteFolder(id: string): Promise<void> {
    this.deleteFolderCalls.push(id);
  }

  async deleteRequest(id: string): Promise<void> {
    this.deleteRequestCalls.push(id);
  }

  async exportCollectionJson(): Promise<string | null> {
    return null;
  }

  readonly reorderCalls: { kind: string; order: { id: string; order: number }[] }[] = [];
  readonly renameCalls: { id: string; name: string }[] = [];

  async reorderCollections(order: { id: string; order: number }[]): Promise<void> {
    this.reorderCalls.push({ kind: "collections", order });
  }

  async reorderFolders(order: { id: string; order: number }[]): Promise<void> {
    this.reorderCalls.push({ kind: "folders", order });
  }

  async reorderRequests(order: { id: string; order: number }[]): Promise<void> {
    this.reorderCalls.push({ kind: "requests", order });
  }

  async renameRequest(id: string, name: string): Promise<null> {
    this.renameCalls.push({ id, name });
    return null;
  }
}

describe("CollectionsSidebarComponent", () => {
  let component: CollectionsSidebarComponent;
  let fixture: ComponentFixture<CollectionsSidebarComponent>;
  let collectionsService: CollectionsServiceStub;

  beforeEach(async () => {
    collectionsService = new CollectionsServiceStub();

    await TestBed.configureTestingModule({
      imports: [CollectionsSidebarComponent],
      providers: [
        { provide: CollectionsService, useValue: collectionsService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CollectionsSidebarComponent);
    component = fixture.componentInstance;
  });

  describe("tree construction", () => {
    it("converts a CollectionTree into nested tree nodes, folders and unfoldered requests as children", () => {
      const collection = makeCollection("c1");
      const folder = makeFolder("f1", "c1");
      const rootRequest = makeRequest("r1", "c1");
      const folderedRequest = makeRequest("r2", "c1", "f1");

      collectionsService.setTree([
        { collection, folders: [folder], requests: [rootRequest, folderedRequest] },
      ]);

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
  });

  describe("the rendered tree", () => {
    const rows = () => Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('[role="treeitem"]'));
    const row = (name: string) => rows().find((r) => r.getAttribute("aria-label") === name)!;

    beforeEach(async () => {
      document.body.append(fixture.nativeElement);
      collectionsService.setTree([
        { collection: makeCollection("c1"), folders: [makeFolder("f1", "c1"), makeFolder("f2", "c1")], requests: [makeRequest("r1", "c1"), makeRequest("r2", "c1"), makeRequest("r3", "c1", "f1")] },
        { collection: makeCollection("c2"), folders: [], requests: [] },
      ]);
      await fixture.whenStable();
    });

    it("lists collections expanded and folders collapsed, folders before requests", () => {
      expect(rows().map((r) => `${r.getAttribute("aria-level")} ${r.getAttribute("aria-label")}`)).toEqual([
        "1 Collection c1",
        "2 Folder f1",
        "2 Folder f2",
        "2 Request r1",
        "2 Request r2",
        "1 Collection c2",
      ]);
      expect(row("Folder f1").getAttribute("aria-expanded")).toBe("false");
    });

    it("saves a new order for the kind that moved: collections, folders or requests", async () => {
      const [c1, c2] = component.nodes();
      const [f1, f2, r1, r2] = c1.children!;

      await component.handleReorder({ node: c2, siblings: [c2, c1] });
      await component.handleReorder({ node: f2, siblings: [f2, f1] });
      await component.handleReorder({ node: r2, siblings: [r2, r1] });

      expect(collectionsService.reorderCalls).toEqual([
        { kind: "collections", order: [{ id: "c2", order: 1 }, { id: "c1", order: 2 }] },
        { kind: "folders", order: [{ id: "f2", order: 1 }, { id: "f1", order: 2 }] },
        { kind: "requests", order: [{ id: "r2", order: 1 }, { id: "r1", order: 2 }] },
      ]);
    });

    it("Alt+ArrowUp on a request saves the new order of the requests around it", async () => {
      row("Request r2").focus();
      row("Request r2").dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", altKey: true, bubbles: true, cancelable: true }));
      await fixture.whenStable();

      expect(collectionsService.reorderCalls).toEqual([{ kind: "requests", order: [{ id: "r2", order: 1 }, { id: "r1", order: 2 }] }]);
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
      expect(labels).toContain("New Folder");
      expect(labels).toContain("New Request");
      expect(labels).toContain("Export");
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
    it("routes 'delete' on a request node through ConfirmService, and only calls deleteRequest once the user accepts", async () => {
      const collection = makeCollection("c1");
      const request = makeRequest("r1", "c1");
      collectionsService.setTree([{ collection, folders: [], requests: [request] }]);
      const requestNode = component.nodes()[0].children?.[0];
      expect(requestNode).toBeDefined();

      let answer: (accepted: boolean) => void = () => undefined;
      const confirm = vi.spyOn(TestBed.inject(ConfirmService), "confirm").mockImplementation(
        () => new Promise<boolean>((resolve) => (answer = resolve))
      );

      const pending = component.handleAction("delete", requestNode!);
      await Promise.resolve();

      expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ title: "Delete item?" }));
      expect(collectionsService.deleteRequestCalls).toEqual([]);

      answer(true);
      await pending;

      expect(collectionsService.deleteRequestCalls).toEqual(["r1"]);
    });

    it("does not delete when the user backs out of the confirmation", async () => {
      const collection = makeCollection("c1");
      const request = makeRequest("r1", "c1");
      collectionsService.setTree([{ collection, folders: [], requests: [request] }]);
      vi.spyOn(TestBed.inject(ConfirmService), "confirm").mockResolvedValue(false);

      await component.handleAction("delete", component.nodes()[0].children![0]);

      expect(collectionsService.deleteRequestCalls).toEqual([]);
    });

    it("creates a folder under the collection when dispatched 'new-folder' on a collection node", async () => {
      const collection = makeCollection("c1");
      collectionsService.setTree([{ collection, folders: [], requests: [] }]);
      const node = component.nodes()[0];

      await component.handleAction("new-folder", node);

      expect(component.creationDialogVisible()).toBe(true);
      expect(component.creationTitle).toBe("New Folder");
    });
  });

  describe("command palette", () => {
    it("always includes the built-in New Collection action plus any externally-supplied actions", () => {
      const externalAction: PaletteAction = { id: "ext-1", label: "External Action", run: () => {} };
      fixture.componentRef.setInput("externalActions", [externalAction]);

      const labels = component.filteredPaletteActions.map((a) => a.label);
      expect(labels).toContain("New Collection");
      expect(labels).toContain("External Action");
    });

    it("filters actions case-insensitively by the palette query", () => {
      component.openCommandPalette();
      component.commandPaletteQuery.set("COLLECTION");

      const labels = component.filteredPaletteActions.map((a) => a.label);
      expect(labels).toEqual(["New Collection"]);
    });

    it("adds per-node actions (New Folder/New Request/Duplicate/Export/Delete) once a collection node is selected", () => {
      const collection = makeCollection("c1", "My Collection");
      collectionsService.setTree([{ collection, folders: [], requests: [] }]);
      component.handleNodeSelect(component.nodes()[0]);

      const labels = component.filteredPaletteActions.map((a) => a.label);
      expect(labels).toContain("New Folder in My Collection");
      expect(labels).toContain("New Request in My Collection");
      expect(labels).toContain("Duplicate My Collection");
      expect(labels).toContain("Export My Collection");
      expect(labels).toContain("Delete My Collection");
    });

    it("executePaletteAction runs the action and closes the palette", async () => {
      component.openCommandPalette();
      expect(component.commandPaletteVisible()).toBe(true);
      const action: PaletteAction = { id: "x", label: "X", run: vi.fn() };

      await component.executePaletteAction(action);

      expect(action.run).toHaveBeenCalled();
      expect(component.commandPaletteVisible()).toBe(false);
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
    it("@claim:C-030 Cmd+K opens the command palette and prevents the browser default", () => {
      const event = new KeyboardEvent("keydown", { key: "k", metaKey: true });
      vi.spyOn(event, "preventDefault");

      component.handleGlobalKeydown(event);

      expect(event.preventDefault).toHaveBeenCalled();
      expect(component.commandPaletteVisible()).toBe(true);
    });

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

    it("ignores shortcuts entirely while typing in a form field", () => {
      const input = document.createElement("input");
      const event = new KeyboardEvent("keydown", { key: "k", metaKey: true });
      Object.defineProperty(event, "target", { value: input });

      component.handleGlobalKeydown(event);

      expect(component.commandPaletteVisible()).toBe(false);
    });
  });
});
