import { NgTemplateOutlet } from "@angular/common";
import { ChangeDetectionStrategy, Component, DestroyRef, inject, input, output, viewChild } from "@angular/core";
import { SHORTCUTS, matches } from "../../shared/shortcuts";
import { Tab, TabContent, TabPanel, Tabs as AriaTabs } from "@angular/aria/tabs";
import { RequestDoc } from "../../models/collections";
import { PastRequest } from "@wayfarer/core";
import { RequestSave } from "../../services/request-save";
import { Icon } from "../../shared/icon/icon";
import { isBodyMethod } from "@wayfarer/core";
import { WorkspaceStore } from "../../state/workspace-store";
import type { RunTarget } from "../../state/run-state";
import { Tabs } from "../../state/tabs";
import { Splitter } from "../../ui/splitter";
import { UiTabList } from "../../ui/tabs";
import { RunView } from "../runner/run-view";
import { SocketView } from "../socket/socket-view";
import { SocketClient } from "../../services/socket-client";
import { ResponseViewer } from "../response-viewer/response-viewer";
import { AddressRow } from "./address-row";
import { BrowserNotes } from "./browser-notes";
import { RequestWarnings } from "./request-warnings";
import { AuthPanel } from "./auth-panel";
import { BodyPanel } from "./body-panel";
import { ComposerSections } from "./composer-sections";
import { ComposerView } from "./composer-view";
import { HeadersPanel } from "./headers-panel";
import { ParamsPanel } from "./params-panel";
import { SaveAsDialog } from "./save-as-dialog";
import { ScriptsPanel } from "./scripts-panel";
import { TabStrip } from "./tab-strip";
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
    ComposerSections,
    AriaTabs,
    Tab,
    TabContent,
    TabPanel,
    UiTabList,
    Splitter,
    ResponseViewer,
    AddressRow,
    BrowserNotes,
    RequestWarnings,
    VariableChips,
    ParamsPanel,
    HeadersPanel,
    BodyPanel,
    AuthPanel,
    ScriptsPanel,
    NgTemplateOutlet,
    SaveAsDialog,
    TabStrip,
    RunView,
    SocketView,
  ],
  providers: [ComposerView],
  // The request tabs' container: their list is in the strip, the open one's panel here.
  hostDirectives: [AriaTabs],
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

  /** Not there while the open tab is a run's. */
  private readonly addressRow = viewChild(AddressRow);
  protected readonly tabs = inject(Tabs);
  protected readonly socket = inject(SocketClient);
  private readonly tabStrip = viewChild.required(TabStrip);

  protected readonly loadedCollectionRequest = this.requestSave.loadedCollectionRequest;
  protected readonly breadcrumb = this.requestSave.breadcrumb;
  protected get hasBody(): boolean {
    return isBodyMethod(this.store.draft().method);
  }

  constructor() {
    // In the capture phase, before Monaco: in an editor Ctrl+Enter would insert a line, and the keys send from
    // anywhere in the page, as the palette's do (docs/design/ia.md, U-032).
    const keydown = (event: KeyboardEvent) => this.onKeydown(event);
    window.addEventListener("keydown", keydown, true);
    inject(DestroyRef).onDestroy(() => window.removeEventListener("keydown", keydown, true));
  }

  private onKeydown(event: KeyboardEvent): void {
    const send = matches(event, SHORTCUTS.send);
    if (!send && !matches(event, SHORTCUTS.save)) return;
    // The browser's own Save page is never what is meant here.
    event.preventDefault();
    // A dialog or a drawer over the page has the keyboard.
    if (document.querySelector("dialog:modal")) return;
    event.stopPropagation();
    // As the buttons: nothing without an address; a second press neither cancels nor saves twice.
    if (!this.store.draft().url) return;
    if (!send && !this.requestSave.savingRequest()) void this.saveCurrentRequest();
    if (send && !this.store.loadingState()) void this.sendRequest();
  }

  focusUrl(): void {
    this.addressRow()?.focusUrl();
  }

  loadPastRequest(request: PastRequest): void {
    this.view.loadPastRequest(request);
  }

  loadCollectionRequest(doc: RequestDoc): void {
    this.view.loadCollectionRequest(doc);
  }

  openRun(target: RunTarget): void {
    this.view.openRun(target);
  }

  clearComposer(): void {
    this.view.clear();
  }

  newTab(): void {
    this.tabStrip().open();
  }

  duplicateTab(): void {
    this.tabStrip().duplicate();
  }

  closeTab(): Promise<void> {
    return this.tabStrip().close();
  }

  async sendRequest(): Promise<void> {
    // A run's tab has no request to send or to save: the palette's commands do nothing there.
    if (this.tabs.active().run) return;
    // An address of a WebSocket is connected to, not sent (P5.7).
    if (this.socket.isSocket()) return this.socket.connect();
    if (await this.store.send()) {
      this.newRequest.emit();
    }
  }

  /** Reconnect of an event stream: a send like any other, with the last event's id. */
  async reconnect(): Promise<void> {
    if (await this.store.reconnect()) this.newRequest.emit();
  }

  async saveCurrentRequest(): Promise<void> {
    if (this.tabs.active().run) return;
    await this.requestSave.save(this.store.snapshot(), this.store.scriptsAllowed());
  }
}
