import { Injectable, Injector, effect, inject, untracked } from "@angular/core";
import { scriptDigest, scriptsOf } from "@wayfarer/core";
import { Idb } from "../data/idb";
import { StoredTab } from "../data/idb-schema";
import { TabsRepository } from "../data/tabs-repository";
import { RequestDoc } from "../models/collections";
import { CollectionsStore } from "../services/collections-store";
import { recordDiagnostic } from "../services/diagnostics";
import { ScriptTrust } from "../services/script-trust";
import { TabState, blankRow, contentOf } from "./tab-state";
import { Tabs } from "./tabs";

/** Which tab is open is this browser tab's own: two of them share the tabs, not the place in them. */
const OPEN_TAB_KEY = "wayfarer:open-tab";
/** How long after an edit a tab is written. */
const WRITE_AFTER_MS = 250;

/** A stored tab without its digests: what is compared to see whether a tab changed. */
type Stored = Omit<StoredTab, "scripts"> & { held?: true };

/**
 * Keeps the composer's tabs in the `tabs` store (P5.1): writes a tab a
 * moment after it changed, reads them all when the page starts, and reads
 * again when another browser tab wrote.
 *
 * A tab is stored as a saved request is: no response, no secret's
 * plaintext. With it go the digests of the scripts that were allowed to run
 * when it was stored. Read back, a script whose digest is not among them
 * waits for a review (plan D6, the maintainer's answer of 2026-10-12): the
 * store is not the review.
 */
@Injectable({ providedIn: "root" })
export class TabsStorage {
  private readonly tabs = inject(Tabs);
  private readonly repository = inject(TabsRepository);
  private readonly idb = inject(Idb);
  private readonly collections = inject(CollectionsStore);
  private readonly trust = inject(ScriptTrust);
  private readonly injector = inject(Injector);

  /** Each tab as it is in the store, by id: what this browser tab last wrote or read. */
  private readonly stored = new Map<string, string>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  /** Writes go one after another. */
  private writing: Promise<void> = Promise.resolve();

  /** Reads the stored tabs, then keeps the store in step with the tabs. Called once, when the page starts. */
  async start(): Promise<void> {
    try {
      await this.read(true);
    } catch (error) {
      // Storage that cannot be read: the shell's banner says so. The tabs live in the page.
      recordDiagnostic(error, "tabs: could not read the stored tabs");
    }
    effect(
      () => {
        // Every tab is read, each time: an effect follows only what its last run read, and a
        // run that stopped at the first changed tab never heard of an edit in a later one.
        const now = this.tabs.tabs().map((tab, order) => [tab.id, JSON.stringify(this.record(tab, order))]);
        const changed = now.some(([id, text]) => text !== this.stored.get(id));
        const closed = [...this.stored.keys()].some((id) => !now.some(([open]) => open === id));
        if (changed || closed) untracked(() => this.schedule());
      },
      { injector: this.injector }
    );
    effect(
      () => {
        const id = this.tabs.active().id;
        try {
          sessionStorage.setItem(OPEN_TAB_KEY, id);
        } catch (error) {
          recordDiagnostic(error, "tabs: could not note the open tab");
        }
      },
      { injector: this.injector }
    );
    this.idb.onChangeElsewhere((stores) => {
      if (stores.includes("tabs")) void this.changedElsewhere();
    });
    // A page about to go may not get its timer: write now.
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") void this.flush();
    });
  }

  /** Another browser tab wrote: its tabs are read, and taken where this one holds nothing that is not stored yet. */
  async changedElsewhere(): Promise<void> {
    try {
      await this.read(false);
    } catch (error) {
      recordDiagnostic(error, "tabs: could not read what another tab stored");
    }
  }

  /** Writes what changed since the last write, now. */
  flush(): Promise<void> {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.writing = this.writing.then(() => this.write()).catch((error: unknown) => recordDiagnostic(error, "tabs: could not store the tabs"));
    return this.writing;
  }

  private schedule(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), WRITE_AFTER_MS);
  }

  private record(tab: TabState, order: number): Stored {
    return {
      id: tab.id,
      order,
      draft: contentOf(tab.draft()),
      baseline: tab.baseline(),
      requestId: tab.bound()?.meta.id,
      historyKey: tab.historyKey(),
      // Not stored as such: a review that lets the scripts run changes the digests that are.
      ...(tab.heldScripts() && { held: true }),
    };
  }

  private async write(): Promise<void> {
    const tabs = this.tabs.tabs();
    const put: StoredTab[] = [];
    const written = new Map<string, string>();
    for (const [order, tab] of tabs.entries()) {
      const { held: _held, ...record } = this.record(tab, order);
      const text = JSON.stringify(this.record(tab, order));
      if (text === this.stored.get(tab.id)) continue;
      // An empty tab that was never stored is not worth a record: every page starts with one.
      if (!this.stored.has(tab.id) && tabs.length === 1 && !tab.dirty() && !tab.bound() && tab.historyKey() === undefined) continue;
      // Digests before the transaction is opened: WebCrypto is asynchronous.
      const allowed = await this.trust.check(undefined, tab);
      const scripts = allowed ? await Promise.all(scriptsOf(record.draft).map(scriptDigest)) : [];
      put.push({ ...record, scripts });
      written.set(tab.id, text);
    }
    const remove = [...this.stored.keys()].filter((id) => !tabs.some((tab) => tab.id === id));
    if (!put.length && !remove.length) return;
    await this.repository.write(put, remove);
    for (const [id, text] of written) this.stored.set(id, text);
    for (const id of remove) this.stored.delete(id);
  }

  /**
   * Brings the tabs in step with the store. The stored tabs take the place
   * of the one empty tab a page starts with. A tab this browser tab changed
   * and has not stored yet keeps its own state, and so does one with a send
   * on its way.
   */
  private async read(first: boolean): Promise<void> {
    const [records] = await Promise.all([this.repository.readAll(), this.collections.ensureLoaded()]);
    if (first && !records.length) return;
    const here = new Map(this.tabs.tabs().map((tab, order) => [tab.id, { tab, order }]));
    const next: TabState[] = [];
    for (const record of records) {
      const { scripts: _scripts, ...stored } = record;
      const local = here.get(record.id);
      // Closed here a moment ago, and its record not deleted yet: it is not opened again.
      if (!local && this.stored.has(record.id)) continue;
      here.delete(record.id);
      const unstored = local && JSON.stringify(this.record(local.tab, local.order)) !== this.stored.get(record.id);
      if (local && (unstored || local.tab.loadingState())) {
        next.push(local.tab);
        continue;
      }
      const tab = local?.tab ?? new TabState(record.id);
      // Nothing changed for this tab: what it shows stays as it is.
      if (!local || JSON.stringify(stored) !== this.stored.get(record.id)) await this.restore(tab, record);
      next.push(tab);
      this.stored.set(record.id, JSON.stringify(this.record(tab, next.length - 1)));
    }
    // What is here and not in the store: a tab not written yet stays; one that was stored was closed elsewhere.
    for (const { tab } of here.values()) {
      // The one empty tab a page starts with gives way to the stored ones, at the start and when another browser tab stores the first.
      const pristine = here.size === 1 && this.tabs.tabs().length === 1 && !tab.dirty() && !tab.bound() && !tab.loadingState() && tab.responseStatusCode() === undefined;
      if (this.stored.has(tab.id) && !tab.loadingState()) this.stored.delete(tab.id);
      else if (!pristine) next.push(tab);
    }
    let open: string | undefined;
    try {
      open = first ? (sessionStorage.getItem(OPEN_TAB_KEY) ?? undefined) : undefined;
    } catch (error) {
      recordDiagnostic(error, "tabs: could not read the open tab");
    }
    this.tabs.replace(next, open);
  }

  /** Makes `tab` what `record` says: its draft, its saved request, its scripts' standing, and the response history kept. */
  private async restore(tab: TabState, record: StoredTab): Promise<void> {
    const draft = structuredClone(record.draft);
    tab.draft.set({ ...draft, params: draft.params.length ? draft.params : [blankRow()], headers: draft.headers.length ? draft.headers : [blankRow()] });
    tab.baseline.set(record.baseline);
    const bound = this.requestOf(record.requestId);
    tab.bound.set(bound);
    tab.heldScripts.set((await this.allowed(record, bound)) ? null : { ...draft.scripts, name: "This tab, as it was stored" });
    if (tab.historyKey() !== record.historyKey) {
      tab.historyKey.set(record.historyKey);
      const entry = record.historyKey === undefined ? null : await this.idb.get(record.historyKey);
      if (entry) tab.showRecorded(entry);
      else tab.resetResponse();
    }
  }

  /**
   * Whether a stored tab's scripts are let past the tab itself. Scripts the
   * tab did not change are its saved request's, and the collection's list
   * decides about those. Any other must have its digest stored with the tab.
   */
  private async allowed(record: StoredTab, bound: RequestDoc | null): Promise<boolean> {
    const { pre, post } = record.draft.scripts;
    if (bound && bound.scripts.pre === pre && bound.scripts.post === post) return true;
    const digests = await Promise.all(scriptsOf(record.draft).map(scriptDigest));
    return digests.every((digest) => record.scripts.includes(digest));
  }

  private requestOf(id: string | undefined): RequestDoc | null {
    if (id === undefined) return null;
    for (const tree of this.collections.tree()) {
      const request = tree.requests.find((doc) => doc.meta.id === id);
      if (request) return request;
    }
    return null;
  }
}
