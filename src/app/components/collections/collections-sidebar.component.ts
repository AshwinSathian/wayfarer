import { CommonModule } from "@angular/common";
import { ChangeDetectionStrategy, Component, HostListener, OnInit, computed, signal, WritableSignal, inject, output } from "@angular/core";
import { FormsModule } from "@angular/forms";
import {
  ConfirmationService,
  MenuItem,
  TreeNode,
  TreeDragDropService,
} from "primeng/api";
import { ButtonModule } from "primeng/button";
import { ContextMenuModule } from "primeng/contextmenu";
import { InputTextModule } from "primeng/inputtext";
import { CheckboxModule } from "primeng/checkbox";
import { SkeletonModule } from "primeng/skeleton";
import { TreeModule } from "primeng/tree";
import { DialogModule } from "primeng/dialog";
import { SelectModule } from "primeng/select";
import { ConfirmDialogModule } from "primeng/confirmdialog";
import {
  Collection,
  CollectionExport,
  Folder,
  RequestDoc,
} from "../../models/collections.models";
import {
  CollectionTree,
  CollectionsService,
} from "../../services/collections.service";
import {
  CollectionImportResult,
  importCollection as planCollectionImport,
  validateCollection,
  ValidationResult,
} from "../../shared/collections/collection-io.util";
import { PastRequest } from "../../models/history.models";

type NodeData =
  | { type: "collection"; ref: Collection }
  | { type: "folder"; ref: Folder }
  | { type: "request"; ref: RequestDoc };

interface TreeDragDropEvent {
  dragNode?: TreeNode<NodeData> | null;
  tree?: { value?: TreeNode<NodeData>[] };
}

interface PaletteAction {
  id: string;
  label: string;
  run: () => void | Promise<void>;
}

@Component({
  selector: "app-collections-sidebar",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TreeModule,
    ContextMenuModule,
    ButtonModule,
    InputTextModule,
    CheckboxModule,
    SkeletonModule,
    DialogModule,
    SelectModule,
    ConfirmDialogModule,
  ],
  templateUrl: "./collections-sidebar.component.html",
  styleUrls: ["./collections-sidebar.component.css"],
  providers: [ConfirmationService, TreeDragDropService],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CollectionsSidebarComponent implements OnInit {
  private readonly collectionsService = inject(CollectionsService);
  private readonly confirmationService = inject(ConfirmationService);

  readonly loadRequest = output<PastRequest>();

  readonly nodes = computed<TreeNode<NodeData>[]>(() =>
    this.collectionsToNodes(this.collectionsService.tree())
  );
  readonly loading = this.collectionsService.loading;
  readonly selectedNode = signal<TreeNode<NodeData> | null>(null);
  readonly contextItems = signal<MenuItem[]>([]);
  readonly editingKey: WritableSignal<string | null> = signal(null);
  readonly editingValue = signal("");
  readonly importDialogVisible = signal(false);
  readonly importErrors = signal<ValidationResult[]>([]);
  readonly importAnalysis = signal<CollectionImportResult | null>(null);
  readonly importSourcePayload = signal<CollectionExport | null>(null);
  readonly importDuplicateAsNew = signal(false);
  readonly importFileName = signal("");
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
  readonly methodOptions = [
    "GET",
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
    "HEAD",
    "OPTIONS",
  ].map((method) => ({ label: method, value: method as PastRequest["method"] }));

  async ngOnInit(): Promise<void> {
    await this.collectionsService.ensureLoaded();
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
    const validation = validateCollection(text);
    if (!validation.ok || !validation.payload) {
      this.importErrors.set(
        validation.errors ?? [{ path: "root", message: "Invalid collection export." }]
      );
      this.importSourcePayload.set(null);
      this.importAnalysis.set(null);
    } else {
      this.importErrors.set([]);
      this.importSourcePayload.set(validation.payload);
      this.updateImportAnalysis();
    }
    this.importFileName.set(file.name);
    this.importDialogVisible.set(true);
    input.value = "";
  }

  async confirmImport(): Promise<void> {
    const analysis = this.importAnalysis();
    if (!analysis?.payload || this.importErrors().length) {
      this.importDialogVisible.set(false);
      return;
    }
    await this.collectionsService.importCollection(analysis.payload, {
      duplicateAsNew: this.importDuplicateAsNew(),
    });
    this.closeImportDialog();
  }

  toggleDuplicateImport(value: boolean): void {
    this.importDuplicateAsNew.set(value);
    this.updateImportAnalysis();
  }

  closeImportDialog(): void {
    this.importDialogVisible.set(false);
    this.importErrors.set([]);
    this.importSourcePayload.set(null);
    this.importAnalysis.set(null);
    this.importDuplicateAsNew.set(false);
    this.importFileName.set("");
  }

  private updateImportAnalysis(): void {
    const payload = this.importSourcePayload();
    if (!payload) {
      this.importAnalysis.set(null);
      return;
    }
    const analysis = planCollectionImport(payload, {
      duplicateAsNew: this.importDuplicateAsNew(),
    });
    this.importAnalysis.set(analysis);
    this.importErrors.set(analysis.errors ?? []);
  }

  @HostListener("window:keydown", ["$event"])
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
      this.handleAction("delete", this.selectedNode()!);
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
      this.executePaletteAction(action);
    }
  }

  async executePaletteAction(action: PaletteAction): Promise<void> {
    await Promise.resolve(action.run());
    this.closeCommandPalette();
  }

  private buildPaletteActions(): PaletteAction[] {
    const actions: PaletteAction[] = [
      { id: "new-collection", label: "New Collection", run: () => this.handleCreateCollection() },
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

  handleNodeSelect(node: TreeNode<NodeData>): void {
    this.selectedNode.set(node);
    this.contextItems.set(this.buildContextItems(node));
  }

  handleNodeDoubleClick(node: TreeNode<NodeData>): void {
    const data = node.data as NodeData | undefined;
    if (data?.type === "request") {
      this.emitLoadRequest(data.ref);
    }
  }

  private emitLoadRequest(doc: RequestDoc): void {
    const request: PastRequest = {
      method: doc.method,
      url: doc.url,
      headers: doc.headers ?? {},
      body: doc.body as Record<string, unknown> | undefined,
      createdAt: Date.now(),
    };
    this.loadRequest.emit(request);
  }

  async handleDrop(event: TreeDragDropEvent): Promise<void> {
    const dragData = event.dragNode?.data as NodeData | undefined;
    if (!dragData) {
      return;
    }
    if (dragData.type === "collection") {
      const order = (event.tree?.value ?? this.nodes()).map((n, index) => ({
        id: (n.data as NodeData).ref.meta.id,
        order: index + 1,
      }));
      await this.collectionsService.reorderCollections(order);
      return;
    }

    if (dragData.type === "folder") {
      const siblings = event.dragNode?.parent?.children ?? [];
      const order = siblings.map((n, index) => ({
        id: (n.data as NodeData).ref.meta.id,
        order: index + 1,
      }));
      await this.collectionsService.reorderFolders(order);
      return;
    }

    if (dragData.type === "request") {
      const siblings = event.dragNode?.parent?.children ?? [];
      const order = siblings.map((n, index) => ({
        id: (n.data as NodeData).ref.meta.id,
        order: index + 1,
      }));
      await this.collectionsService.reorderRequests(order);
    }
  }

  beginRename(node: TreeNode<NodeData>): void {
    this.editingKey.set(node.key ?? null);
    this.editingValue.set(node.label ?? "");
  }

  async commitRename(node: TreeNode<NodeData>): Promise<void> {
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

  async handleAction(action: string, node: TreeNode<NodeData>): Promise<void> {
    const data = node.data as NodeData;
    switch (action) {
      case "new-folder":
        if (data.type === "collection" && this.isCollection(data.ref)) {
          await this.createFolderPrompt(data.ref.meta.id);
        }
        break;
      case "new-request":
        if (data.type === "collection" && this.isCollection(data.ref)) {
          await this.createRequestPrompt(data.ref.meta.id);
        } else if (data.type === "folder" && this.isFolder(data.ref)) {
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
    this.confirmationService.confirm({
      message: "This action cannot be undone. Continue?",
      header: "Delete item?",
      icon: "pi pi-exclamation-triangle",
      acceptLabel: "Delete",
      rejectLabel: "Cancel",
      acceptButtonStyleClass: "p-button-danger",
      accept: async () => {
        if (data.type === "collection") {
          await this.collectionsService.deleteCollection(data.ref.meta.id);
        } else if (data.type === "folder") {
          await this.collectionsService.deleteFolder(data.ref.meta.id);
        } else {
          await this.collectionsService.deleteRequest(data.ref.meta.id);
        }
      },
    });
  }

  private buildContextItems(node: TreeNode<NodeData>): MenuItem[] {
    const data = node.data as NodeData;
    if (data.type === "collection") {
      return [
        {
          label: "New Folder",
          icon: "pi pi-folder",
          command: () => this.handleAction("new-folder", node),
        },
        {
          label: "New Request",
          icon: "pi pi-plus",
          command: () => this.handleAction("new-request", node),
        },
        { separator: true },
        {
          label: "Rename",
          icon: "pi pi-pencil",
          command: () => this.handleAction("rename", node),
        },
        {
          label: "Duplicate",
          icon: "pi pi-copy",
          command: () => this.handleAction("duplicate", node),
        },
        {
          label: "Export",
          icon: "pi pi-download",
          command: () => this.exportCollection(node),
        },
        {
          label: "Delete",
          icon: "pi pi-trash",
          command: () => this.handleAction("delete", node),
        },
      ];
    }
    if (data.type === "folder") {
      return [
        {
          label: "New Request",
          icon: "pi pi-plus",
          command: () => this.handleAction("new-request", node),
        },
        {
          label: "Rename",
          icon: "pi pi-pencil",
          command: () => this.handleAction("rename", node),
        },
        {
          label: "Duplicate",
          icon: "pi pi-copy",
          command: () => this.handleAction("duplicate", node),
        },
        {
          label: "Delete",
          icon: "pi pi-trash",
          command: () => this.handleAction("delete", node),
        },
      ];
    }
    return [
      {
        label: "Rename",
        icon: "pi pi-pencil",
        command: () => this.handleAction("rename", node),
      },
      {
        label: "Duplicate",
        icon: "pi pi-copy",
        command: () => this.handleAction("duplicate", node),
      },
      {
        label: "Delete",
        icon: "pi pi-trash",
        command: () => this.handleAction("delete", node),
      },
    ];
  }

  private collectionsToNodes(trees: CollectionTree[]): TreeNode<NodeData>[] {
    return trees.map((entry) => this.toCollectionNode(entry));
  }

  private toCollectionNode(entry: CollectionTree): TreeNode<NodeData> {
    return {
      key: `collection:${entry.collection.meta.id}`,
      label: entry.collection.name,
      data: { type: "collection", ref: entry.collection },
      expanded: true,
      children: [
        ...entry.folders.map((folder) => this.toFolderNode(folder, entry)),
        ...entry.requests
          .filter((req) => !req.folderId)
          .map((req) => this.toRequestNode(req)),
      ],
    };
  }

  private toFolderNode(folder: Folder, entry: CollectionTree): TreeNode<NodeData> {
    const children = entry.requests
      .filter((req) => req.folderId === folder.meta.id)
      .map((req) => this.toRequestNode(req));
    return {
      key: `folder:${folder.meta.id}`,
      label: folder.name,
      data: { type: "folder", ref: folder },
      children,
    };
  }

  private toRequestNode(req: RequestDoc): TreeNode<NodeData> {
    return {
      key: `request:${req.meta.id}`,
      label: req.name || req.url || req.method,
      data: { type: "request", ref: req },
      leaf: true,
    };
  }

  private async exportCollection(node: TreeNode<NodeData>): Promise<void> {
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

  private isCollection(ref: Collection | Folder | RequestDoc): ref is Collection {
    return !("collectionId" in ref) && !("method" in ref);
  }

  private isFolder(ref: Collection | Folder | RequestDoc): ref is Folder {
    return "collectionId" in ref && !("method" in ref);
  }

  private isRequest(ref: Collection | Folder | RequestDoc): ref is RequestDoc {
    return "method" in ref;
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
