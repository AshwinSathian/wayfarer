import { ChangeDetectionStrategy, Component, computed, inject } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { MatButton } from "@angular/material/button";
import { MatFormField } from "@angular/material/form-field";
import { MatInput } from "@angular/material/input";
import { RequestSave } from "../../services/request-save";
import { WorkspaceStore } from "../../state/workspace-store";
import { Dialog } from "../../ui/dialog";
import { UiSelect } from "../../ui/select";

/** "Save to Collection": names the draft and picks where it goes. `RequestSave` holds its state. */
@Component({
  selector: "app-save-as-dialog",
  imports: [FormsModule, Dialog, MatButton, MatFormField, MatInput, UiSelect],
  templateUrl: "./save-as-dialog.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SaveAsDialog {
  protected readonly requestSave = inject(RequestSave);
  private readonly store = inject(WorkspaceStore);
  protected readonly folderOptions = computed(() => [{ value: null, label: "No folder" }, ...this.requestSave.saveAsFolderOptions()]);

  protected async confirm(): Promise<void> {
    await this.requestSave.confirmSaveAs(this.store.snapshot(), this.store.scriptsAllowed());
  }
}
