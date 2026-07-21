import { Injectable, Signal, computed, inject, signal } from "@angular/core";
import { CollectionsService } from "./collections.service";
import { HttpAuthPlaceholder, RequestDoc } from "../models/collections.models";
import { PastRequest } from "../models/history.models";
import { TestAssertion } from "../models/test-assertion.models";

/** Everything the composer currently holds that's worth persisting onto a `RequestDoc`. */
export interface RequestContentSnapshot {
  method: PastRequest["method"];
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown> | undefined;
  auth: HttpAuthPlaceholder;
  preRequestScript: string;
  postRequestScript: string;
  tests: TestAssertion[];
}

/**
 * Owns the "is the composer bound to a saved collection request, and how do
 * I persist it" concern that used to live directly on `ApiParamsComponent`
 * (loadedCollectionRequest + the whole Save-As dialog). Extracted as its own
 * service — same pattern as `RequestExecutionService` — so this logic is
 * unit-testable against a mocked `CollectionsService` without a component
 * harness, and so the composer component's own file is left holding just
 * "what's currently typed," not also "how does that get saved."
 */
@Injectable({ providedIn: "root" })
export class RequestSaveService {
  private readonly collectionsService = inject(CollectionsService);

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

  /** Save: writes back in place if bound to an existing request, otherwise opens the Save-As dialog. */
  async save(snapshot: RequestContentSnapshot): Promise<void> {
    const bound = this.loadedCollectionRequest();
    if (!bound) {
      this.openSaveAsDialog();
      return;
    }
    this.savingRequest.set(true);
    try {
      const updated = await this.collectionsService.updateRequest(bound.meta.id, snapshot);
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
  async confirmSaveAs(snapshot: RequestContentSnapshot): Promise<void> {
    const collectionId = this.saveAsCollectionId();
    const name = this.saveAsName().trim();
    if (!collectionId || !name) {
      return;
    }
    this.savingRequest.set(true);
    try {
      const doc = await this.collectionsService.createRequest({
        collectionId,
        folderId: this.saveAsFolderId() ?? undefined,
        name,
        method: snapshot.method,
        url: snapshot.url,
        headers: snapshot.headers,
        body: snapshot.body,
      });
      const updated = await this.collectionsService.updateRequest(doc.meta.id, {
        auth: snapshot.auth,
        preRequestScript: snapshot.preRequestScript,
        postRequestScript: snapshot.postRequestScript,
        tests: snapshot.tests,
      });
      this.loadedCollectionRequest.set(updated ?? doc);
      this.closeSaveAsDialog();
    } finally {
      this.savingRequest.set(false);
    }
  }
}
