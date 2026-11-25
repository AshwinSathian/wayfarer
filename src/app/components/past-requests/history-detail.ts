import { DatePipe } from "@angular/common";
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  input,
  output,
  signal,
} from "@angular/core";
import { ROUTE_NAMES, compare, formatDuration, sentPart, type PastRequest } from "@wayfarer/core";
import { statusTone } from "../../shared/http/status-tone";
import { Icon } from "../../shared/icon/icon";
import { recordedExchange } from "../../state/exchange-view";
import { UiButton } from "../../ui/button";
import { UiSegmented, type UiSegment } from "../../ui/segmented";
import { UiSelect, type UiSelectOption } from "../../ui/select";
import { ResponseHeaders } from "../response-viewer/response-headers";
import { ResponseSent } from "../response-viewer/response-sent";

type Part = "body" | "headers" | "sent";

const PARTS: UiSegment<Part>[] = [
  { value: "body", label: "Response" },
  { value: "headers", label: "Headers" },
  { value: "sent", label: sentPart.tab },
];

/**
 * One history entry opened beside the list: the recorded variant of the exchange (status, headers, the body when it
 * was kept, and what was sent), and the way to compare it with another. It draws what the entry holds, which the
 * redactor has masked, and says what history does not keep (timings, test results) instead of leaving it out.
 */
@Component({
  selector: "app-history-detail",
  imports: [DatePipe, Icon, ResponseHeaders, ResponseSent, UiButton, UiSegmented, UiSelect],
  templateUrl: "./history-detail.html",
  styleUrl: "./history-detail.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "history-detail" },
})
export class HistoryDetail {
  readonly entry = input.required<PastRequest>();
  /** The other entries it may be compared with, newest first. */
  readonly others = input<UiSelectOption<number>[]>([]);
  /** Asked to open for a comparison: focus goes to the choice. */
  readonly focusCompare = input(false);
  readonly closed = output<void>();
  readonly opened = output<void>();
  readonly compared = output<number>();

  /** The entry chosen to compare with: nothing is compared until the button says so. */
  protected readonly chosen = signal<number | null>(null);
  protected readonly parts = PARTS;
  protected readonly part = signal<Part>("body");
  protected readonly words = compare;
  protected readonly route = ROUTE_NAMES;
  protected readonly statusTone = statusTone;
  protected readonly formatDuration = formatDuration;
  protected readonly view = computed(() => recordedExchange(this.entry()));
  /** The body, or what stands where there is none. */
  protected readonly bodyText = computed(() => {
    const view = this.view();
    return view.isError ? view.error : view.data;
  });

  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    afterNextRender(() => {
      // What had focus may be gone (the list is hidden under 64 em): focus goes into the rail.
      host.querySelector<HTMLElement>(this.focusCompare() ? ".detail-compare ui-select" : "button")?.focus();
    });
  }
}
