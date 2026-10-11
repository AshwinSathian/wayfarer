import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { MatButton } from "@angular/material/button";
import { MatCheckbox } from "@angular/material/checkbox";
import { writeToClipboard } from "../../shared/http/clipboard";
import { Icon } from "../../shared/icon/icon";
import { harText, type HarSource } from "../../shared/inspect/har-export";
import { saveJsonFile } from "../../shared/save-file";
import { Dialog } from "../../ui/dialog";

/** How much of the file the dialog shows: enough to read what will be written, without drawing megabytes. */
const PREVIEW_CHARS = 20_000;

/**
 * Exports exchanges as a HAR 1.2 file (P4.6 c), showing the file first: one
 * response from its Export menu, or the entries chosen in history. What is
 * shown is what is copied or saved, masked the same way.
 */
@Component({
  selector: "app-har-export-dialog",
  imports: [Dialog, FormsModule, Icon, MatButton, MatCheckbox],
  templateUrl: "./har-export-dialog.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HarExportDialog {
  /** What to export. Null while the dialog is closed. */
  readonly source = input<HarSource | null>(null);
  readonly closed = output<void>();

  protected readonly credentials = signal(false);
  protected readonly count = signal(0);
  private readonly text = signal("");
  protected readonly preview = computed(() => this.text().slice(0, PREVIEW_CHARS));
  protected readonly more = computed(() => Math.max(0, this.text().length - PREVIEW_CHARS));

  constructor() {
    // A dialog that opens starts masked, whatever the last one was left at.
    effect(() => {
      if (this.source()) this.credentials.set(false);
    });
    effect(() => {
      const source = this.source();
      const exchanges = source?.exchanges({ credentials: this.credentials() }) ?? [];
      this.count.set(exchanges.length);
      this.text.set("");
      if (source) void this.write(source, this.credentials());
    });
  }

  private async write(source: HarSource, credentials: boolean): Promise<void> {
    const text = await harText(source.exchanges({ credentials }));
    // Still the dialog and the choice this was made for.
    if (this.source() === source && this.credentials() === credentials) this.text.set(text);
  }

  protected async copy(): Promise<void> {
    await writeToClipboard(this.text());
    this.closed.emit();
  }

  protected save(): void {
    const source = this.source();
    if (source) saveJsonFile(`${source.name}.har`, this.text());
    this.closed.emit();
  }

  protected ready(): boolean {
    return this.text() !== "";
  }
}
