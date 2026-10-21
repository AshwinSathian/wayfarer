import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { UiButton } from "../../ui/button";
import { UiInput } from "../../ui/input";
import { ASSERTION_TARGET_OPTIONS, needsExpected, needsKey, operatorsFor } from "../../shared/http/test-assertion-ui";
import { Icon } from "../../shared/icon/icon";
import { WorkspaceStore } from "../../state/workspace-store";
import { UiSelect } from "../../ui/select";

/** The visual test assertions: one row per check on the status, body, a header or the duration. */
@Component({
  selector: "app-tests-panel",
  imports: [FormsModule, Icon, UiButton, UiInput, UiSelect],
  templateUrl: "./tests-panel.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TestsPanel {
  protected readonly store = inject(WorkspaceStore);
  protected readonly assertionTargetOptions = ASSERTION_TARGET_OPTIONS;
  protected readonly operatorsFor = operatorsFor;
  protected readonly needsKey = needsKey;
  protected readonly needsExpected = needsExpected;
}
