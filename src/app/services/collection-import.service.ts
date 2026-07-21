import { Injectable, inject, signal } from "@angular/core";
import { CollectionsService } from "./collections.service";
import { CollectionExport } from "../models/collections.models";
import {
  CollectionImportResult,
  importCollection as planCollectionImport,
  validateCollection,
  ValidationResult,
} from "../shared/collections/collection-io.util";

/**
 * Owns the "import a collection JSON file" dialog's state and the
 * validate -> preview-analysis -> confirm pipeline, previously all directly
 * on `CollectionsSidebarComponent`. Same extraction pattern as
 * `RequestSaveService` — the file-picked/validated/analyzed/confirmed flow
 * is independently testable against a mocked `CollectionsService`.
 */
@Injectable({ providedIn: "root" })
export class CollectionImportService {
  private readonly collectionsService = inject(CollectionsService);

  readonly dialogVisible = signal(false);
  readonly errors = signal<ValidationResult[]>([]);
  readonly analysis = signal<CollectionImportResult | null>(null);
  readonly sourcePayload = signal<CollectionExport | null>(null);
  readonly duplicateAsNew = signal(false);
  readonly fileName = signal("");

  /** Validates a picked file's text and stages it for the preview dialog. */
  stageFile(fileName: string, text: string): void {
    const validation = validateCollection(text);
    if (!validation.ok || !validation.payload) {
      this.errors.set(
        validation.errors ?? [{ path: "root", message: "Invalid collection export." }]
      );
      this.sourcePayload.set(null);
      this.analysis.set(null);
    } else {
      this.errors.set([]);
      this.sourcePayload.set(validation.payload);
      this.refreshAnalysis();
    }
    this.fileName.set(fileName);
    this.dialogVisible.set(true);
  }

  toggleDuplicateAsNew(value: boolean): void {
    this.duplicateAsNew.set(value);
    this.refreshAnalysis();
  }

  async confirm(): Promise<void> {
    const analysis = this.analysis();
    if (!analysis?.payload || this.errors().length) {
      this.close();
      return;
    }
    await this.collectionsService.importCollection(analysis.payload, {
      duplicateAsNew: this.duplicateAsNew(),
    });
    this.close();
  }

  close(): void {
    this.dialogVisible.set(false);
    this.errors.set([]);
    this.sourcePayload.set(null);
    this.analysis.set(null);
    this.duplicateAsNew.set(false);
    this.fileName.set("");
  }

  private refreshAnalysis(): void {
    const payload = this.sourcePayload();
    if (!payload) {
      this.analysis.set(null);
      return;
    }
    const analysis = planCollectionImport(payload, { duplicateAsNew: this.duplicateAsNew() });
    this.analysis.set(analysis);
    this.errors.set(analysis.errors ?? []);
  }
}
