import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { MatButton, MatIconButton } from "@angular/material/button";
import { MatCheckbox } from "@angular/material/checkbox";
import { MatFormField } from "@angular/material/form-field";
import { MatInput } from "@angular/material/input";
import { Icon } from "../../shared/icon/icon";
import { WorkspaceStore } from "../../state/workspace-store";

/** The query parameters as rows. They mirror the query of the URL field. */
@Component({
  selector: "app-params-panel",
  imports: [FormsModule, Icon, MatButton, MatIconButton, MatCheckbox, MatFormField, MatInput],
  templateUrl: "./params-panel.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ParamsPanel {
  protected readonly store = inject(WorkspaceStore);
}
