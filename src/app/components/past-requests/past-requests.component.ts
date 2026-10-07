import { CommonModule } from "@angular/common";
import { ChangeDetectionStrategy, Component, inject, OnChanges, input, output } from "@angular/core";
import { UI_ACCORDION } from "../../ui/accordion.component";
import { ConfirmService } from "../../ui/confirm.service";
import { ButtonDirective } from "../../ui/button.directive";
import { TooltipDirective } from "../../ui/tooltip.directive";
import { PastRequest, PastRequestKey } from "../../models/history.models";
import { IconComponent } from "../../shared/icon/icon.component";

export interface HistoryGroup {
  label: string;
  requests: PastRequest[];
}

@Component({
  selector: "app-past-requests",
  standalone: true,
  imports: [
    IconComponent,
    CommonModule,
    ButtonDirective,
    TooltipDirective,
    UI_ACCORDION,
  ],
  templateUrl: "./past-requests.component.html",
  styleUrls: ["./past-requests.component.css"],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PastRequestsComponent implements OnChanges {
  readonly pastRequests = input<PastRequest[]>([]);
  readonly loading = input(false);
  readonly displayHeader = input(true);
  readonly loadRequest = output<PastRequest>();
  readonly deleteRequest = output<PastRequestKey>();

  private readonly confirm = inject(ConfirmService);

  readonly skeletonPlaceholders = Array.from({ length: 4 }).map((_, i) => i);

  groups: HistoryGroup[] = [];

  ngOnChanges(): void {
    this.groups = this.buildGroups(this.pastRequests());
  }

  private buildGroups(requests: PastRequest[]): HistoryGroup[] {
    const now = Date.now();
    const startOfToday = this.startOfDay(now);
    const startOfYesterday = startOfToday - 86_400_000;
    const startOfWeek = startOfToday - 6 * 86_400_000;

    const buckets: Record<string, PastRequest[]> = {
      Today: [],
      Yesterday: [],
      "This week": [],
      Older: [],
    };

    for (const req of requests) {
      const ts = req.createdAt ?? 0;
      if (ts >= startOfToday) {
        buckets["Today"].push(req);
      } else if (ts >= startOfYesterday) {
        buckets["Yesterday"].push(req);
      } else if (ts >= startOfWeek) {
        buckets["This week"].push(req);
      } else {
        buckets["Older"].push(req);
      }
    }

    return Object.entries(buckets)
      .filter(([, items]) => items.length > 0)
      .map(([label, items]) => ({ label, requests: items }));
  }

  private startOfDay(ts: number): number {
    const d = new Date(ts);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  relativeTime(ts: number | undefined): string {
    if (!ts) {
      return "";
    }
    const diff = Date.now() - ts;
    if (diff < 60_000) {
      return "just now";
    }
    if (diff < 3_600_000) {
      return `${Math.floor(diff / 60_000)}m ago`;
    }
    if (diff < 86_400_000) {
      return `${Math.floor(diff / 3_600_000)}h ago`;
    }
    return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  formatDuration(ms: number | undefined): string {
    if (!ms || ms <= 0) {
      return "";
    }
    if (ms < 1000) {
      return `${ms}ms`;
    }
    return `${(ms / 1000).toFixed(1)}s`;
  }

  load(req: PastRequest) {
    this.loadRequest.emit(req);
  }

  async confirmDelete(req: PastRequest, event: Event): Promise<void> {
    const id = req.id;
    if (typeof id === "undefined") return;
    const confirmed = await this.confirm.confirm({
      message: "Remove this request from history?",
      acceptLabel: "Delete",
      anchor: event.currentTarget as HTMLElement,
    });
    if (confirmed) this.deleteRequest.emit(id);
  }

  trackById(_index: number, item: PastRequest): PastRequestKey | undefined {
    return item.id;
  }
}
