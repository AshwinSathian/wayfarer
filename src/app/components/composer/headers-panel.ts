import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { Icon } from "../../shared/icon/icon";
import { BodyRow, DEFAULT_HEADER_KEY, RowContext, WorkspaceStore } from "../../state/workspace-store";
import { JsonEditor } from "../json-editor/json-editor";
import { ApiParamsBasic } from "./basic-editor/basic-editor";
import { ComposerView } from "./composer-view";

/** The request headers: rows, or one JSON object in JSON mode. The Content-Type row keeps its name. */
@Component({
  selector: "app-headers-panel",
  imports: [FormsModule, Icon, JsonEditor, ApiParamsBasic],
  templateUrl: "./headers-panel.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HeadersPanel {
  protected readonly store = inject(WorkspaceStore);
  protected readonly view = inject(ComposerView);

  protected readonly addItem = (ctx: RowContext): void => this.store.addRow(ctx);
  protected readonly removeItem = (index: number, ctx: RowContext): void => this.store.removeRow(index, ctx);
  protected readonly isAddDisabled = (ctx: RowContext): boolean => this.store.isAddDisabled(ctx);
  protected readonly disableItem = (item: BodyRow): boolean => item.key === DEFAULT_HEADER_KEY;
}
