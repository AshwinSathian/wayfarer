import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { Icon } from "../../shared/icon/icon";
import { RowContext, WorkspaceStore } from "../../state/workspace-store";
import { JsonEditor } from "../json-editor/json-editor";
import { ApiParamsBasic } from "./basic-editor/basic-editor";
import { ComposerView } from "./composer-view";

/** The JSON body of a POST, PUT or PATCH: rows, or the whole object in JSON mode. */
@Component({
  selector: "app-body-panel",
  imports: [FormsModule, Icon, JsonEditor, ApiParamsBasic],
  templateUrl: "./body-panel.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BodyPanel {
  protected readonly store = inject(WorkspaceStore);
  protected readonly view = inject(ComposerView);

  protected readonly addItem = (ctx: RowContext): void => this.store.addRow(ctx);
  protected readonly removeItem = (index: number, ctx: RowContext): void => this.store.removeRow(index, ctx);
  protected readonly isAddDisabled = (ctx: RowContext): boolean => this.store.isAddDisabled(ctx);
  protected readonly disableItem = (): boolean => false;
}
