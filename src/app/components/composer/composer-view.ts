import { ImportRefused, ImportWorkerClient } from "../../shared/import/import-worker-client";
import { Injectable, effect, inject, signal } from "@angular/core";
import { MatExpansionPanel } from "@angular/material/expansion";
import { emptyAuth, type AuthConfig, type RequestContent } from "@wayfarer/core";
import { RequestDoc } from "../../models/collections";
import { PastRequest } from "@wayfarer/core";
import { RequestSave } from "../../services/request-save";
import { ScriptTrust } from "../../services/script-trust";
import { RunState, type RunTarget } from "../../state/run-state";
import { TabState } from "../../state/tab-state";
import { Tabs } from "../../state/tabs";
import { isBodyMethod } from "@wayfarer/core";
import { WorkspaceStore } from "../../state/workspace-store";

/**
 * What the composer shows of its draft, shared by its panels: the open tab
 * and whether the password is shown. Loading or clearing a request goes
 * through here because both also move the tabs.
 */
@Injectable()
export class ComposerView {
  private readonly store = inject(WorkspaceStore);
  private readonly requestSave = inject(RequestSave);
  private readonly trust = inject(ScriptTrust);
  private readonly importWorker = inject(ImportWorkerClient);
  private readonly tabs = inject(Tabs);

  readonly activeTab = signal("headers");
  /**
   * Single-panel-at-a-time mobile accordion state (a plain string, not an
   * array) — the accordion is deliberately non-multiple so only one
   * composer section (and, critically, at most one Monaco instance inside
   * it) is ever expanded at once on narrow viewports.
   */
  readonly mobileActivePanels = signal<string>("headers");
  readonly showAuthPassword = signal(false);

  constructor() {
    this.syncMobilePanelsFromActiveTab();
    // A password shown in one tab is not shown in the next.
    effect(() => {
      this.tabs.active();
      this.showAuthPassword.set(false);
    });
  }

  loadPastRequest(request: PastRequest): void {
    // A History replay is never bound back to a collection request — even
    // if the composer was previously bound, replaying an older history
    // entry shouldn't silently overwrite whatever's saved in the
    // collection with different (possibly stale) content.
    this.keepUnsaved();
    this.requestSave.bind(null);
    this.trust.openedFromHistory(request.template);
    this.load(request.template);
    this.store.showRecorded(request);
    this.tabs.active().historyKey.set(request.id);
  }

  /**
   * Loads a saved collection request into the composer *and* binds this
   * session to it, so a subsequent Save writes back in place instead of
   * prompting to create a new request. Unlike loadPastRequest (History,
   * which only ever carries method/url/headers/body), this preserves auth,
   * scripts, and tests.
   */
  loadCollectionRequest(doc: RequestDoc): void {
    // The request is already open in a tab: that tab, with what was changed in it.
    const open = this.tabs.tabs().find((tab) => tab.bound()?.meta.id === doc.meta.id);
    if (open) {
      this.tabs.activate(open.id);
      return;
    }
    this.keepUnsaved();
    this.requestSave.bind(doc);
    this.trust.openedHere();
    this.load(doc);
  }

  /** A request about to be loaded goes into a tab of its own when the open tab holds changes that are not saved (P5.1). */
  private keepUnsaved(): void {
    if (this.tabs.active().dirty() || this.tabs.active().run) this.tabs.open();
  }

  /** Opens the tab of a run of `target` (P5.2): the one that is open already, or a new one. Nothing is sent until Run. */
  openRun(target: RunTarget): void {
    const open = this.tabs.tabs().find((tab) => tab.run?.target.collectionId === target.collectionId && tab.run.target.folderId === target.folderId);
    if (open) {
      this.tabs.activate(open.id);
      return;
    }
    const tab = new TabState();
    tab.run = new RunState(target);
    this.tabs.open(tab);
  }

  /** Explicit "start a new request" action — the only thing that clears the composer now that a successful Send no longer does. */
  clear(): void {
    // A run's tab holds no request: a new one goes into a tab of its own.
    if (this.tabs.active().run) this.tabs.open();
    this.requestSave.bind(null);
    this.trust.openedHere();
    this.store.reset();
    this.tabs.active().markClean();
    this.activeTab.set("headers");
    this.showAuthPassword.set(false);
    this.syncMobilePanelsFromActiveTab();
  }

  /**
   * Fills the composer with the request a cURL command describes. It is a
   * new request, bound to no saved one, and nothing is stored. What the
   * command asked for that the app does not do is said under the address.
   */
  async pasteCurl(text: string): Promise<void> {
    try {
      const { content, warnings } = await this.importWorker.curl(text);
      this.clear();
      this.store.load(content);
      this.store.refreshVariablePreview();
      this.store.pasteNotes.set(warnings);
      this.activeTab.set(content.body.mode === "none" ? "headers" : "body");
      this.syncMobilePanelsFromActiveTab();
    } catch (error) {
      if (!(error instanceof ImportRefused)) throw error;
      this.store.endpointError.set(error.message);
    }
  }

  onRequestMethodChange(method: string): void {
    this.store.setMethod(method);
    if (!isBodyMethod(method)) {
      this.activeTab.set("headers");
    }
    this.syncMobilePanelsFromActiveTab();
  }

  /** Auth type changes (unlike bearer/basic/apiKey field edits) also reset password visibility. */
  onAuthTypeChange(type: AuthConfig["type"]): void {
    this.store.patch({ auth: emptyAuth(type) });
    this.showAuthPassword.set(false);
  }

  onActiveTabChange(tab: string): void {
    this.activeTab.set(tab);
    this.syncMobilePanelsFromActiveTab();
  }

  onMobileIndexChange(panel: string | null): void {
    const next = panel ?? "headers";
    this.mobileActivePanels.set(next);

    if (isBodyMethod(this.store.draft().method) && next === "body") {
      this.activeTab.set("body");
    } else if (next === "params" || next === "auth" || next === "scripts" || next === "settings") {
      // Keep activeTab in sync for non-headers/body panels too, so state
      // (e.g. which JSON editor synced) matches whatever the user is
      // actually looking at.
      this.activeTab.set(next);
    } else {
      this.activeTab.set("headers");
    }
  }

  /**
   * A section was closed. If nothing else took its place the accordion goes
   * back to Headers; closing Headers itself therefore reopens it.
   */
  onMobilePanelClosed(panel: string, section: MatExpansionPanel): void {
    if (this.mobileActivePanels() !== panel) return;
    this.onMobileIndexChange(null);
    if (this.mobileActivePanels() === panel) section.open();
  }

  private load(request: RequestContent): void {
    this.store.load(request);
    this.tabs.active().markClean();
    // The response on screen is another request's now: a reload does not show it for this one.
    this.tabs.active().historyKey.set(undefined);
    this.activeTab.set(request.body.mode !== "none" && isBodyMethod(request.method) ? "body" : "headers");
    this.showAuthPassword.set(false);
    this.syncMobilePanelsFromActiveTab();
    this.store.refreshVariablePreview();
  }

  /**
   * The phone's open section is the desktop's open tab (F55: it was "Body,
   * or else Headers", so crossing the 768 px line and back lost the tab).
   * A Body tab the method has no use for falls back to Headers.
   */
  private syncMobilePanelsFromActiveTab(): void {
    const tab = this.activeTab();
    this.mobileActivePanels.set(tab === "body" && !isBodyMethod(this.store.draft().method) ? "headers" : tab);
  }
}
