import { EmptyState } from "../../shared/empty-state/empty-state";
import { DatePipe } from "@angular/common";
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from "@angular/core";
import { UiInput } from "../../ui/input";
import { UiCheckbox } from "../../ui/checkbox";
import { Confirm } from "../../ui/confirm";
import { UiButton } from "../../ui/button";
import { historyExchange, type HarSource } from "../../shared/inspect/har-export";
import { HarExportDialog } from "../har-export/har-export-dialog";
import { UiTooltip } from "../../ui/tooltip";
import { UiMethodGlyph } from "../../ui/method-glyph";
import {
  MODEL_ACTION_WORDS,
  ROUTE_NAMES,
  compare,
  empty,
  formatDuration,
  type ExchangeRecord,
  type PastRequest,
} from "@wayfarer/core";
import { statusTone } from "../../shared/http/status-tone";
import { UiSegmented, type UiSegment } from "../../ui/segmented";
import { Icon } from "../../shared/icon/icon";
import { HistoryRepository, type HistorySummary } from "../../data/history-repository";
import type { UiSelectOption } from "../../ui/select";
import { ExchangeDiff } from "./exchange-diff";
import { FILTER_HELP, addressParts, hostOf, matches, parseFilter } from "./history-filter";
import { HistoryDetail } from "./history-detail";
import { HistoryModelRecord } from "./history-model-record";

/** Which entries History lists: all, the requests sent, or the calls to a model (D4.10). */
export type HistoryKind = "all" | "requests" | "models";

const KINDS: UiSegment<HistoryKind>[] = [
  { value: "all", label: "All" },
  { value: "requests", label: "Requests" },
  { value: "models", label: "Model calls" },
];

export interface HistoryGroup {
  label: string;
  requests: HistorySummary[];
}

@Component({
  selector: "app-past-requests",
  imports: [
    EmptyState,
    UiMethodGlyph,
    UiButton,
    UiInput,
    DatePipe,
    Icon,
    UiTooltip,
    UiCheckbox,
    HarExportDialog,
    UiSegmented,
    ExchangeDiff,
    HistoryDetail,
    HistoryModelRecord,
  ],
  templateUrl: "./past-requests.html",
  styleUrl: "./past-requests.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { "(keydown.escape)": "collapse($event)" },
})
export class PastRequests {
  protected readonly statusTone = statusTone;
  readonly pastRequests = input<HistorySummary[]>([]);
  readonly loading = input(false);
  readonly displayHeader = input(true);
  /** "Send a request", in the empty list: the shell closes History and puts the caret in the address. */
  readonly sendRequest = output<void>();
  protected readonly empty = empty;
  readonly loadRequest = output<HistorySummary>();
  readonly deleteRequest = output<number>();
  /** Clear history… was chosen: the shell asks, then clears. */
  readonly clearAll = output<void>();

  /** Rows have their boxes, and the bar its export, only while choosing (U-024). */
  readonly selecting = signal(false);

  private readonly confirm = inject(Confirm);
  private readonly history = inject(HistoryRepository);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

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
  /** That model call's entry as kept, read by its id when it was opened: the list holds no record or body. */
  protected readonly opened = signal<(PastRequest & { record: ExchangeRecord }) | null>(null);

  /** The entries the filter and the search leave, newest first as they are given. */
  private readonly shown = computed(() => {
    const kind = this.hasModelCalls() ? this.kind() : "all";
    return this.pastRequests().filter(
      (request) => (kind === "all" || (kind === "models") === !!request.model) && matches(request, this.query()),
    );
  });

  /** What the search field says its tokens are, and which it was given wrong. */
  protected readonly filterHelp = FILTER_HELP.join("  ");
  protected readonly invalid = computed(() => parseFilter(this.query()).invalid);
  protected readonly addressParts = addressParts;
  protected readonly route = ROUTE_NAMES;
  protected readonly compareWords = compare;

  /**
   * An entry the list was asked to open, from outside (a tab's response: "Compare this response with…"). The shell
   * gives it again after it has been used, so the same entry can be asked for twice.
   */
  readonly openEntry = input<{ id: number; compare: boolean } | null>(null);
  /** The rail is drawn: the shell widens the drawer for it. */
  readonly railChange = output<boolean>();
  /** The entry in the rail, as kept (read by its id), or the two a diff compares. */
  protected readonly detail = signal<PastRequest | null>(null);
  protected readonly diff = signal<{ a: PastRequest; b: PastRequest } | null>(null);
  protected readonly railOpen = computed(() => !!this.detail() || !!this.diff());
  /** What the last open or compare could not do: an entry that is gone since the list was read. */
  protected readonly gone = signal("");

  constructor() {
    effect(() => this.railChange.emit(this.railOpen()));
    effect(() => {
      const wanted = this.openEntry();
      if (wanted) void this.showDetail(wanted.id, wanted.compare);
    });
  }

  /** The entries the rail may compare the open one with: sends, newest first, at most the newest fifty. */
  protected readonly others = computed((): UiSelectOption<number>[] => {
    const open = this.detail()?.id;
    return this.pastRequests()
      .filter((request) => request.id !== undefined && request.id !== open && !request.model)
      .slice(0, 50)
      .map((request) => ({
        value: request.id ?? -1,
        label: `${request.sent.method} ${request.sent.url} · ${request.response?.status ?? "No response"} · ${this.relativeTime(request.createdAt)}`,
      }));
  });

  /** Two entries are ticked: one click compares them. */
  protected readonly twoChosen = computed(() => this.chosen().length === 2);

  /** The rail was opened to compare, from a tab's response: its choice takes focus. */
  protected readonly asked = signal(false);

  /** Each open or compare takes a number; an answer that is not the latest is dropped, so a slow read never replaces a later one. */
  private latest = 0;

  protected async showDetail(id: number | undefined, asked = false): Promise<void> {
    this.asked.set(asked);
    this.gone.set("");
    const turn = ++this.latest;
    const entry = id === undefined ? null : await this.history.get(id);
    if (turn !== this.latest) return;
    if (!entry) {
      this.gone.set(compare.gone);
      return;
    }
    this.diff.set(null);
    this.detail.set(entry);
  }

  /** Compares the entries `a` and `b`, each read by its id: what the diff holds is what history kept, masked. */
  protected async showDiff(a: number | undefined, b: number | undefined): Promise<void> {
    this.gone.set("");
    const turn = ++this.latest;
    const read = async (id: number | undefined) => (id === undefined ? null : await this.history.get(id));
    const [one, two] = await Promise.all([read(a), read(b)]);
    if (turn !== this.latest) return;
    if (!one || !two) {
      this.gone.set(compare.gone);
      return;
    }
    this.diff.set({ a: one, b: two });
  }

  protected compareChosen(): void {
    const [a, b] = this.chosen();
    void this.showDiff(a?.id, b?.id);
  }

  protected closeRail(): void {
    const id = this.detail()?.id ?? this.diff()?.a.id;
    this.diff.set(null);
    this.detail.set(null);
    // The list is drawn again: focus goes back to the row the rail was opened from.
    afterNextRender(
      () => this.host.nativeElement.querySelector<HTMLElement>(`[data-entry="${id}"] .history-details`)?.focus(),
      { injector: this.injector },
    );
  }

  /** Back from a diff to the entry it was started from, if there is one. */
  protected closeDiff(): void {
    this.diff.set(null);
  }

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

  protected isChosen(request: HistorySummary): boolean {
    return request.id !== undefined && this.ticked().has(request.id);
  }

  protected choose(request: HistorySummary, on: boolean): void {
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

  /** The ticked entries as a HAR, oldest first: the order a reader of a log expects. Each is read by its id. */
  protected async exportChosen(): Promise<void> {
    const chosen = [...this.chosen()].sort((a, b) => a.createdAt - b.createdAt);
    const entries = await Promise.all(chosen.map((request) => this.history.get(request.id ?? -1)));
    const exchanges = entries.filter((entry) => entry !== null).map(historyExchange);
    this.harSource.set({ name: "wayfarer-history", credentials: false, exchanges: () => exchanges });
  }

  private buildGroups(requests: HistorySummary[]): HistoryGroup[] {
    const now = Date.now();
    const startOfToday = this.startOfDay(now);
    const startOfYesterday = startOfToday - 86_400_000;
    const startOfWeek = startOfToday - 6 * 86_400_000;

    const buckets: Record<string, HistorySummary[]> = {
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

  protected readonly formatDuration = formatDuration;

  /** A send's entry loads into a tab; a model call's opens into its record in place, since Send would use its key. */
  async load(req: HistorySummary): Promise<void> {
    if (!req.model) {
      this.loadRequest.emit(req);
      return;
    }
    if (this.expanded() === req.id || req.id === undefined) {
      this.expanded.set(undefined);
      return;
    }
    const entry = await this.history.get(req.id);
    this.opened.set(entry?.record ? { ...entry, record: entry.record } : null);
    this.expanded.set(req.id);
  }

  /** Escape inside an opened model call's row closes it, not the drawer, and focus goes back to the row. */
  protected collapse(event: Event): void {
    if (this.railOpen() && !event.defaultPrevented) {
      event.preventDefault();
      this.closeRail();
      return;
    }
    const row = (event.target as HTMLElement).closest(".history-row");
    if (!row?.querySelector(".history-model-record")) return;
    event.preventDefault();
    this.expanded.set(undefined);
    row.querySelector<HTMLElement>(".history-open")?.focus();
  }

  async confirmDelete(req: HistorySummary, event: Event): Promise<void> {
    const id = req.id;
    if (typeof id === "undefined") return;
    const confirmed = await this.confirm.confirm({
      message: `Delete ${req.sent.method} ${req.sent.url} from history?`,
      acceptLabel: "Delete",
      anchor: event.currentTarget as HTMLElement,
    });
    if (confirmed) this.deleteRequest.emit(id);
  }

  trackById(_index: number, item: HistorySummary): number | undefined {
    return item.id;
  }
}
