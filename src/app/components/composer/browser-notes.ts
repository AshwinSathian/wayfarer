import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import { MatCheckbox } from "@angular/material/checkbox";
import { MatOption } from "@angular/material/core";
import { MatSelect } from "@angular/material/select";
import { WorkspaceStore } from "../../state/workspace-store";

/**
 * The request's Settings tab: how it is sent (its route, P6.4; redirects,
 * P5.4; the certificate check, P6.1) and what the browser will do to it
 * (P2.14, `WorkspaceStore.browserLimits`). What will go wrong with it is
 * said above the request instead (`RequestWarnings`).
 */
@Component({
  selector: "app-browser-notes",
  imports: [MatCheckbox, MatOption, MatSelect],
  templateUrl: "./browser-notes.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BrowserNotes {
  protected readonly store = inject(WorkspaceStore);
  protected readonly routeNames = { auto: "Auto", direct: "Direct", bridge: "Local Bridge" } as const;
  protected readonly docs = "https://github.com/AshwinSathian/wayfarer/blob/main/docs/browser-limits.md";
}
