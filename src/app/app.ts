import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { AppShell } from './components/app-shell/app-shell';
import { Idb } from './data/idb';
import { PastRequest, PastRequestKey } from './models/history';

@Component({
    selector: 'app-root',
    imports: [AppShell],
    templateUrl: './app.html',
    styleUrl: './app.css',
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { '(window:resize)': 'onWindowResize()' },
})
export class App implements OnInit {
  private readonly idbService = inject(Idb);

  readonly pastRequests = signal<PastRequest[]>([]);
  readonly historyLoading = signal(false);
  readonly drawerVisible = signal(false);
  /** Below 768 px: the composer's sections stack (one open at a time). */
  readonly isMobile = signal(false);
  /**
   * Below 1024 px the sidebar is a drawer over the page, closed until asked
   * for. Pinned, it is 352 px wide: beside it a 768 px window left the
   * composer and the response 150 px each.
   */
  readonly sidebarOverlay = signal(false);
  private viewportInitialized = false;

  ngOnInit(): void {
    void this.initializeHistory();
    this.updateViewportFlags();
  }

  async refreshPastRequests(): Promise<void> {
    if (this.historyLoading()) {
      return;
    }

    this.historyLoading.set(true);
    try {
      this.pastRequests.set(await this.idbService.getLatest());
    } finally {
      this.historyLoading.set(false);
    }
  }

  async clearPastRequests(): Promise<void> {
    await this.idbService.clear();
    await this.refreshPastRequests();
  }

  async deletePastRequest(id: PastRequestKey): Promise<void> {
    await this.idbService.delete(id);
    await this.refreshPastRequests();
  }

  openHistoryDrawer(): void {
    this.drawerVisible.set(true);
  }

  closeHistoryDrawer(): void {
    this.drawerVisible.set(false);
  }

  toggleHistoryDrawer(): void {
    this.drawerVisible.update((visible) => !visible);
  }

  onWindowResize(): void {
    this.updateViewportFlags();
  }

  private async initializeHistory(): Promise<void> {
    await this.idbService.init();
    await this.refreshPastRequests();
  }

  private updateViewportFlags(): void {
    const wasOverlay = this.sidebarOverlay();
    const overlay = window.innerWidth < 1024;
    this.isMobile.set(window.innerWidth < 768);
    this.sidebarOverlay.set(overlay);

    // On the first pass, and each time the window crosses the line: pinned
    // means open, a drawer starts closed.
    if (!this.viewportInitialized || wasOverlay !== overlay) this.drawerVisible.set(!overlay);
    this.viewportInitialized = true;
  }
}
