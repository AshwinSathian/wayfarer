import { Injectable, Signal, computed, inject, signal } from "@angular/core";
import { CollectionsStore } from "./collections-store";
import { RequestFiles } from "./request-files";
import { StoragePersistence } from "./storage-persistence";
import { scriptDigest, scriptsOf, type RequestContent } from "@wayfarer/core";
import { RequestDoc } from "../models/collections";

/** Everything the composer currently holds that's worth persisting onto a `RequestDoc`. */
export type RequestContentSnapshot = RequestContent;

/**
 * Owns the "is the composer bound to a saved collection request, and how do
 * I persist it" concern that used to live directly on the composer component
 * (loadedCollectionRequest + the whole Save-As dialog). Extracted as its own
 * service — same pattern as `RequestExecutor` — so this logic is
 * unit-testable against a mocked `CollectionsStore` without a component
 * harness, and so the composer component's own file is left holding just
 * "what's currently typed," not also "how does that get saved."
 */
@Injectable({ providedIn: "root" })
export class RequestSave {
  private readonly collectionsService = inject(CollectionsStore);
  private readonly files = inject(RequestFiles);
  private readonly persistence = inject(StoragePersistence);

  /**
   * The collection request the composer's current contents were loaded
   * from/last saved to, if any — null for a scratch request (typed from
   * blank, or reloaded from History). Drives whether "Save" writes back to
   * that request in place or opens "Save to Collection" to create a new one.
   */
  readonly loadedCollectionRequest = signal<RequestDoc | null>(null);
  readonly savingRequest = signal(false);
  readonly saveAsDialogVisible = signal(false);
  readonly saveAsName = signal("");
  readonly saveAsCollectionId = signal<string | null>(null);
  readonly saveAsFolderId = signal<string | null>(null);

  readonly saveAsCollectionOptions: Signal<{ label: string; value: string }[]> = computed(() =>
    this.collectionsService.tree().map((entry) => ({
      label: entry.collection.name,
      value: entry.collection.meta.id,
    }))
  );

  readonly saveAsFolderOptions: Signal<{ label: string; value: string }[]> = computed(() => {
    const collectionId = this.saveAsCollectionId();
    const entry = this.collectionsService
      .tree()
      .find((e) => e.collection.meta.id === collectionId);
    return (entry?.folders ?? []).map((folder) => ({
      label: folder.name,
      value: folder.meta.id,
    }));
  });

  get isSaveAsDisabled(): boolean {
    return !this.saveAsName().trim() || !this.saveAsCollectionId();
  }

  /** Binds (or clears, with `null`) the composer session to a saved request — call on load/new-request, not on every keystroke. */
  bind(doc: RequestDoc | null): void {
    this.loadedCollectionRequest.set(doc);
  }

  /**
   * The scripts being saved are the user's own when the composer's scripts
   * were allowed to run: they are approved in the collection they go to, if
   * that collection is trusted. Scripts that were waiting for a review stay
   * unapproved wherever they are saved (plan D6). Before the request is
   * written, so that it is never stored with a script not yet approved.
   */
  private async approveScripts(collectionId: string, snapshot: RequestContentSnapshot, scriptsAllowed: boolean): Promise<void> {
    const scripts = scriptsOf(snapshot);
    if (!scriptsAllowed || !scripts.length) return;
    await this.collectionsService.approveScripts(collectionId, await Promise.all(scripts.map(scriptDigest)), false);
  }

  /** Save: writes back in place if bound to an existing request, otherwise opens the Save-As dialog. `scriptsAllowed`: see `approveScripts`. */
  async save(snapshot: RequestContentSnapshot, scriptsAllowed: boolean): Promise<void> {
    const bound = this.loadedCollectionRequest();
    if (!bound) {
      this.openSaveAsDialog();
      return;
    }
    // Something worth keeping is being saved: ask the browser to keep it.
    void this.persistence.request();
    this.savingRequest.set(true);
    try {
      await this.approveScripts(bound.collectionId, snapshot, scriptsAllowed);
      const updated = await this.collectionsService.updateRequest(bound.meta.id, snapshot, this.files.unsaved(snapshot.body));
      if (updated) {
        this.loadedCollectionRequest.set(updated);
      }
    } finally {
      this.savingRequest.set(false);
    }
  }

  openSaveAsDialog(): void {
    const bound = this.loadedCollectionRequest();
    const options = this.saveAsCollectionOptions();
    this.saveAsName.set(bound?.name ?? "");
    this.saveAsCollectionId.set(bound?.collectionId ?? options[0]?.value ?? null);
    this.saveAsFolderId.set(bound?.folderId ?? null);
    this.saveAsDialogVisible.set(true);
  }

  closeSaveAsDialog(): void {
    this.saveAsDialogVisible.set(false);
  }

  onSaveAsCollectionChange(collectionId: string | null): void {
    this.saveAsCollectionId.set(collectionId);
    this.saveAsFolderId.set(null);
  }

  /** Creates a new collection request from the Save-As dialog's current fields, then binds the composer to it. */
  async confirmSaveAs(snapshot: RequestContentSnapshot, scriptsAllowed: boolean): Promise<void> {
    const collectionId = this.saveAsCollectionId();
    const name = this.saveAsName().trim();
    if (!collectionId || !name) {
      return;
    }
    void this.persistence.request();
    this.savingRequest.set(true);
    try {
      await this.approveScripts(collectionId, snapshot, scriptsAllowed);
      const doc = await this.collectionsService.createRequest(
        { ...snapshot, collectionId, folderId: this.saveAsFolderId() ?? undefined, name },
        this.files.unsaved(snapshot.body)
      );
      this.loadedCollectionRequest.set(doc);
      this.closeSaveAsDialog();
    } finally {
      this.savingRequest.set(false);
    }
  }
}
