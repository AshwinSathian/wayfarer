import { ChangeDetectionStrategy, Component, OnInit, effect, inject, signal, untracked } from "@angular/core";
import { AppShell } from "./components/app-shell/app-shell";
import { HistoryRepository, type HistorySummary } from "./data/history-repository";
import { IdbCore } from "./data/idb-core";
import { RequestSettings } from "./services/request-settings";
import { TabsStorage } from "./state/tabs-storage";
import { CookieJar } from "./services/cookie-jar";
import { ModelCalls } from "./services/model-calls";
import { recordDiagnostic } from "./services/diagnostics";
import { ImportPipeline } from "./services/import-pipeline";
import { shareFragmentAtStart, takeShareFragment } from "./shared/share/link-at-start";

@Component({
  selector: "app-root",
  imports: [AppShell],
  templateUrl: "./app.html",
  styleUrl: "./app.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { "(window:resize)": "onWindowResize()", "(window:hashchange)": "onHashChange()" },
})
export class App implements OnInit {
  private readonly history = inject(HistoryRepository);
  private readonly idb = inject(IdbCore);
  private readonly requestSettings = inject(RequestSettings);
  private readonly tabsStorage = inject(TabsStorage);
  private readonly cookieJar = inject(CookieJar);
  private readonly modelCalls = inject(ModelCalls);
  private readonly imports = inject(ImportPipeline);

  readonly pastRequests = signal<HistorySummary[]>([]);
  readonly historyLoading = signal(false);
  /** A refresh was asked for while one was reading: it reads again, or the entry just written is missing. */
  private historyStale = false;
  readonly drawerVisible = signal(false);
  /** Below 768 px: the composer's sections stack (one open at a time). */
  readonly isMobile = signal(false);
  /**
   * Below 1200 px the sidebar is a drawer over the page, closed until asked
   * for. Pinned, it is 352 px wide: beside it a 1024 px window left the
   * composer 294 px (its fourth tab cut off) and the response 240 px.
   */
  readonly sidebarOverlay = signal(false);
  /** 1,024 to 1,200 px: the sidebar may stay beside the page, 280 px wide, if the user asks (U-070). */
  readonly canPin = signal(false);
  /** The user's choice there, kept across reloads. Reset all data removes it with every `wayfarer:` key. */
  private readonly pinned = signal(readPinned());
  private viewportInitialized = false;

  constructor() {
    // A model call was kept: History lists it with the requests (D4.10).
    effect(() => {
      if (this.modelCalls.kept()) untracked(() => void this.refreshPastRequests());
    });
  }

  ngOnInit(): void {
    void this.initializeHistory();
    // The tabs a reload or another browser tab left (P5.1).
    void this.tabsStorage.start();
    // The cookie jar (P5.3), for requests that leave through the Local Bridge.
    void this.cookieJar.start();
    // Another tab sent a request, or cleared its history.
    this.idb.onChangeElsewhere((stores) => {
      if (stores.includes("history")) {
        void this.refreshPastRequests();
      }
    });
    this.updateViewportFlags();
    // A shared link this page was opened with (T1.3): main.ts took it off the address bar.
    const link = shareFragmentAtStart();
    if (link) void this.imports.openLink(link);
  }

  /** A shared link pasted into the address bar of the open app is a navigation in the page: it is taken the same way. */
  onHashChange(): void {
    const link = takeShareFragment({ keep: false });
    if (link) void this.imports.openLink(link);
  }

  async refreshPastRequests(): Promise<void> {
    if (this.historyLoading()) {
      this.historyStale = true;
      return;
    }

    this.historyLoading.set(true);
    try {
      do {
        this.historyStale = false;
        this.pastRequests.set(await this.history.getLatest(this.requestSettings.historyCap()));
      } while (this.historyStale);
    } finally {
      this.historyLoading.set(false);
    }
  }

  async clearPastRequests(): Promise<void> {
    await this.history.clear();
    await this.refreshPastRequests();
  }

  async deletePastRequest(id: number): Promise<void> {
    await this.history.delete(id);
    await this.refreshPastRequests();
  }

  closeNavigation(): void {
    this.drawerVisible.set(false);
  }

  toggleNavigation(): void {
    this.drawerVisible.update((visible) => !visible);
  }

  onWindowResize(): void {
    this.updateViewportFlags();
  }

  private async initializeHistory(): Promise<void> {
    await this.idb.init();
    await this.refreshPastRequests();
  }

  /** Keeps the sidebar beside the page from 1,024 px, or makes it a drawer again (U-070). */
  setPinned(pinned: boolean): void {
    this.pinned.set(pinned);
    try {
      localStorage.setItem(PINNED_KEY, String(pinned));
    } catch (error) {
      recordDiagnostic(error, "sidebar: the pinned choice was not stored");
    }
    this.updateViewportFlags();
  }

  private updateViewportFlags(): void {
    const wasOverlay = this.sidebarOverlay();
    // Media queries, as the stylesheet's breakpoints are: WebKit takes the
    // scrollbar off the width a query sees, and not off innerWidth. In em, as
    // the boxes are in rem: a reader whose text is twice the size has a window
    // half as wide to the layout (U-153). 75, 64 and 48 em are 1,200, 1,024 and
    // 768 px at the default 16 px.
    const wide = matchMedia("(min-width: 75em)").matches;
    const room = matchMedia("(min-width: 64em)").matches;
    this.canPin.set(room && !wide);
    const overlay = !wide && !(room && this.pinned());
    this.isMobile.set(!matchMedia("(min-width: 48em)").matches);
    this.sidebarOverlay.set(overlay);

    // On the first pass, and each time the window crosses the line: pinned
    // means open, a drawer starts closed.
    if (!this.viewportInitialized || wasOverlay !== overlay) this.drawerVisible.set(!overlay);
    this.viewportInitialized = true;
  }
}

const PINNED_KEY = "wayfarer:sidebar-pinned";

function readPinned(): boolean {
  try {
    return localStorage.getItem(PINNED_KEY) === "true";
  } catch (error) {
    recordDiagnostic(error, "sidebar: the pinned choice was not read");
    return false;
  }
}
