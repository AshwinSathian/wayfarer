import { ChangeDetectionStrategy, Component, computed, inject } from "@angular/core";
import type { Route } from "@wayfarer/core";
import { WorkspaceStore } from "../../state/workspace-store";
import { UiCheckbox } from "../../ui/checkbox";
import { UiSelect, type UiSelectOption } from "../../ui/select";

/**
 * The request's Settings tab: how it is sent (its route, P6.4; redirects,
 * P5.4; the certificate check, P6.1) and what the browser will do to it
 * (P2.14, `WorkspaceStore.browserLimits`). What will go wrong with it is
 * said above the request instead (`RequestWarnings`).
 */
@Component({
  selector: "app-browser-notes",
  imports: [UiCheckbox, UiSelect],
  templateUrl: "./browser-notes.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BrowserNotes {
  protected readonly store = inject(WorkspaceStore);
  private readonly routeNames = { auto: "Auto", direct: "Direct", bridge: "Local Bridge" } as const;
  protected readonly routes = computed<UiSelectOption<Route | null>[]>(() => [
    { value: null, label: `Inherit: ${this.routeNames[this.store.inheritedRoute()]}` },
    { value: "auto", label: "Auto" },
    { value: "direct", label: "Direct" },
    { value: "bridge", label: "Local Bridge" },
  ]);
  protected readonly docs = "https://github.com/AshwinSathian/wayfarer/blob/main/docs/browser-limits.md";
}
