import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Injector, OnInit, afterNextRender, computed, signal, WritableSignal, inject, input, output } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { MatFormField } from "@angular/material/form-field";
import { MatInput } from "@angular/material/input";
import { MatButton, MatIconButton } from "@angular/material/button";
import { UiMenu } from "../../ui/menu";
import { UiMenuItem } from "../../ui/menu-item";
import { Confirm } from "../../ui/confirm";
import { Dialog } from "../../ui/dialog";
import { MatOption } from "@angular/material/core";
import { MatSelect } from "@angular/material/select";
import { Tree, UiTreeNode } from "../../ui/tree";
import { Folder, RequestDoc } from "../../models/collections";
import { CollectionsStore } from "../../services/collections-store";
import { ImportPipeline } from "../../services/import-pipeline";
import { HTTP_METHODS } from "@wayfarer/core";
import {
  CollectionNodeData,
  collectionsToNodes,
  isCollectionRef,
  isFolderRef,
  methodLabel,
} from "../../shared/collections/collection-tree-nodes";
import {
  CollectionNodeAction,
  buildContextItems,
} from "../../shared/collections/collection-context-menu";
import { Icon } from "../../shared/icon/icon";
import { InheritedSettingsDialog, type InheritedSettingsTarget } from "./inherited-settings-dialog";
import { PostmanExportDialog } from "./postman-export-dialog";
import { saveJsonFile } from "../../shared/save-file";
import type { RunTarget } from "../../state/run-state";
import { folderChain } from "@wayfarer/core";

type NodeData = CollectionNodeData;

export interface PaletteAction {
  id: string;
  label: string;
  run: () => void | Promise<void>;
}

@Component({
  selector: "app-collections-sidebar",
  imports: [MatIconButton, MatFormField, MatInput, 
    Icon,
    FormsModule,
    Tree,
    UiMenu,
    MatButton,
    Dialog,
    MatSelect, MatOption,
    InheritedSettingsDialog,
    PostmanExportDialog,
  ],
  templateUrl: "./collections-sidebar.html",
  styleUrl: "./collections-sidebar.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
// ~570 lines: tree-node building/type guards moved to
// shared/collections/collection-tree-nodes.ts, context-menu building to
// shared/collections/collection-context-menu.ts, and the import-dialog
// pipeline to CollectionImport (mirrors RequestSave). What's
// left is the sidebar's actual job: tree selection/drag-drop/rename/CRUD
// dispatch, the command palette (registers its own + externally-supplied
// actions and filters them), and the creation dialog - all genuinely
// sidebar-owned interaction state, not extractable without just relocating
// the same coupling elsewhere.
export class CollectionsSidebar implements OnInit {
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);
  private readonly injector = inject(Injector);
  private readonly collectionsService = inject(CollectionsStore);
  private readonly confirm = inject(Confirm);
  /** Every file picked here goes down the one import road (P4.1). */
  protected readonly importPipeline = inject(ImportPipeline);

  constructor() {
    // Read on the way down, before the tree's own keys: Aria's tree stops every key it
    // handles, a letter among them, so "c" and "n" on a row never reached the window.
    const keydown = (event: KeyboardEvent) => this.handleGlobalKeydown(event);
    window.addEventListener("keydown", keydown, true);
    inject(DestroyRef).onDestroy(() => window.removeEventListener("keydown", keydown, true));
  }

  readonly loadRequest = output<RequestDoc>();
  /** "Run…" was chosen for a collection or a folder (P5.2): the composer opens the run's tab. */
  readonly run = output<RunTarget>();
  /** App-shell-owned commands (theme, history, composer, bridge, ...) the palette can't build itself since it has no access to those services/components. */
  readonly externalActions = input<PaletteAction[]>([]);

  readonly nodes = computed<UiTreeNode<NodeData>[]>(() =>
    collectionsToNodes(this.collectionsService.tree())
  );
  readonly loading = this.collectionsService.loading;
  readonly selectedNode = signal<UiTreeNode<NodeData> | null>(null);
  readonly contextItems = signal<UiMenuItem[]>([]);
  /** The collection or the folder whose settings are open. */
  readonly settingsOf = signal<InheritedSettingsTarget | null>(null);
  /** The collection whose Postman export dialog is open. */
  readonly postmanExportOf = signal<{ id: string; name: string } | null>(null);
  readonly editingKey: WritableSignal<string | null> = signal(null);
  readonly editingValue = signal("");

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
    method: "GET",
  });
  readonly methodOptions = HTTP_METHODS.map((method) => ({ label: method, value: method }));

  ngOnInit(): void {
    void this.collectionsService.ensureLoaded();
  }

  async handleCreateCollection(): Promise<void> {
    this.openCreationDialog({ type: "collection" });
  }

  handleGlobalKeydown(event: KeyboardEvent): void {
    if (this.importPipeline.dialogVisible() || this.commandPaletteVisible()) {
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

    // Single-key shortcuts act only while focus is in this panel (WCAG 2.1.4):
    // otherwise "c", "n" or Delete pressed anywhere, e.g. on a dialog button
    // or with speech input, would create or delete things here.
    if (!target || !this.host.nativeElement.contains(target)) {
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
          // Not "new-request": that is the shell's own action, in the same list, and two rows of one id are drawn as one (NG0955).
          id: "new-request-collection",
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
    if (action === "export" || action === "export-credentials") {
      void this.exportCollection(node, action === "export-credentials");
      return;
    }
    if (action === "export-postman") {
      const data = node.data as NodeData;
      if (data.type === "collection") this.postmanExportOf.set({ id: data.ref.meta.id, name: data.ref.name });
      return;
    }
    if (action === "run") {
      const data = node.data as NodeData;
      const tree = data.type === "request" ? undefined : this.collectionsService.tree().find((entry) => entry.collection.meta.id === (data.type === "collection" ? data.ref.meta.id : data.ref.collectionId));
      if (!tree) return;
      // A folder's run is named with the folders it is in, as a request's breadcrumb is.
      if (data.type === "folder") this.run.emit({ collectionId: tree.collection.meta.id, folderId: data.ref.meta.id, name: [tree.collection.name, ...folderChain(tree.folders, data.ref.meta.id).map((folder) => folder.name)].join(" / ") });
      else this.run.emit({ collectionId: tree.collection.meta.id, name: tree.collection.name });
      return;
    }
    if (action === "settings") {
      const data = node.data as NodeData;
      if (data.type === "collection") this.settingsOf.set({ collectionId: data.ref.meta.id });
      else if (data.type === "folder") this.settingsOf.set({ collectionId: data.ref.collectionId, folderId: data.ref.meta.id });
      return;
    }
    void this.handleAction(action, node);
  }

  handleNodeOpen(tree: Tree<NodeData>, node: UiTreeNode<NodeData>, keyboard: boolean): void {
    const data = node.data as NodeData | undefined;
    if (data?.type === "request" && this.editingKey() !== node.key) {
      this.emitLoadRequest(data.ref);
      // Opened from the keyboard, the user goes on walking the tree: focus comes back to the row.
      if (keyboard) afterNextRender(() => tree.focusNode(node.key), { injector: this.injector });
    }
  }

  protected readonly methodLabel = methodLabel;

  private emitLoadRequest(doc: RequestDoc): void {
    this.loadRequest.emit(doc);
  }

  /** Saves the new order of a node's siblings after a drag and drop or an Alt+Arrow move. */
  async handleReorder(event: { node: UiTreeNode<NodeData>; siblings: UiTreeNode<NodeData>[] }): Promise<void> {
    const order = event.siblings.map((sibling, index) => ({ id: sibling.data.ref.meta.id, order: index + 1 }));
    return event.node.data.type === "collection" ? this.collectionsService.reorderCollections(order) : this.collectionsService.reorderChildren(order);
  }

  /** A collection is moved among collections; a folder or a request among the folders and requests of its parent, which share one order. */
  readonly nodeKind = (node: UiTreeNode<NodeData>): string => (node.data.type === "collection" ? "collection" : "child");

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
  async endRename(tree: Tree<NodeData>, node: UiTreeNode<NodeData>, event: Event, commit: boolean): Promise<void> {
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
    action: Exclude<CollectionNodeAction, "export" | "export-credentials" | "export-postman" | "settings" | "run">,
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
      message: `${data.type === "folder" ? this.insideFolder(data.ref) : ""}This action cannot be undone. Continue?`,
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

  /** What a folder's deletion takes with it, as a sentence; nothing for an empty folder. */
  private insideFolder(folder: Folder): string {
    const tree = this.collectionsService.tree().find((entry) => entry.collection.meta.id === folder.collectionId);
    const within = (folderId: string | undefined) => folderChain(tree?.folders ?? [], folderId).some((entry) => entry.meta.id === folder.meta.id);
    const folders = (tree?.folders ?? []).filter((entry) => entry.meta.id !== folder.meta.id && within(entry.meta.id)).length;
    const requests = (tree?.requests ?? []).filter((request) => within(request.folderId)).length;
    if (folders + requests === 0) return "";
    const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;
    const parts = [...(folders ? [count(folders, "folder")] : []), ...(requests ? [count(requests, "request")] : [])];
    return `Folder "${folder.name}" is deleted with the ${parts.join(" and ")} in it. `;
  }

  private async exportCollection(node: UiTreeNode<NodeData>, credentials = false): Promise<void> {
    const data = node.data as NodeData;
    if (data.type !== "collection") {
      return;
    }
    const json = await this.collectionsService.exportCollectionJson(data.ref.meta.id, { credentials });
    if (!json) {
      return;
    }
    saveJsonFile(`${data.ref.name.replace(/\s+/g, "-").toLowerCase()}-collection.json`, json);
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

  onCreationMethodChange(value: string): void {
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
