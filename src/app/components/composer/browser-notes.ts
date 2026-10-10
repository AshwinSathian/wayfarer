import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import { MatAccordion, MatExpansionPanel, MatExpansionPanelHeader } from "@angular/material/expansion";
import { Icon } from "../../shared/icon/icon";
import { WorkspaceStore } from "../../state/workspace-store";

/**
 * What the browser will do to the request being composed (plan P2.14): the
 * two things that change what arrives are said outright, the rest is in a
 * section to open. All of it is `WorkspaceStore.browserLimits`.
 */
@Component({
  selector: "app-browser-notes",
  imports: [Icon, MatAccordion, MatExpansionPanel, MatExpansionPanelHeader],
  templateUrl: "./browser-notes.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BrowserNotes {
  protected readonly store = inject(WorkspaceStore);
  protected readonly docs = "https://github.com/AshwinSathian/wayfarer/blob/main/docs/browser-limits.md";
}
