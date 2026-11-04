import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import { WorkspaceStore } from "../../state/workspace-store";
import { RowsEditor } from "./rows-editor/rows-editor";

/** The query parameters as rows. They mirror the query of the URL field. */
@Component({
  selector: "app-params-panel",
  imports: [RowsEditor],
  templateUrl: "./params-panel.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ParamsPanel {
  protected readonly store = inject(WorkspaceStore);
}
