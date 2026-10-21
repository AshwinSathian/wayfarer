import { ChangeDetectionStrategy, Component, effect, inject, input, output, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { UiButton } from "../../ui/button";
import { UiCheckbox } from "../../ui/checkbox";
import type { ExportNote } from "@wayfarer/core";
import { CollectionsStore } from "../../services/collections-store";
import { Icon } from "../../shared/icon/icon";
import { saveJsonFile } from "../../shared/save-file";
import { Dialog } from "../../ui/dialog";

/**
 * Exports a collection as a Postman Collection v2.1 file (P4.6 b), saying
 * first what of it Postman's format has no place for.
 */
@Component({
  selector: "app-postman-export-dialog",
  imports: [Dialog, FormsModule, Icon, UiButton, UiCheckbox],
  templateUrl: "./postman-export-dialog.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PostmanExportDialog {
  private readonly collections = inject(CollectionsStore);

  /** The collection to export. Null while the dialog is closed. */
  readonly collection = input<{ id: string; name: string } | null>(null);
  readonly closed = output<void>();

  protected readonly credentials = signal(false);
  protected readonly notes = signal<ExportNote[]>([]);

  constructor() {
    effect(() => {
      const collection = this.collection();
      this.credentials.set(false);
      this.notes.set([]);
      if (collection) void this.read(collection.id);
    });
  }

  /** What the file will leave out: the same whatever is chosen for credentials. */
  private async read(id: string): Promise<void> {
    const exported = await this.collections.exportCollectionPostman(id);
    if (this.collection()?.id === id) this.notes.set(exported?.notes ?? []);
  }

  protected async submit(): Promise<void> {
    const collection = this.collection();
    if (!collection) return;
    const exported = await this.collections.exportCollectionPostman(collection.id, { credentials: this.credentials() });
    if (exported)
      saveJsonFile(`${collection.name.replace(/\s+/g, "-").toLowerCase()}.postman_collection.json`, exported.json);
    this.closed.emit();
  }
}
