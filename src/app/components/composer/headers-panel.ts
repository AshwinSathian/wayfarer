import { ChangeDetectionStrategy, Component, inject, signal } from "@angular/core";
import { MatButton } from "@angular/material/button";
import { MatFormField } from "@angular/material/form-field";
import { MatInput } from "@angular/material/input";
import { headerLines, rowsFromHeaderLines } from "../../shared/http/header-lines";
import { WorkspaceStore } from "../../state/workspace-store";
import { RowsEditor } from "./rows-editor/rows-editor";

/** The request headers: rows, or the same rows as text for pasting a block of them. */
@Component({
  selector: "app-headers-panel",
  imports: [MatButton, MatFormField, MatInput, RowsEditor],
  templateUrl: "./headers-panel.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HeadersPanel {
  protected readonly store = inject(WorkspaceStore);

  protected readonly bulk = signal(false);
  /** The text as typed. The rows are read from it on every change; it is written from them only when bulk edit opens. */
  protected readonly bulkText = signal("");

  protected toggleBulk(): void {
    if (!this.bulk()) {
      this.bulkText.set(headerLines(this.store.draft().headers));
    }
    this.bulk.update((open) => !open);
  }

  protected onBulkInput(text: string): void {
    this.bulkText.set(text);
    this.store.patch({ headers: rowsFromHeaderLines(text) });
    this.store.refreshVariablePreview();
  }
}
