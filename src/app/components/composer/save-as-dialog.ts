import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  computed,
  inject,
  viewChild,
} from "@angular/core";
import { UiButton } from "../../ui/button";
import { UiInput } from "../../ui/input";
import { RequestSave } from "../../services/request-save";
import { WorkspaceStore } from "../../state/workspace-store";
import { Dialog } from "../../ui/dialog";
import { UiSelect } from "../../ui/select";

/** "Save to collection": names the draft and picks where it goes. `RequestSave` holds its state. */
@Component({
  selector: "app-save-as-dialog",
  imports: [Dialog, UiButton, UiInput, UiSelect],
  templateUrl: "./save-as-dialog.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SaveAsDialog {
  protected readonly requestSave = inject(RequestSave);
  private readonly store = inject(WorkspaceStore);
  protected readonly folderOptions = computed(() => [
    { value: null, label: "No folder" },
    ...this.requestSave.saveAsFolderOptions(),
  ]);
  private readonly nameField = viewChild<ElementRef<HTMLInputElement>>("nameField");

  constructor() {
    // Each time the dialog opens, the name is selected, so a key replaces it (U-177). The field is projected content,
    // made with the page: it is the opening that is followed, not the field.
    afterRenderEffect(() => {
      const field = this.nameField()?.nativeElement;
      if (!this.requestSave.saveAsDialogVisible() || !field) return;
      field.focus();
      field.select();
    });
  }

  protected async confirm(): Promise<void> {
    await this.requestSave.confirmSaveAs(this.store.snapshot(), this.store.scriptsAllowed());
  }
}
