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
  readonly isMobile = signal(false);
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
    const previous = this.isMobile();
    const width = typeof window !== 'undefined' ? window.innerWidth : 1200;
    const isMobile = width < 768;
    this.isMobile.set(isMobile);

    if (!this.viewportInitialized) {
      this.drawerVisible.set(!isMobile);
      this.viewportInitialized = true;
      return;
    }

    if (previous && !isMobile) {
      this.drawerVisible.set(true);
    }

    if (!previous && isMobile) {
      this.drawerVisible.set(false);
    }
  }
}
