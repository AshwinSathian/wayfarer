import { ImportRefused, ImportWorkerClient } from "../../shared/import/import-worker-client";
import { Injectable, computed, effect, inject, signal } from "@angular/core";
import { emptyAuth, type AuthConfig, type RequestContent, type Row } from "@wayfarer/core";
import { RequestDoc } from "../../models/collections";
import { PastRequest } from "@wayfarer/core";
import { RequestSave } from "../../services/request-save";
import { ScriptTrust } from "../../services/script-trust";
import { RunState, type RunTarget } from "../../state/run-state";
import { TabState, type HolderTarget } from "../../state/tab-state";
import { Tabs } from "../../state/tabs";
import { WorkspaceStore } from "../../state/workspace-store";
import type { TabMarkValue } from "./tab-mark";

/** The rows a send takes: switched on and named. */
const sent = (rows: Row[]): number | null => rows.filter((row) => row.enabled && row.key.trim()).length || null;

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

  /** Params first, as Postman's: an address with a query shows its parameters (U-017). */
  readonly activeTab = signal("params");
  /**
   * Single-panel-at-a-time mobile accordion state (a plain string, not an
   * array) — the accordion is deliberately non-multiple so only one
   * composer section (and, critically, at most one Monaco instance inside
   * it) is ever expanded at once on narrow viewports.
   */
  readonly mobileActivePanels = signal<string>("params");
  /** On a phone, whether the request's parts or the response is shown (U-028). */
  readonly mobilePane = signal("request");
  readonly showAuthPassword = signal(false);

  /**
   * What each request tab holds, beside its name (U-170): Params and Headers count the rows that are sent; Body, Auth,
   * Scripts and Network are marked when not at their default. Scripts that are held back are marked so (U-158).
   */
  readonly tabMarks = computed(
    (): Record<"params" | "headers" | "body" | "auth" | "scripts" | "settings", TabMarkValue> => {
      const { params, headers, body, auth, scripts, tests, settings } = this.store.draft();
      const hasScripts = !!(scripts.pre.trim() || scripts.post.trim() || tests.length);
      return {
        params: sent(params),
        headers: sent(headers),
        body: body.mode === "none" ? null : "set",
        auth: auth.type === "none" || auth.type === "inherit" ? null : "set",
        scripts: this.store.scriptsHeld() ? "held" : hasScripts ? "set" : null,
        settings:
          settings.route !== undefined || settings.followRedirects === false || settings.tlsInsecure ? "changed" : null,
      };
    },
  );

  constructor() {
    this.syncMobilePanelsFromActiveTab();
    // A password shown in one tab is not shown in the next.
    effect(() => {
      this.tabs.active();
      this.showAuthPassword.set(false);
    });
  }

  loadPastRequest(request: PastRequest): void {
    // A model call is no request a person composed, and its template names the key's secret: it loads into no tab,
    // where Send would use it (D4.10, docs/design/ai/log.md).
    if (request.model) return;
    // A History replay is never bound back to a collection request — even
    // if the composer was previously bound, replaying an older history
    // entry shouldn't silently overwrite whatever's saved in the
    // collection with different (possibly stale) content.
    // A tab of its own (U-144): it replaced the open request, saved or not, with no cue. Only an empty new tab is taken.
    if (!this.tabs.active().empty()) this.tabs.open();
    this.requestSave.bind(null);
    this.trust.openedFromHistory(request.template);
    this.load(request.template);
    // Opened from history: the entry's record is what was asked for (D4.12, U-024).
    this.store.showRecorded(request, true);
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

  /**
   * A request about to be loaded goes into a tab of its own when the open tab holds changes that are not saved (P5.1),
   * or is waiting for a response or has a socket open: that answer belongs to the request it was sent for.
   */
  private keepUnsaved(): void {
    const tab = this.tabs.active();
    if (tab.dirty() || tab.document || tab.loadingState() || tab.socket.status() !== "closed") this.tabs.open();
  }

  /** Opens the tab of a run of `target` (P5.2): the one that is open already, or a new one. Nothing is sent until Run. */
  openRun(target: RunTarget): void {
    const open = this.tabs
      .tabs()
      .find(
        (tab) => tab.run?.target.collectionId === target.collectionId && tab.run.target.folderId === target.folderId,
      );
    if (open) {
      this.tabs.activate(open.id);
      return;
    }
    const tab = new TabState();
    tab.run = new RunState(target);
    this.tabs.open(tab);
  }

  /** Opens the Environments tab (D4.5): the one that is open, or a new one. */
  openEnvironments(): void {
    const open = this.tabs.tabs().find((tab) => tab.environments);
    if (open) {
      this.tabs.activate(open.id);
      return;
    }
    const tab = new TabState();
    tab.environments = true;
    this.tabs.open(tab);
  }

  /**
   * Opens the settings tab of a collection or a folder (D5-e): the one that is open, or a new one. `variable`: a chip
   * asked to see it (U-132), and the Variables pane shows its row.
   */
  openHolder(target: HolderTarget, variable?: string): void {
    const tab =
      this.tabs
        .tabs()
        .find(
          (open) => open.holder?.collectionId === target.collectionId && open.holder.folderId === target.folderId,
        ) ?? new TabState();
    if (!tab.holder) {
      tab.holder = { collectionId: target.collectionId, ...(target.folderId && { folderId: target.folderId }) };
      this.tabs.open(tab);
    } else this.tabs.activate(tab.id);
    if (variable) tab.reveal.set({ key: variable });
  }

  /**
   * Fills the composer with the request a cURL command describes. It is a
   * new request, bound to no saved one, and nothing is stored. What the
   * command asked for that the app does not do is said under the address.
   * It goes into the tab it was pasted in, which the worker's answer may find
   * closed, or no longer the open one.
   */
  async pasteCurl(text: string): Promise<void> {
    const tab = this.tabs.active();
    try {
      const { content, warnings } = await this.importWorker.curl(text);
      if (!this.tabs.tabs().includes(tab)) return;
      this.tabs.activate(tab.id);
      // A run's tab or the Environments tab holds no request: a new one goes into a tab of its own.
      if (tab.document) this.tabs.open();
      this.requestSave.bind(null);
      this.trust.openedHere();
      this.store.load(content);
      this.tabs.active().markClean();
      this.mobilePane.set("request");
      this.showAuthPassword.set(false);
      this.store.refreshVariablePreview();
      this.store.pasteNotes.set(warnings);
      this.activeTab.set(content.body.mode === "none" ? "params" : "body");
      this.syncMobilePanelsFromActiveTab();
    } catch (error) {
      if (!(error instanceof ImportRefused)) throw error;
      if (this.tabs.active() === tab) this.store.endpointError.set(error.message);
    }
  }

  onRequestMethodChange(method: string): void {
    this.store.setMethod(method);
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
    const next = panel ?? "params";
    this.mobileActivePanels.set(next);
    this.activeTab.set(next);
  }

  /**
   * A section was closed. If nothing else took its place the accordion goes
   * back to Params; closing Params itself therefore reopens it.
   */
  onMobilePanelClosed(panel: string, section: { expand(): void }): void {
    if (this.mobileActivePanels() !== panel) return;
    this.onMobileIndexChange(null);
    // Its binding still says open, so Aria would not hear it again: it is told.
    if (this.mobileActivePanels() === panel) section.expand();
  }

  private load(request: RequestContent): void {
    this.store.load(request);
    this.tabs.active().markClean();
    // The response on screen is another request's now: a reload does not show it for this one.
    this.tabs.active().historyKey.set(undefined);
    this.activeTab.set(request.body.mode !== "none" ? "body" : "params");
    this.mobilePane.set("request");
    this.showAuthPassword.set(false);
    this.syncMobilePanelsFromActiveTab();
    this.store.refreshVariablePreview();
  }

  /** The phone's open section is the desktop's open tab (F55: crossing the 768 px line and back lost the tab). */
  private syncMobilePanelsFromActiveTab(): void {
    this.mobileActivePanels.set(this.activeTab());
  }
}
