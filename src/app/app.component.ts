import { CommonModule } from '@angular/common';
import { Component, HostListener, OnInit, inject } from '@angular/core';
import { AppShellComponent } from './components/app-shell/app-shell.component';
import { IdbService } from './data/idb.service';
import { PastRequest, PastRequestKey } from './models/history.models';

@Component({
    selector: 'app-root',
    standalone: true,
    imports: [CommonModule, AppShellComponent],
    templateUrl: './app.component.html',
    styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit {
  private readonly idbService = inject(IdbService);


  pastRequests: PastRequest[];
  historyLoading: boolean;
  drawerVisible: boolean;
  isMobile: boolean;
  private viewportInitialized: boolean;

  constructor() {
    this.pastRequests = [];
    this.historyLoading = false;
    this.drawerVisible = false;
    this.isMobile = false;
    this.viewportInitialized = false;
  }

  ngOnInit(): void {
    this.initializeHistory();
    this.updateViewportFlags();
  }

  async refreshPastRequests(): Promise<void> {
    if (this.historyLoading) {
      return;
    }

    this.historyLoading = true;
    try {
      this.pastRequests = await this.idbService.getLatest();
    } finally {
      this.historyLoading = false;
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
    this.drawerVisible = true;
  }

  closeHistoryDrawer(): void {
    this.drawerVisible = false;
  }

  toggleHistoryDrawer(): void {
    this.drawerVisible = !this.drawerVisible;
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    this.updateViewportFlags();
  }

  private async initializeHistory(): Promise<void> {
    await this.idbService.init();
    await this.refreshPastRequests();
  }

  private updateViewportFlags(): void {
    const previous = this.isMobile;
    const width = typeof window !== 'undefined' ? window.innerWidth : 1200;
    this.isMobile = width < 768;

    if (!this.viewportInitialized) {
      this.drawerVisible = !this.isMobile;
      this.viewportInitialized = true;
      return;
    }

    if (previous && !this.isMobile) {
      this.drawerVisible = true;
    }

    if (!previous && this.isMobile) {
      this.drawerVisible = false;
    }
  }
}
