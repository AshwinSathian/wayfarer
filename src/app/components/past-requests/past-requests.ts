import { DatePipe } from "@angular/common";
import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from "@angular/core";
import { MatFormField } from "@angular/material/form-field";
import { MatInput } from "@angular/material/input";
import { MatAccordion, MatExpansionPanel, MatExpansionPanelHeader } from "@angular/material/expansion";
import { Confirm } from "../../ui/confirm";
import { MatButton, MatIconButton } from "@angular/material/button";
import { MatCheckbox } from "@angular/material/checkbox";
import { historyExchange, type HarSource } from "../../shared/inspect/har-export";
import { HarExportDialog } from "../har-export/har-export-dialog";
import { MatTooltip } from "@angular/material/tooltip";
import { HoverCard } from "../../ui/hover-card";
import { PastRequest, PastRequestKey } from "../../models/history";
import { Icon } from "../../shared/icon/icon";

/** Whether every word of `query` is part of the entry's URL, or is its method or its status. Case does not matter. */
export function matches(request: PastRequest, query: string): boolean {
  const url = request.sent.url.toLowerCase();
  const method = request.sent.method.toLowerCase();
  const status = String(request.response?.status ?? "");
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => url.includes(word) || method === word || status === word);
}

export interface HistoryGroup {
  label: string;
  requests: PastRequest[];
}

@Component({
  selector: "app-past-requests",
  imports: [MatIconButton, MatFormField, MatInput,
    DatePipe,
    Icon,
    MatButton,
    MatTooltip,
    HoverCard,
    MatAccordion, MatExpansionPanel, MatExpansionPanelHeader,
    MatCheckbox,
    HarExportDialog,
  ],
  templateUrl: "./past-requests.html",
  styleUrl: "./past-requests.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PastRequests {
  readonly pastRequests = input<PastRequest[]>([]);
  readonly loading = input(false);
  readonly displayHeader = input(true);
  readonly loadRequest = output<PastRequest>();
  readonly deleteRequest = output<PastRequestKey>();

  private readonly confirm = inject(Confirm);

  readonly skeletonPlaceholders = Array.from({ length: 4 }).map((_, i) => i);

  /** What the search field holds. Each word must be in the URL, or be the method or the status. */
  readonly query = signal("");

  /** The entries the search leaves, newest first as they are given. */
  private readonly shown = computed(() => this.pastRequests().filter((request) => matches(request, this.query())));
  readonly groups = computed(() => this.buildGroups(this.shown()));

  /** The entries ticked for an export (P4.6 c), by id. One that was deleted since is not among `chosen`. */
  private readonly ticked = signal<ReadonlySet<PastRequestKey>>(new Set());
  protected readonly chosen = computed(() => this.pastRequests().filter((request) => request.id !== undefined && this.ticked().has(request.id)));
  protected readonly allShownChosen = computed(() => this.shown().length > 0 && this.shown().every((request) => request.id !== undefined && this.ticked().has(request.id)));
  /** What the HAR dialog exports. Null while it is closed. */
  protected readonly harSource = signal<HarSource | null>(null);

  protected isChosen(request: PastRequest): boolean {
    return request.id !== undefined && this.ticked().has(request.id);
  }

  protected choose(request: PastRequest, on: boolean): void {
    if (request.id === undefined) return;
    const next = new Set(this.ticked());
    if (on) next.add(request.id);
    else next.delete(request.id);
    this.ticked.set(next);
  }

  /** Ticks every entry the search shows, or unticks them when all are ticked. */
  protected chooseShown(): void {
    const next = new Set(this.ticked());
    const on = !this.allShownChosen();
    for (const request of this.shown()) {
      if (request.id === undefined) continue;
      if (on) next.add(request.id);
      else next.delete(request.id);
    }
    this.ticked.set(next);
  }

  /** The ticked entries as a HAR, oldest first: the order a reader of a log expects. */
  protected exportChosen(): void {
    const exchanges = [...this.chosen()].sort((a, b) => a.createdAt - b.createdAt).map(historyExchange);
    this.harSource.set({ name: "wayfarer-history", credentials: false, exchanges: () => exchanges });
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
