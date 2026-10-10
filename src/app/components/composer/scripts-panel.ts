import { ChangeDetectionStrategy, Component, inject, signal } from "@angular/core";
import { MatButton } from "@angular/material/button";
import { FormsModule } from "@angular/forms";
import { Icon } from "../../shared/icon/icon";
import { WorkspaceStore } from "../../state/workspace-store";
import { ScriptEditor } from "../script-editor/script-editor";
import { ScriptReviewDialog } from "./script-review-dialog";
import { TestsPanel } from "./tests-panel";

/** The pre-request and post-response scripts, and the test assertions below them. */
@Component({
  selector: "app-scripts-panel",
  imports: [FormsModule, Icon, MatButton, ScriptEditor, ScriptReviewDialog, TestsPanel],
  templateUrl: "./scripts-panel.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScriptsPanel {
  protected readonly store = inject(WorkspaceStore);
  protected readonly reviewing = signal(false);

  protected setScript(kind: "pre" | "post", text: string): void {
    this.store.patch({ scripts: { ...this.store.draft().scripts, [kind]: text } });
  }
}
