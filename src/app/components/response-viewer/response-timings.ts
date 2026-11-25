import { ChangeDetectionStrategy, Component, input } from "@angular/core";
import { formatDuration } from "@wayfarer/core";
import type { ExchangeView } from "../../state/exchange-view";
import { Icon } from "../../shared/icon/icon";
import { UiTooltip } from "../../ui/tooltip";
import {
  TIMING_SUMMARY_TOOLTIPS,
  WATERFALL_TOOLTIP,
  formatBytes,
  type getFallbackBars,
  type getTimingBars,
} from "../../shared/inspect/timing-bars";

/** The Timings tab: the summary cards and the waterfall of the send's phases, as the browser measured them. */
@Component({
  selector: "app-response-timings",
  imports: [Icon, UiTooltip],
  host: { class: "block" },
  templateUrl: "./response-timings.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResponseTimings {
  readonly exchange = input.required<ExchangeView>();
  readonly bars = input.required<ReturnType<typeof getTimingBars>>();
  readonly fallback = input.required<ReturnType<typeof getFallbackBars>>();
  protected readonly summaryTooltips = TIMING_SUMMARY_TOOLTIPS;
  protected readonly waterfallTooltip = WATERFALL_TOOLTIP;
  protected readonly formatDuration = formatDuration;
  protected readonly formatBytes = formatBytes;
}
