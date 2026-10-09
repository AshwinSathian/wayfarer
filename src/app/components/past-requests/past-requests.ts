import { DatePipe } from "@angular/common";
import { ChangeDetectionStrategy, Component, inject, OnChanges, input, output } from "@angular/core";
import { MatAccordion, MatExpansionPanel, MatExpansionPanelHeader } from "@angular/material/expansion";
import { Confirm } from "../../ui/confirm";
import { MatButton, MatIconButton } from "@angular/material/button";
import { MatTooltip } from "@angular/material/tooltip";
import { HoverCard } from "../../ui/hover-card";
import { PastRequest, PastRequestKey } from "../../models/history";
import { Icon } from "../../shared/icon/icon";

export interface HistoryGroup {
  label: string;
  requests: PastRequest[];
}

@Component({
  selector: "app-past-requests",
  imports: [MatIconButton, 
    DatePipe,
    Icon,
    MatButton,
    MatTooltip,
    HoverCard,
    MatAccordion, MatExpansionPanel, MatExpansionPanelHeader,
  ],
  templateUrl: "./past-requests.html",
  styleUrl: "./past-requests.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PastRequests implements OnChanges {
  readonly pastRequests = input<PastRequest[]>([]);
  readonly loading = input(false);
  readonly displayHeader = input(true);
  readonly loadRequest = output<PastRequest>();
  readonly deleteRequest = output<PastRequestKey>();

  private readonly confirm = inject(Confirm);

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
