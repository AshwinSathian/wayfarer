import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { Icon } from "../../shared/icon/icon";
import { SCRIPTS_DISABLED_ISSUE, SCRIPTS_ENABLED } from "../../shared/scripts/script-sandbox";
import { WorkspaceStore } from "../../state/workspace-store";
import { ScriptEditor } from "../script-editor/script-editor";
import { TestsPanel } from "./tests-panel";

/** The pre-request and post-response scripts, and the test assertions below them. */
@Component({
  selector: "app-scripts-panel",
  imports: [FormsModule, Icon, ScriptEditor, TestsPanel],
  templateUrl: "./scripts-panel.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScriptsPanel {
  protected readonly store = inject(WorkspaceStore);
  protected readonly scriptsEnabled = inject(SCRIPTS_ENABLED);
  protected readonly scriptsDisabledIssue = SCRIPTS_DISABLED_ISSUE;

  protected setScript(kind: "pre" | "post", text: string): void {
    this.store.patch({ scripts: { ...this.store.draft().scripts, [kind]: text } });
  }
}
