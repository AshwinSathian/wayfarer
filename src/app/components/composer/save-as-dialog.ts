import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { MatButton } from "@angular/material/button";
import { MatOption } from "@angular/material/core";
import { MatFormField } from "@angular/material/form-field";
import { MatInput } from "@angular/material/input";
import { MatSelect } from "@angular/material/select";
import { RequestSave } from "../../services/request-save";
import { WorkspaceStore } from "../../state/workspace-store";
import { Dialog } from "../../ui/dialog";

/** "Save to Collection": names the draft and picks where it goes. `RequestSave` holds its state. */
@Component({
  selector: "app-save-as-dialog",
  imports: [FormsModule, Dialog, MatButton, MatFormField, MatInput, MatSelect, MatOption],
  templateUrl: "./save-as-dialog.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SaveAsDialog {
  protected readonly requestSave = inject(RequestSave);
  private readonly store = inject(WorkspaceStore);

  protected async confirm(): Promise<void> {
    await this.requestSave.confirmSaveAs(this.store.snapshot(), this.store.scriptsAllowed());
  }
}
