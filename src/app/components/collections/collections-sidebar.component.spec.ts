import { ComponentFixture, TestBed } from "@angular/core/testing";
import { signal } from "@angular/core";
import { ConfirmationService } from "primeng/api";
import { CollectionsSidebarComponent, PaletteAction } from "./collections-sidebar.component";
import { CollectionsService, CollectionTree } from "../../services/collections.service";
import { Collection, Folder, Meta, RequestDoc } from "../../models/collections.models";

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
        ConfirmationService,
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CollectionsSidebarComponent);
    component = fixture.componentInstance;
  });

  describe("tree construction", () => {
    it("converts a CollectionTree into nested PrimeNG tree nodes, folders and unfoldered requests as children", () => {
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
      expect(requestNode?.leaf).toBeTrue();
    });
  });

  describe("context menu", () => {
    it("offers New Folder/New Request/Export among a collection node's actions", () => {
      const collection = makeCollection("c1");
      collectionsService.setTree([{ collection, folders: [], requests: [] }]);
      const node = component.nodes()[0];

      component.handleNodeSelect(node);

      const labels = component.contextItems().map((item) => item.label);
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

      const labels = component.contextItems().map((item) => item.label);
      expect(labels).toEqual(["Rename", "Duplicate", "Delete"]);
    });
  });

  describe("handleAction dispatch", () => {
    it("routes 'delete' on a request node through ConfirmationService, and only calls deleteRequest once the user accepts", () => {
      const collection = makeCollection("c1");
      const request = makeRequest("r1", "c1");
      collectionsService.setTree([{ collection, folders: [], requests: [request] }]);
      const requestNode = component.nodes()[0].children?.[0];
      expect(requestNode).toBeDefined();

      // ConfirmationService is provided at the component level (see the
      // @Component `providers` array), so it must be resolved from the
      // component's own injector, not TestBed's root injector — those are
      // two different instances.
      const confirmationService = fixture.debugElement.injector.get(ConfirmationService);
      let capturedAccept: (() => void) | undefined;
      spyOn(confirmationService, "confirm").and.callFake((cfg: any) => {
        capturedAccept = cfg.accept;
        return confirmationService;
      });

      void component.handleAction("delete", requestNode!);

      expect(confirmationService.confirm).toHaveBeenCalled();
      expect(collectionsService.deleteRequestCalls).toEqual([]);

      capturedAccept?.();

      expect(collectionsService.deleteRequestCalls).toEqual(["r1"]);
    });

    it("creates a folder under the collection when dispatched 'new-folder' on a collection node", async () => {
      const collection = makeCollection("c1");
      collectionsService.setTree([{ collection, folders: [], requests: [] }]);
      const node = component.nodes()[0];

      await component.handleAction("new-folder", node);

      expect(component.creationDialogVisible()).toBeTrue();
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
      expect(component.commandPaletteVisible()).toBeTrue();
      const action: PaletteAction = { id: "x", label: "X", run: jasmine.createSpy("run") };

      await component.executePaletteAction(action);

      expect(action.run).toHaveBeenCalled();
      expect(component.commandPaletteVisible()).toBeFalse();
    });
  });

  describe("creation dialog", () => {
    it("disables submission until a name is entered, and (for requests) a method is chosen", () => {
      const collection = makeCollection("c1");
      collectionsService.setTree([{ collection, folders: [], requests: [] }]);

      void component.handleCreateCollection();
      expect(component.creationDisabled).toBeTrue();

      component.onCreationNameChange("  ");
      expect(component.creationDisabled).toBeTrue();

      component.onCreationNameChange("Real Name");
      expect(component.creationDisabled).toBeFalse();
    });

    it("submitCreation creates a collection with the trimmed name and closes the dialog", async () => {
      void component.handleCreateCollection();
      component.onCreationNameChange("  Trimmed  ");

      await component.submitCreation();

      expect(collectionsService.createCollectionCalls).toEqual([{ name: "Trimmed" }]);
      expect(component.creationDialogVisible()).toBeFalse();
    });
  });

  describe("keyboard shortcuts", () => {
    it("Cmd+K opens the command palette and prevents the browser default", () => {
      const event = new KeyboardEvent("keydown", { key: "k", metaKey: true });
      spyOn(event, "preventDefault");

      component.handleGlobalKeydown(event);

      expect(event.preventDefault).toHaveBeenCalled();
      expect(component.commandPaletteVisible()).toBeTrue();
    });

    it("ignores shortcuts entirely while typing in a form field", () => {
      const input = document.createElement("input");
      const event = new KeyboardEvent("keydown", { key: "k", metaKey: true });
      Object.defineProperty(event, "target", { value: input });

      component.handleGlobalKeydown(event);

      expect(component.commandPaletteVisible()).toBeFalse();
    });
  });
});
