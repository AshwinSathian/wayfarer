import { ChangeDetectionStrategy, Component, inject, input, output, viewChild } from "@angular/core";
import { MatAccordion, MatExpansionPanel, MatExpansionPanelHeader } from "@angular/material/expansion";
import { MatButtonToggle, MatButtonToggleGroup } from "@angular/material/button-toggle";
import { MatTabLink, MatTabNav, MatTabNavPanel } from "@angular/material/tabs";
import { RequestDoc } from "../../models/collections";
import { PastRequest } from "../../models/history";
import { RequestSave } from "../../services/request-save";
import { Icon } from "../../shared/icon/icon";
import { WorkspaceStore, isBodyMethod } from "../../state/workspace-store";
import { Splitter } from "../../ui/splitter";
import { ResponseViewer } from "../response-viewer/response-viewer";
import { AddressRow } from "./address-row";
import { AuthPanel } from "./auth-panel";
import { BodyPanel } from "./body-panel";
import { ComposerView, EditorMode } from "./composer-view";
import { HeadersPanel } from "./headers-panel";
import { ParamsPanel } from "./params-panel";
import { SaveAsDialog } from "./save-as-dialog";
import { ScriptsPanel } from "./scripts-panel";
import { VariableChips } from "./variable-chips";

/**
 * The request composer: the address row, one panel per part of the request,
 * and the response beside or below them. The request itself is the draft in
 * `WorkspaceStore`; `ComposerView` holds which panel is open.
 */
@Component({
  selector: "app-composer",
  imports: [
    Icon,
    MatAccordion,
    MatExpansionPanel,
    MatExpansionPanelHeader,
    MatButtonToggleGroup,
    MatButtonToggle,
    MatTabNav,
    MatTabLink,
    MatTabNavPanel,
    Splitter,
    ResponseViewer,
    AddressRow,
    VariableChips,
    ParamsPanel,
    HeadersPanel,
    BodyPanel,
    AuthPanel,
    ScriptsPanel,
    SaveAsDialog,
  ],
  providers: [ComposerView],
  templateUrl: "./composer.html",
  styleUrl: "./composer.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Composer {
  protected readonly store = inject(WorkspaceStore);
  protected readonly view = inject(ComposerView);
  private readonly requestSave = inject(RequestSave);

  readonly newRequest = output<void>();

  /**
   * Threaded down from App via AppShell — the same signal that drives the
   * collections sidebar's drawer, so the composer/response layout has
   * exactly one source of truth for the breakpoint.
   */
  readonly isMobile = input(false);

  private readonly addressRow = viewChild.required(AddressRow);

  protected readonly loadedCollectionRequest = this.requestSave.loadedCollectionRequest;
  protected readonly editorModeOptions: { label: string; value: EditorMode }[] = [
    { label: "Basic", value: "basic" },
    { label: "JSON", value: "json" },
  ];

  protected get hasBody(): boolean {
    return isBodyMethod(this.store.draft().method);
  }

  focusUrl(): void {
    this.addressRow().focusUrl();
  }

  loadPastRequest(request: PastRequest): void {
    this.view.loadPastRequest(request);
  }

  loadCollectionRequest(doc: RequestDoc): void {
    this.view.loadCollectionRequest(doc);
  }

  clearComposer(): void {
    this.view.clear();
  }

  async sendRequest(): Promise<void> {
    if (await this.store.send()) {
      this.newRequest.emit();
    }
  }

  async saveCurrentRequest(): Promise<void> {
    await this.requestSave.save(this.store.snapshot());
  }
}
