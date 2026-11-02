import { ChangeDetectionStrategy, Component, effect, inject, input, output, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { UiButton } from "../../ui/button";
import { UiCheckbox } from "../../ui/checkbox";
import type { ExportNote } from "@wayfarer/core";
import { CollectionsStore } from "../../services/collections-store";
import { Icon } from "../../shared/icon/icon";
import { saveJsonFile } from "../../shared/save-file";
import { Dialog } from "../../ui/dialog";
import { UiSegmented } from "../../ui/segmented";

export type ExportFormat = "wayfarer" | "postman";

/**
 * A collection's one Export… (U-016, ia.md): the format, Wayfarer's own or a Postman Collection v2.1 file (P4.6 b),
 * and the credentials, masked unless "Include credentials" is ticked. A Postman file first says what of the
 * collection its format has no place for.
 */
@Component({
  selector: "app-export-dialog",
  imports: [Dialog, FormsModule, Icon, UiButton, UiCheckbox, UiSegmented],
  templateUrl: "./export-dialog.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExportDialog {
  private readonly collections = inject(CollectionsStore);

  /** The collection to export. Null while the dialog is closed. */
  readonly collection = input<{ id: string; name: string } | null>(null);
  readonly closed = output<void>();

  protected readonly formats = [
    { label: "Wayfarer", value: "wayfarer" as ExportFormat },
    { label: "Postman v2.1", value: "postman" as ExportFormat },
  ];
  protected readonly format = signal<ExportFormat>("wayfarer");
  protected readonly credentials = signal(false);
  protected readonly notes = signal<ExportNote[]>([]);

  constructor() {
    // Each opening starts from the safe choice: Wayfarer's format, credentials masked.
    effect(() => {
      const collection = this.collection();
      this.format.set("wayfarer");
      this.credentials.set(false);
      this.notes.set([]);
      if (collection) void this.read(collection.id);
    });
  }

  /** What a Postman file would leave out: the same whatever is chosen for credentials. */
  private async read(id: string): Promise<void> {
    const exported = await this.collections.exportCollectionPostman(id);
    if (this.collection()?.id === id) this.notes.set(exported?.notes ?? []);
  }

  protected async submit(): Promise<void> {
    const collection = this.collection();
    if (!collection) return;
    const base = collection.name.replace(/\s+/g, "-").toLowerCase();
    const credentials = this.credentials();
    if (this.format() === "postman") {
      const exported = await this.collections.exportCollectionPostman(collection.id, { credentials });
      if (exported) saveJsonFile(`${base}.postman_collection.json`, exported.json);
    } else {
      const json = await this.collections.exportCollectionJson(collection.id, { credentials });
      if (json) saveJsonFile(`${base}-collection.json`, json);
    }
    this.closed.emit();
  }
}
