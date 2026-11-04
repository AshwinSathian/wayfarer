import { DatePipe } from "@angular/common";
import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from "@angular/core";
import { UiInput } from "../../ui/input";
import { UiCheckbox } from "../../ui/checkbox";
import { Confirm } from "../../ui/confirm";
import { UiButton } from "../../ui/button";
import { historyExchange, type HarSource } from "../../shared/inspect/har-export";
import { HarExportDialog } from "../har-export/har-export-dialog";
import { UiTooltip } from "../../ui/tooltip";
import { MODEL_ACTION_WORDS, type PastRequest } from "@wayfarer/core";
import { UiSegmented, type UiSegment } from "../../ui/segmented";
import { ExchangeRecordView } from "../exchange-record/exchange-record";
import { Icon } from "../../shared/icon/icon";
import { statusTone } from "../../shared/status-tone";

/**
 * Whether every word of `query` is part of the entry's URL or of the name and place of the saved request it was sent
 * from, or is its method or its status; for a model call, also part of its action, host or model (D4.10). Case does
 * not matter.
 */
export function matches(request: PastRequest, query: string): boolean {
  const url = request.sent.url.toLowerCase();
  const from = request.sentFrom ? [request.sentFrom.name, ...request.sentFrom.path].join(" ").toLowerCase() : "";
  const method = request.sent.method.toLowerCase();
  const status = String(request.response?.status ?? "");
  const model = request.model
    ? `${MODEL_ACTION_WORDS[request.model.action]} ${hostOf(request)} ${request.model.model}`.toLowerCase()
    : "";
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every(
      (word) => url.includes(word) || from.includes(word) || method === word || status === word || model.includes(word),
    );
}

/** The host a request went to, as its record names it; the address when it has none. */
export function hostOf(request: PastRequest): string {
  return request.record?.host ?? request.sent.url;
}

/** Which entries History lists: all, the requests sent, or the calls to a model (D4.10). */
export type HistoryKind = "all" | "requests" | "models";

const KINDS: UiSegment<HistoryKind>[] = [
  { value: "all", label: "All" },
  { value: "requests", label: "Requests" },
  { value: "models", label: "Model calls" },
];

export interface HistoryGroup {
  label: string;
  requests: PastRequest[];
}

@Component({
  selector: "app-past-requests",
  imports: [UiButton, UiInput, DatePipe, Icon, UiTooltip, UiCheckbox, HarExportDialog, UiSegmented, ExchangeRecordView],
  templateUrl: "./past-requests.html",
  styleUrl: "./past-requests.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { "(keydown.escape)": "collapse($event)" },
})
export class PastRequests {
  protected readonly statusTone = statusTone;
  readonly pastRequests = input<PastRequest[]>([]);
  readonly loading = input(false);
  readonly displayHeader = input(true);
  readonly loadRequest = output<PastRequest>();
  readonly deleteRequest = output<number>();
  /** Clear history… was chosen: the shell asks, then clears. */
  readonly clearAll = output<void>();

  /** Rows have their boxes, and the bar its export, only while choosing (U-024). */
  readonly selecting = signal(false);

  private readonly confirm = inject(Confirm);

  readonly skeletonPlaceholders = Array.from({ length: 4 }).map((_, i) => i);

  /** What the search field holds. Each word must be in the URL or the saved request's name or place, or be the method or the status. */
  readonly query = signal("");

  protected readonly kinds = KINDS;
  protected readonly actionWords = MODEL_ACTION_WORDS;
  protected readonly hostOf = hostOf;
  /** Which entries are listed. The choice is drawn only while history holds a model call. */
  readonly kind = signal<HistoryKind>("all");
  protected readonly hasModelCalls = computed(() => this.pastRequests().some((request) => request.model));
  /** What the drawer's status region says: the count after the filter changed. */
  protected readonly said = signal("");
  /** The model call opened into its record, by id: it loads into no tab (log.md). */
  protected readonly expanded = signal<number | undefined>(undefined);
  /** Which kept text of the opened model call is shown. */
  protected readonly showing = signal<"sent" | "answer" | null>(null);

  /** The entries the filter and the search leave, newest first as they are given. */
  private readonly shown = computed(() => {
    const kind = this.hasModelCalls() ? this.kind() : "all";
    return this.pastRequests().filter(
      (request) => (kind === "all" || (kind === "models") === !!request.model) && matches(request, this.query()),
    );
  });

  protected chooseKind(kind: HistoryKind): void {
    this.kind.set(kind);
    this.said.set(`${this.shown().length} ${this.shown().length === 1 ? "entry" : "entries"}.`);
  }
  readonly groups = computed(() => this.buildGroups(this.shown()));

  /** The entries ticked for an export (P4.6 c), by id. One that was deleted since is not among `chosen`. */
  private readonly ticked = signal<ReadonlySet<number>>(new Set());
  protected readonly chosen = computed(() =>
    this.pastRequests().filter((request) => request.id !== undefined && this.ticked().has(request.id)),
  );
  protected readonly allShownChosen = computed(
    () =>
      this.shown().length > 0 &&
      this.shown().every((request) => request.id !== undefined && this.ticked().has(request.id)),
  );
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

  protected stopSelecting(): void {
    this.selecting.set(false);
    this.ticked.set(new Set());
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

  /** A send's entry loads into a tab; a model call's opens into its record in place, since Send would use its key. */
  load(req: PastRequest) {
    if (!req.model) {
      this.loadRequest.emit(req);
      return;
    }
    this.expanded.set(this.expanded() === req.id ? undefined : req.id);
    this.showing.set(null);
  }

  /** Escape inside an opened model call's row closes it, not the drawer, and focus goes back to the row. */
  protected collapse(event: Event): void {
    const row = (event.target as HTMLElement).closest(".history-row");
    if (!row?.querySelector(".history-model-record")) return;
    event.preventDefault();
    this.expanded.set(undefined);
    row.querySelector<HTMLElement>(".history-open")?.focus();
  }

  /** The headers of what was sent, as kept: one per line. */
  protected headerLines(request: PastRequest): string {
    return request.sent.headers.map(([name, value]) => `${name}: ${value}`).join("\n");
  }

  async confirmDelete(req: PastRequest, event: Event): Promise<void> {
    const id = req.id;
    if (typeof id === "undefined") return;
    const confirmed = await this.confirm.confirm({
      message: `Delete ${req.sent.method} ${req.sent.url} from history?`,
      acceptLabel: "Delete",
      anchor: event.currentTarget as HTMLElement,
    });
    if (confirmed) this.deleteRequest.emit(id);
  }

  trackById(_index: number, item: PastRequest): number | undefined {
    return item.id;
  }
}
