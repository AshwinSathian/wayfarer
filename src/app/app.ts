import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from "@angular/core";
import { AppShell } from "./components/app-shell/app-shell";
import { HistoryRepository } from "./data/history-repository";
import { IdbCore } from "./data/idb-core";
import { PastRequest } from "@wayfarer/core";
import { RequestSettings } from "./services/request-settings";
import { TabsStorage } from "./state/tabs-storage";
import { CookieJar } from "./services/cookie-jar";
import { recordDiagnostic } from "./services/diagnostics";

@Component({
  selector: "app-root",
  imports: [AppShell],
  templateUrl: "./app.html",
  styleUrl: "./app.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { "(window:resize)": "onWindowResize()" },
})
export class App implements OnInit {
  private readonly history = inject(HistoryRepository);
  private readonly idb = inject(IdbCore);
  private readonly requestSettings = inject(RequestSettings);
  private readonly tabsStorage = inject(TabsStorage);
  private readonly cookieJar = inject(CookieJar);

  readonly pastRequests = signal<PastRequest[]>([]);
  readonly historyLoading = signal(false);
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
  }

  async refreshPastRequests(): Promise<void> {
    if (this.historyLoading()) {
      return;
    }

    this.historyLoading.set(true);
    try {
      this.pastRequests.set(await this.history.getLatest(this.requestSettings.historyCap()));
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
    // scrollbar off the width a query sees, and not off innerWidth.
    const wide = matchMedia("(min-width: 1200px)").matches;
    const room = matchMedia("(min-width: 1024px)").matches;
    this.canPin.set(room && !wide);
    const overlay = !wide && !(room && this.pinned());
    this.isMobile.set(!matchMedia("(min-width: 768px)").matches);
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
