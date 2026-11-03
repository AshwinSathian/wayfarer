import { SHORTCUTS, type Shortcut } from "../../shared/shortcuts";
import { MenuTrigger } from "@angular/aria/menu";
import { UndoNotice } from "../../services/undo-notice";
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  OnInit,
  afterNextRender,
  computed,
  signal,
  viewChild,
  WritableSignal,
  inject,
  output,
} from "@angular/core";
import { FormsModule } from "@angular/forms";
import { UiInput } from "../../ui/input";
import { UiButton } from "../../ui/button";
import { UiMenu } from "../../ui/menu";
import { UiMenuItem } from "../../ui/menu-item";
import { Dialog } from "../../ui/dialog";
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
import { CollectionNodeAction, buildContextItems } from "../../shared/collections/collection-context-menu";
import { Icon } from "../../shared/icon/icon";
import type { InheritedSettingsTarget } from "./inherited-settings-dialog";
import { ExportDialog } from "./export-dialog";
import type { RunTarget } from "../../state/run-state";
import { folderChain } from "@wayfarer/core";
import { UiSelect } from "../../ui/select";
import { UiTooltip } from "../../ui/tooltip";

type NodeData = CollectionNodeData;

export interface PaletteAction {
  id: string;
  label: string;
  /** Shown at the row's right, and in Settings › Shortcuts. */
  keys?: Shortcut;
  run: () => void | Promise<void>;
}

@Component({
  selector: "app-collections-sidebar",
  imports: [UiButton, UiInput, Icon, FormsModule, Tree, UiMenu, MenuTrigger, Dialog, UiTooltip, UiSelect, ExportDialog],
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

  readonly nodes = computed<UiTreeNode<NodeData>[]>(() => collectionsToNodes(this.collectionsService.tree()));
  readonly loading = this.collectionsService.loading;
  readonly selectedNode = signal<UiTreeNode<NodeData> | null>(null);
  readonly contextItems = signal<UiMenuItem[]>([]);
  /** Settings… of a collection or a folder: the shell holds the dialog, which a closed drawer could not show. */
  readonly openSettings = output<InheritedSettingsTarget>();
  /** The collection whose Export… dialog is open (U-016). */
  readonly exportOf = signal<{ id: string; name: string } | null>(null);
  readonly editingKey: WritableSignal<string | null> = signal(null);
  readonly editingValue = signal("");

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
    if (this.importPipeline.dialogVisible()) {
      return;
    }

    const target = event.target as HTMLElement | null;
    if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) {
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

  /** Selects a collection, a folder or a request in the tree, its parents opened, with focus on it (the palette). */
  reveal(key: string): void {
    this.tree()?.reveal(key);
  }

  /** What the palette offers from here: New collection, and what can be done to the selected row. */
  commands(): PaletteAction[] {
    const actions: PaletteAction[] = [
      { id: "new-collection", label: "New collection", run: () => this.handleCreateCollection() },
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
          label: `New folder in ${data.ref.name}`,
          run: () => this.createFolderPrompt(data.ref.meta.id),
        },
        {
          // Not "new-request": that is the shell's own action, in the same list, and two rows of one id are drawn as one (NG0955).
          id: "new-request-collection",
          label: `New request in ${data.ref.name}`,
          run: () => this.createRequestPrompt(data.ref.meta.id),
        },
        {
          id: "duplicate-collection",
          label: `Duplicate ${data.ref.name}`,
          run: () => this.duplicateNode({ type: "collection", ref: data.ref }),
        },
        {
          id: "export-collection",
          label: `Export ${data.ref.name}…`,
          run: () => this.exportCollection(node),
        },
        {
          id: "delete-collection",
          label: `Delete ${data.ref.name}`,
          run: () => this.handleAction("delete", node),
        },
      );
    }
    if (data.type === "folder") {
      const folder = data.ref;
      actions.push(
        {
          id: "new-request-folder",
          label: `New request in ${folder.name}`,
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
        },
      );
    }
    if (data.type === "request") {
      const request = data.ref;
      actions.push(
        {
          id: "duplicate-request",
          label: `Duplicate ${request.name || request.url}`,
          run: () => this.duplicateNode(data),
        },
        {
          id: "delete-request",
          label: `Delete ${request.name || request.url}`,
          run: () => this.handleAction("delete", node),
        },
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
    this.contextItems.set(buildContextItems(node, (action, target) => this.dispatchContextAction(action, target)));
  }

  private dispatchContextAction(action: CollectionNodeAction, node: UiTreeNode<NodeData>): void {
    if (action === "export") {
      this.exportCollection(node);
      return;
    }
    if (action === "run") {
      const data = node.data as NodeData;
      const tree =
        data.type === "request"
          ? undefined
          : this.collectionsService
              .tree()
              .find(
                (entry) =>
                  entry.collection.meta.id === (data.type === "collection" ? data.ref.meta.id : data.ref.collectionId),
              );
      if (!tree) return;
      // A folder's run is named with the folders it is in, as a request's breadcrumb is.
      if (data.type === "folder")
        this.run.emit({
          collectionId: tree.collection.meta.id,
          folderId: data.ref.meta.id,
          name: [
            tree.collection.name,
            ...folderChain(tree.folders, data.ref.meta.id).map((folder) => folder.name),
          ].join(" / "),
        });
      else this.run.emit({ collectionId: tree.collection.meta.id, name: tree.collection.name });
      return;
    }
    if (action === "settings") {
      const data = node.data as NodeData;
      if (data.type === "collection") this.openSettings.emit({ collectionId: data.ref.meta.id });
      else if (data.type === "folder")
        this.openSettings.emit({ collectionId: data.ref.collectionId, folderId: data.ref.meta.id });
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
  protected readonly shortcuts = SHORTCUTS;
  private readonly tree = viewChild<Tree<NodeData>>("tree");
  private readonly undo = inject(UndoNotice);

  /** The header's Import menu (U-010): a file, or a cURL command pasted. */
  protected readonly importItems: UiMenuItem[] = [
    { label: "File…", icon: "upload_file", command: () => this.fileInput()?.nativeElement.click() },
    { label: "cURL command…", icon: "terminal", command: () => this.importPipeline.openPaste() },
  ];

  /** The header's New menu (U-010, U-102): a collection, and a request or a folder where the selected row is. */
  protected readonly newItems = computed<UiMenuItem[]>(() => {
    const data = this.selectedNode()?.data as NodeData | undefined;
    const collectionId = data ? (data.type === "collection" ? data.ref.meta.id : data.ref.collectionId) : null;
    const folderId =
      data?.type === "folder" ? data.ref.meta.id : data?.type === "request" ? data.ref.folderId : undefined;
    return [
      { label: "Collection", icon: "folder_open", keys: "C", command: () => void this.handleCreateCollection() },
      ...(collectionId
        ? [
            {
              label: "Request",
              icon: "add" as const,
              keys: "N",
              command: () => void this.createRequestPrompt(collectionId, folderId ?? undefined),
            },
            { label: "Folder", icon: "folder" as const, command: () => void this.createFolderPrompt(collectionId) },
          ]
        : []),
    ];
  });
  private readonly fileInput = viewChild<ElementRef<HTMLInputElement>>("fileInput");

  private emitLoadRequest(doc: RequestDoc): void {
    this.loadRequest.emit(doc);
  }

  /** Saves the new order of a node's siblings after a drag and drop or an Alt+Arrow move. */
  async handleReorder(event: { node: UiTreeNode<NodeData>; siblings: UiTreeNode<NodeData>[] }): Promise<void> {
    const order = event.siblings.map((sibling, index) => ({ id: sibling.data.ref.meta.id, order: index + 1 }));
    return event.node.data.type === "collection"
      ? this.collectionsService.reorderCollections(order)
      : this.collectionsService.reorderChildren(order);
  }

  /** A collection is moved among collections; a folder or a request among the folders and requests of its parent, which share one order. */
  readonly nodeKind = (node: UiTreeNode<NodeData>): string =>
    node.data.type === "collection" ? "collection" : "child";

  beginRename(node: UiTreeNode<NodeData>): void {
    this.editingKey.set(node.key ?? null);
    this.editingValue.set(node.label ?? "");
    afterNextRender(
      () => {
        const field = this.host.nativeElement.querySelector<HTMLInputElement>('[role="tree"] input');
        field?.focus();
        field?.select();
      },
      { injector: this.injector },
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
    action: Exclude<CollectionNodeAction, "export" | "settings" | "run">,
    node: UiTreeNode<NodeData>,
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

  private async createRequestPrompt(collectionId: string, folderId?: string): Promise<void> {
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

  /**
   * Deletes at once and offers Undo for a few seconds (U-080): a confirm asked first and named nothing ("Delete
   * item?", U-056). The line says what went, a folder's contents too.
   */
  private async deleteNode(data: NodeData): Promise<void> {
    const name = data.type === "request" ? data.ref.name || data.ref.url : data.ref.name;
    const inside = data.type === "folder" ? this.insideFolder(data.ref) : "";
    const removed =
      data.type === "collection"
        ? await this.collectionsService.deleteCollection(data.ref.meta.id)
        : data.type === "folder"
          ? await this.collectionsService.deleteFolder(data.ref.meta.id)
          : await this.collectionsService.deleteRequest(data.ref.meta.id);
    this.selectedNode.set(null);
    this.undo.offer(`Deleted ${name}.${inside ? ` ${inside}` : ""}`, () => this.collectionsService.restore(removed));
  }

  /** What a folder's deletion takes with it, as a sentence; nothing for an empty folder. */
  private insideFolder(folder: Folder): string {
    const tree = this.collectionsService.tree().find((entry) => entry.collection.meta.id === folder.collectionId);
    const within = (folderId: string | undefined) =>
      folderChain(tree?.folders ?? [], folderId).some((entry) => entry.meta.id === folder.meta.id);
    const folders = (tree?.folders ?? []).filter(
      (entry) => entry.meta.id !== folder.meta.id && within(entry.meta.id),
    ).length;
    const requests = (tree?.requests ?? []).filter((request) => within(request.folderId)).length;
    if (folders + requests === 0) return "";
    const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;
    const parts = [...(folders ? [count(folders, "folder")] : []), ...(requests ? [count(requests, "request")] : [])];
    return `The ${parts.join(" and ")} in it went with it.`;
  }

  /** Opens the one Export… dialog, which asks the format and whether to include credentials (U-016). */
  private exportCollection(node: UiTreeNode<NodeData>): void {
    const data = node.data as NodeData;
    if (data.type === "collection") this.exportOf.set({ id: data.ref.meta.id, name: data.ref.name });
  }

  get creationTitle(): string {
    switch (this.creationContext()?.type) {
      case "collection":
        return "New collection";
      case "folder":
        return "New folder";
      case "request":
        return "New request";
      default:
        return "New request";
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
