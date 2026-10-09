import { Injectable, inject, signal } from "@angular/core";
import { MatExpansionPanel } from "@angular/material/expansion";
import { emptyAuth, type AuthConfig, type RequestContent } from "@wayfarer/core";
import { RequestDoc } from "../../models/collections";
import { PastRequest } from "../../models/history";
import { RequestSave } from "../../services/request-save";
import { bodyRowsFromObject, isPlainObject, mergeHeaderRowsFromParsed } from "../../shared/http/key-value";
import {
  DEFAULT_HEADER_KEY,
  DEFAULT_HEADER_VALUE,
  WorkspaceStore,
  bodyValue,
  isBodyMethod,
  requestFromHistory,
  sentHeaders,
} from "../../state/workspace-store";

export type EditorMode = "basic" | "json";

/**
 * What the composer shows of its draft, shared by its panels: the open tab,
 * Basic or JSON mode and the JSON editors' text. Loading or clearing a
 * request goes through here because both also move the tabs.
 */
@Injectable()
export class ComposerView {
  private readonly store = inject(WorkspaceStore);
  private readonly requestSave = inject(RequestSave);

  readonly activeTab = signal("headers");
  /**
   * Single-panel-at-a-time mobile accordion state (a plain string, not an
   * array) — the accordion is deliberately non-multiple so only one
   * composer section (and, critically, at most one Monaco instance inside
   * it) is ever expanded at once on narrow viewports.
   */
  readonly mobileActivePanels = signal<string>("headers");
  readonly editorMode = signal<EditorMode>("basic");
  readonly headersJsonText = signal("");
  readonly bodyJsonText = signal("{}");
  readonly headersJsonValid = signal(true);
  readonly bodyJsonValid = signal(true);
  readonly showAuthPassword = signal(false);

  constructor() {
    this.syncMobilePanelsFromActiveTab();
  }

  loadPastRequest(request: PastRequest): void {
    // A History replay is never bound back to a collection request — even
    // if the composer was previously bound, replaying an older history
    // entry shouldn't silently overwrite whatever's saved in the
    // collection with different (possibly stale) content.
    this.requestSave.bind(null);
    this.load(requestFromHistory(request), "history");
  }

  /**
   * Loads a saved collection request into the composer *and* binds this
   * session to it, so a subsequent Save writes back in place instead of
   * prompting to create a new request. Unlike loadPastRequest (History,
   * which only ever carries method/url/headers/body), this preserves auth,
   * scripts, and tests.
   */
  loadCollectionRequest(doc: RequestDoc): void {
    this.requestSave.bind(doc);
    this.load(doc, "collection");
  }

  /** Explicit "start a new request" action — the only thing that clears the composer now that a successful Send no longer does. */
  clear(): void {
    this.requestSave.bind(null);
    this.store.reset();
    this.activeTab.set("headers");
    this.showAuthPassword.set(false);
    this.syncMobilePanelsFromActiveTab();
    if (this.editorMode() === "json") {
      this.syncJsonEditorsFromState();
    } else {
      this.headersJsonText.set("");
      this.bodyJsonText.set("{}");
      this.headersJsonValid.set(true);
      this.bodyJsonValid.set(true);
    }
  }

  onRequestMethodChange(method: string): void {
    this.store.setMethod(method);
    if (!isBodyMethod(method)) {
      this.activeTab.set("headers");
    }
    this.syncMobilePanelsFromActiveTab();
    if (this.editorMode() === "json") {
      this.syncJsonEditorsFromState();
    }
  }

  /** Auth type changes (unlike bearer/basic/apiKey field edits) also reset password visibility. */
  onAuthTypeChange(type: AuthConfig["type"]): void {
    this.store.patch({ auth: emptyAuth(type) });
    this.showAuthPassword.set(false);
  }

  onEditorModeChange(mode: EditorMode): void {
    this.editorMode.set(mode);
    if (mode === "json") {
      this.syncJsonEditorsFromState();
    }
  }

  onActiveTabChange(tab: string): void {
    this.activeTab.set(tab);
    this.syncMobilePanelsFromActiveTab();
  }

  onHeadersJsonParsed(value: unknown): void {
    if (!this.headersJsonValid()) {
      return;
    }
    if (value === undefined) {
      this.store.patch({ headers: [{ key: DEFAULT_HEADER_KEY, value: DEFAULT_HEADER_VALUE, enabled: true }] });
      this.store.refreshVariablePreview();
      return;
    }
    if (!isPlainObject(value)) {
      return;
    }
    const rows = mergeHeaderRowsFromParsed(value, this.store.draft().headers, DEFAULT_HEADER_KEY, DEFAULT_HEADER_VALUE);
    this.store.patch({ headers: rows.map((row) => ({ ...row, enabled: true })) });
    this.store.refreshVariablePreview();
  }

  onBodyJsonParsed(value: unknown): void {
    if (!this.bodyJsonValid()) {
      return;
    }
    if (value === undefined) {
      this.store.setBodyRows([{ key: "", value: "" }]);
      this.store.refreshVariablePreview();
      return;
    }
    if (!isPlainObject(value)) {
      return;
    }
    const bodyRows = bodyRowsFromObject(value);
    this.store.setBodyRows(bodyRows.length ? bodyRows : [{ key: "", value: "" }]);
    this.store.refreshVariablePreview();
  }

  onMobileIndexChange(panel: string | null): void {
    const next = panel ?? "headers";
    this.mobileActivePanels.set(next);

    if (isBodyMethod(this.store.draft().method) && next === "body") {
      this.activeTab.set("body");
    } else if (next === "params" || next === "auth" || next === "scripts") {
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

  private load(request: RequestContent, source: "collection" | "history"): void {
    const hasBody = this.store.load(request, source);
    this.activeTab.set(hasBody && isBodyMethod(request.method) ? "body" : "headers");
    this.showAuthPassword.set(false);
    this.syncMobilePanelsFromActiveTab();
    if (this.editorMode() === "json") {
      this.syncJsonEditorsFromState();
    }
    this.store.refreshVariablePreview();
  }

  private syncMobilePanelsFromActiveTab(): void {
    if (isBodyMethod(this.store.draft().method)) {
      this.mobileActivePanels.set(this.activeTab() === "body" ? "body" : "headers");
    } else {
      this.mobileActivePanels.set("headers");
    }
  }

  private syncJsonEditorsFromState(): void {
    // Deliberately raw: this view keeps showing the literal {{var}}
    // template, not a resolved snapshot.
    const draft = this.store.snapshot();
    const body = bodyValue(draft.body);
    this.headersJsonText.set(JSON.stringify(Object.fromEntries(sentHeaders(draft.headers)), undefined, 4));
    this.bodyJsonText.set(body ? JSON.stringify(body, undefined, 4) : "{}");
    this.headersJsonValid.set(true);
    this.bodyJsonValid.set(true);
  }
}
