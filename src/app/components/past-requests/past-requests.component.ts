import { CommonModule } from "@angular/common";
import { Component, EventEmitter, inject, Input, OnChanges, Output } from "@angular/core";
import { AccordionModule } from "primeng/accordion";
import { ConfirmationService } from "primeng/api";
import { ButtonModule } from "primeng/button";
import { ConfirmPopupModule } from "primeng/confirmpopup";
import { PopoverModule } from "primeng/popover";
import { SkeletonModule } from "primeng/skeleton";
import { TooltipModule } from "primeng/tooltip";
import { PastRequest, PastRequestKey } from "../../models/history.models";

export interface HistoryGroup {
  label: string;
  requests: PastRequest[];
}

@Component({
  selector: "app-past-requests",
  standalone: true,
  imports: [
    CommonModule,
    ButtonModule,
    TooltipModule,
    PopoverModule,
    AccordionModule,
    SkeletonModule,
    ConfirmPopupModule,
  ],
  templateUrl: "./past-requests.component.html",
  styleUrls: ["./past-requests.component.css"],
})
export class PastRequestsComponent implements OnChanges {
  @Input() pastRequests: PastRequest[] = [];
  @Input() loading = false;
  @Input() displayHeader = true;
  @Output() loadRequest = new EventEmitter<PastRequest>();
  @Output() deleteRequest = new EventEmitter<PastRequestKey>();

  private readonly confirmationService = inject(ConfirmationService);

  readonly skeletonPlaceholders = Array.from({ length: 4 }).map((_, i) => i);

  groups: HistoryGroup[] = [];

  ngOnChanges(): void {
    this.groups = this.buildGroups(this.pastRequests);
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

  confirmDelete(req: PastRequest, event: Event) {
    if (typeof req.id !== "undefined") {
      this.confirmationService.confirm({
        target: event.currentTarget as EventTarget,
        message: "Remove this request from history?",
        rejectButtonProps: {
          label: "Cancel",
          severity: "secondary",
          text: true,
        },
        acceptButtonProps: {
          label: "Delete",
          severity: "danger",
        },
        accept: () => this.deleteRequest.emit(req.id),
      });
    }
  }

  trackById(_index: number, item: PastRequest): PastRequestKey | undefined {
    return item.id;
  }
}
