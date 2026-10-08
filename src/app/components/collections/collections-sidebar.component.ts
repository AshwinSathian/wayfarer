import { ChangeDetectionStrategy, Component, ElementRef, Injector, OnInit, afterNextRender, computed, signal, WritableSignal, inject, input, output } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { ButtonDirective } from "../../ui/button.directive";
import { MenuComponent, UiMenuItem } from "../../ui/menu.component";
import { ConfirmService } from "../../ui/confirm.service";
import { DialogComponent } from "../../ui/dialog.component";
import { SelectComponent } from "../../ui/select.component";
import { TreeComponent, UiTreeNode } from "../../ui/tree.component";
import { RequestDoc } from "../../models/collections.models";
import { CollectionsService } from "../../services/collections.service";
import { CollectionImportService } from "../../services/collection-import.service";
import { HTTP_METHODS, PastRequest } from "../../models/history.models";
import {
  CollectionNodeData,
  collectionsToNodes,
  isCollectionRef,
  isFolderRef,
} from "../../shared/collections/collection-tree-nodes.util";
import {
  CollectionNodeAction,
  buildContextItems,
} from "../../shared/collections/collection-context-menu.util";
import { IconComponent } from "../../shared/icon/icon.component";

type NodeData = CollectionNodeData;

export interface PaletteAction {
  id: string;
  label: string;
  run: () => void | Promise<void>;
}

@Component({
  selector: "app-collections-sidebar",
  imports: [
    IconComponent,
    FormsModule,
    TreeComponent,
    MenuComponent,
    ButtonDirective,
    DialogComponent,
    SelectComponent,
  ],
  templateUrl: "./collections-sidebar.component.html",
  styleUrl: "./collections-sidebar.component.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { "(window:keydown)": "handleGlobalKeydown($event)" },
})
// ~570 lines: tree-node building/type guards moved to
// shared/collections/collection-tree-nodes.util.ts, context-menu building to
// shared/collections/collection-context-menu.util.ts, and the import-dialog
// pipeline to CollectionImportService (mirrors RequestSaveService). What's
// left is the sidebar's actual job: tree selection/drag-drop/rename/CRUD
// dispatch, the command palette (registers its own + externally-supplied
// actions and filters them), and the creation dialog - all genuinely
// sidebar-owned interaction state, not extractable without just relocating
// the same coupling elsewhere.
export class CollectionsSidebarComponent implements OnInit {
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);
  private readonly injector = inject(Injector);
  private readonly collectionsService = inject(CollectionsService);
  private readonly confirm = inject(ConfirmService);
  private readonly collectionImport = inject(CollectionImportService);

  readonly loadRequest = output<RequestDoc>();
  /** App-shell-owned commands (theme, history, composer, bridge, ...) the palette can't build itself since it has no access to those services/components. */
  readonly externalActions = input<PaletteAction[]>([]);

  readonly nodes = computed<UiTreeNode<NodeData>[]>(() =>
    collectionsToNodes(this.collectionsService.tree())
  );
  readonly loading = this.collectionsService.loading;
  readonly selectedNode = signal<UiTreeNode<NodeData> | null>(null);
  readonly contextItems = signal<UiMenuItem[]>([]);
  readonly editingKey: WritableSignal<string | null> = signal(null);
  readonly editingValue = signal("");

  // Import-dialog state/pipeline lives in CollectionImportService now (see
  // its own file) — these are direct pass-throughs so the template doesn't
  // need to change.
  readonly importDialogVisible = this.collectionImport.dialogVisible;
  readonly importErrors = this.collectionImport.errors;
  readonly importAnalysis = this.collectionImport.analysis;
  readonly importDuplicateAsNew = this.collectionImport.duplicateAsNew;
  readonly importFileName = this.collectionImport.fileName;

  readonly commandPaletteVisible = signal(false);
  readonly commandPaletteQuery = signal("");
  readonly creationDialogVisible = signal(false);
  readonly creationContext = signal<{
    type: "collection" | "folder" | "request";
    collectionId?: string;
    folderId?: string;
  } | null>(null);
  readonly creationModel = signal({
    name: "",
    method: "GET" as PastRequest["method"],
  });
  readonly methodOptions = HTTP_METHODS.map((method) => ({ label: method, value: method }));

  ngOnInit(): void {
    void this.collectionsService.ensureLoaded();
  }

  async handleCreateCollection(): Promise<void> {
    this.openCreationDialog({ type: "collection" });
  }

  async handleImportFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }
    const text = await file.text();
    this.collectionImport.stageFile(file.name, text);
    input.value = "";
  }

  async confirmImport(): Promise<void> {
    await this.collectionImport.confirm();
  }

  toggleDuplicateImport(value: boolean): void {
    this.collectionImport.toggleDuplicateAsNew(value);
  }

  closeImportDialog(): void {
    this.collectionImport.close();
  }

  handleGlobalKeydown(event: KeyboardEvent): void {
    if (this.importDialogVisible() || this.commandPaletteVisible()) {
      return;
    }
    const target = event.target as HTMLElement | null;
    if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) {
      return;
    }

    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      this.openCommandPalette();
      return;
    }

    if (event.key === "Delete" && this.selectedNode()) {
      event.preventDefault();
      void this.handleAction("delete", this.selectedNode()!);
      return;
    }

    if (!event.metaKey && !event.ctrlKey && !event.altKey) {
      if (event.key.toLowerCase() === "c") {
        event.preventDefault();
        void this.handleCreateCollection();
        return;
      }
      if (event.key.toLowerCase() === "n") {
        event.preventDefault();
        this.triggerNewRequestShortcut();
      }
    }
  }

  openCommandPalette(): void {
    this.commandPaletteQuery.set("");
    this.commandPaletteVisible.set(true);
  }

  closeCommandPalette(): void {
    this.commandPaletteVisible.set(false);
    this.commandPaletteQuery.set("");
  }

  get filteredPaletteActions(): PaletteAction[] {
    const actions = this.buildPaletteActions();
    const needle = this.commandPaletteQuery().trim().toLowerCase();
    if (!needle) {
      return actions;
    }
    return actions.filter((action) => action.label.toLowerCase().includes(needle));
  }

  executeFirstPaletteAction(): void {
    const action = this.filteredPaletteActions[0];
    if (action) {
      void this.executePaletteAction(action);
    }
  }

  async executePaletteAction(action: PaletteAction): Promise<void> {
    await Promise.resolve(action.run());
    this.closeCommandPalette();
  }

  private buildPaletteActions(): PaletteAction[] {
    const actions: PaletteAction[] = [
      { id: "new-collection", label: "New Collection", run: () => this.handleCreateCollection() },
      ...this.externalActions(),
    ];
    const node = this.selectedNode();
    if (!node) {
      return actions;
    }
    const data = node.data as NodeData;
    if (data.type === "collection") {
      actions.push(
        {
          id: "new-folder",
          label: `New Folder in ${data.ref.name}`,
          run: () => this.createFolderPrompt(data.ref.meta.id),
        },
        {
          id: "new-request",
          label: `New Request in ${data.ref.name}`,
          run: () => this.createRequestPrompt(data.ref.meta.id),
        },
        {
          id: "duplicate-collection",
          label: `Duplicate ${data.ref.name}`,
          run: () => this.duplicateNode({ type: "collection", ref: data.ref }),
        },
        {
          id: "export-collection",
          label: `Export ${data.ref.name}`,
          run: () => this.exportCollection(node),
        },
        {
          id: "delete-collection",
          label: `Delete ${data.ref.name}`,
          run: () => this.handleAction("delete", node),
        }
      );
    }
    if (data.type === "folder") {
      const folder = data.ref;
      actions.push(
        {
          id: "new-request-folder",
          label: `New Request in ${folder.name}`,
          run: () => this.createRequestPrompt(folder.collectionId, folder.meta.id),
        },
        {
          id: "duplicate-folder",
          label: `Duplicate ${folder.name}`,
          run: () => this.duplicateNode(data),
        },
        {
          id: "delete-folder",
          label: `Delete ${folder.name}`,
          run: () => this.handleAction("delete", node),
        }
      );
    }
    if (data.type === "request") {
      const request = data.ref;
      actions.push(
        {
          id: "load-request",
          label: `Load "${request.name || request.url}" into composer`,
          run: () => this.emitLoadRequest(request),
        },
        {
          id: "duplicate-request",
          label: `Duplicate ${request.name || request.url}`,
          run: () => this.duplicateNode(data),
        },
        {
          id: "delete-request",
          label: `Delete ${request.name || request.url}`,
          run: () => this.handleAction("delete", node),
        }
      );
    }
    return actions;
  }

  private triggerNewRequestShortcut(): void {
    const node = this.selectedNode();
    if (!node) {
      return;
    }
    const data = node.data as NodeData;
    if (data.type === "collection") {
      void this.createRequestPrompt(data.ref.meta.id);
    } else if (data.type === "folder") {
      void this.createRequestPrompt(data.ref.collectionId, data.ref.meta.id);
    }
  }

  handleNodeSelect(node: UiTreeNode<NodeData>): void {
    this.selectedNode.set(node);
    this.contextItems.set(
      buildContextItems(node, (action, target) => this.dispatchContextAction(action, target))
    );
  }

  private dispatchContextAction(action: CollectionNodeAction, node: UiTreeNode<NodeData>): void {
    if (action === "export") {
      void this.exportCollection(node);
      return;
    }
    void this.handleAction(action, node);
  }

  handleNodeDoubleClick(node: UiTreeNode<NodeData>): void {
    const data = node.data as NodeData | undefined;
    if (data?.type === "request") {
      this.emitLoadRequest(data.ref);
    }
  }

  private emitLoadRequest(doc: RequestDoc): void {
    this.loadRequest.emit(doc);
  }

  /** Opens the context menu for a node, with that node's actions. */
  openContextMenu(menu: MenuComponent, node: UiTreeNode<NodeData>, event: MouseEvent): void {
    this.handleNodeSelect(node);
    // Passed directly: the menu's own input is not updated until the next render.
    menu.show(event, this.contextItems());
  }

  /** Saves the new order of a node's siblings after a drag and drop or an Alt+Arrow move. */
  async handleReorder(event: { node: UiTreeNode<NodeData>; siblings: UiTreeNode<NodeData>[] }): Promise<void> {
    const order = event.siblings.map((sibling, index) => ({ id: sibling.data.ref.meta.id, order: index + 1 }));
    switch (event.node.data.type) {
      case "collection":
        return this.collectionsService.reorderCollections(order);
      case "folder":
        return this.collectionsService.reorderFolders(order);
      case "request":
        return this.collectionsService.reorderRequests(order);
    }
  }

  /** Nodes are reordered among their own kind only: collections, folders or requests. */
  readonly nodeKind = (node: UiTreeNode<NodeData>): string => node.data.type;

  beginRename(node: UiTreeNode<NodeData>): void {
    this.editingKey.set(node.key ?? null);
    this.editingValue.set(node.label ?? "");
    afterNextRender(
      () => {
        const field = this.host.nativeElement.querySelector<HTMLInputElement>('[role="tree"] input');
        field?.focus();
        field?.select();
      },
      { injector: this.injector }
    );
  }

  /** Ends an inline rename from the keyboard and puts focus back on the node's row. */
  async endRename(tree: TreeComponent<NodeData>, node: UiTreeNode<NodeData>, event: Event, commit: boolean): Promise<void> {
    // The key ends the rename only; a drawer around the tree stays open.
    event.preventDefault();
    event.stopPropagation();
    if (commit) await this.commitRename(node);
    else this.cancelEdit();
    if (this.editingKey() === null) afterNextRender(() => tree.focusNode(node.key), { injector: this.injector });
  }

  async commitRename(node: UiTreeNode<NodeData>): Promise<void> {
    const key = node.key;
    if (!key) {
      return;
    }
    const value = this.editingValue().trim();
    if (!value) {
      return;
    }
    const data = node.data as NodeData;
    if (data.type === "collection") {
      await this.collectionsService.renameCollection(data.ref.meta.id, {
        name: value,
      });
    } else if (data.type === "folder") {
      await this.collectionsService.renameFolder(data.ref.meta.id, value);
    } else if (data.type === "request") {
      await this.collectionsService.renameRequest(data.ref.meta.id, value);
    }
    this.cancelEdit();
  }

  cancelEdit(): void {
    this.editingKey.set(null);
    this.editingValue.set("");
  }

  async handleAction(
    action: Exclude<CollectionNodeAction, "export">,
    node: UiTreeNode<NodeData>
  ): Promise<void> {
    const data = node.data as NodeData;
    switch (action) {
      case "new-folder":
        if (data.type === "collection" && isCollectionRef(data.ref)) {
          await this.createFolderPrompt(data.ref.meta.id);
        }
        break;
      case "new-request":
        if (data.type === "collection" && isCollectionRef(data.ref)) {
          await this.createRequestPrompt(data.ref.meta.id);
        } else if (data.type === "folder" && isFolderRef(data.ref)) {
          await this.createRequestPrompt(data.ref.collectionId, data.ref.meta.id);
        }
        break;
      case "duplicate":
        await this.duplicateNode(data);
        break;
      case "delete":
        await this.deleteNode(data);
        break;
      case "rename":
        this.beginRename(node);
        break;
    }
  }

  private async createFolderPrompt(collectionId: string): Promise<void> {
    this.openCreationDialog({ type: "folder", collectionId });
  }

  private async createRequestPrompt(
    collectionId: string,
    folderId?: string
  ): Promise<void> {
    this.openCreationDialog({ type: "request", collectionId, folderId });
  }

  private async duplicateNode(data: NodeData): Promise<void> {
    if (data.type === "collection") {
      await this.collectionsService.duplicateCollection(data.ref.meta.id);
    } else if (data.type === "folder") {
      await this.collectionsService.duplicateFolder(data.ref.meta.id);
    } else {
      await this.collectionsService.duplicateRequest(data.ref.meta.id);
    }
  }

  private async deleteNode(data: NodeData): Promise<void> {
    const confirmed = await this.confirm.confirm({
      title: "Delete item?",
      message: "This action cannot be undone. Continue?",
    });
    if (!confirmed) return;
    if (data.type === "collection") {
      await this.collectionsService.deleteCollection(data.ref.meta.id);
    } else if (data.type === "folder") {
      await this.collectionsService.deleteFolder(data.ref.meta.id);
    } else {
      await this.collectionsService.deleteRequest(data.ref.meta.id);
    }
  }

  private async exportCollection(node: UiTreeNode<NodeData>): Promise<void> {
    const data = node.data as NodeData;
    if (data.type !== "collection") {
      return;
    }
    const json = await this.collectionsService.exportCollectionJson(data.ref.meta.id);
    if (!json) {
      return;
    }
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    const safeName = data.ref.name.replace(/\s+/g, "-").toLowerCase();
    anchor.download = `${safeName}-collection.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  get creationTitle(): string {
    switch (this.creationContext()?.type) {
      case "collection":
        return "New Collection";
      case "folder":
        return "New Folder";
      case "request":
        return "New Request";
      default:
        return "New Item";
    }
  }

  get creationDisabled(): boolean {
    const context = this.creationContext();
    if (!context) {
      return true;
    }
    const model = this.creationModel();
    if (!model.name.trim()) {
      return true;
    }
    if (context.type === "request" && !model.method) {
      return true;
    }
    return false;
  }

  onCreationNameChange(value: string): void {
    this.creationModel.update((model) => ({ ...model, name: value }));
  }

  onCreationMethodChange(value: PastRequest["method"]): void {
    this.creationModel.update((model) => ({ ...model, method: value }));
  }

  private openCreationDialog(context: {
    type: "collection" | "folder" | "request";
    collectionId?: string;
    folderId?: string;
  }): void {
    this.creationContext.set(context);
    this.creationModel.set({ name: "", method: "GET" });
    this.creationDialogVisible.set(true);
  }

  async submitCreation(): Promise<void> {
    const context = this.creationContext();
    if (!context) {
      return;
    }
    const name = this.creationModel().name.trim();
    if (!name) {
      return;
    }

    if (context.type === "collection") {
      await this.collectionsService.createCollection({ name });
    } else if (context.type === "folder" && context.collectionId) {
      await this.collectionsService.createFolder({
        collectionId: context.collectionId,
        name,
      });
    } else if (context.type === "request" && context.collectionId) {
      await this.collectionsService.createRequest({
        collectionId: context.collectionId,
        folderId: context.folderId,
        name,
        method: this.creationModel().method,
        url: "",
      });
    }

    this.closeCreationDialog();
  }

  closeCreationDialog(): void {
    this.creationDialogVisible.set(false);
    this.creationContext.set(null);
    this.creationModel.set({ name: "", method: "GET" });
  }
}
