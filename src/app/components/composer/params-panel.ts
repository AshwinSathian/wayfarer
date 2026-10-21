import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { UiButton } from "../../ui/button";
import { MatCheckbox } from "@angular/material/checkbox";
import { UiInput } from "../../ui/input";
import { Icon } from "../../shared/icon/icon";
import { WorkspaceStore } from "../../state/workspace-store";

/** The query parameters as rows. They mirror the query of the URL field. */
@Component({
  selector: "app-params-panel",
  imports: [FormsModule, Icon, UiButton, MatCheckbox, UiInput],
  templateUrl: "./params-panel.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ParamsPanel {
  protected readonly store = inject(WorkspaceStore);
}
