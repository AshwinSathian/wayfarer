import { ChangeDetectionStrategy, Component, computed, input } from "@angular/core";
import { formatDuration, timing } from "@wayfarer/core";
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

/** A phase under this share of the strip is drawn at this width, so that it can be seen. */
const MIN_SEGMENT_PERCENT = 1.5;

interface Segment {
  key: string;
  label: string;
  duration: number;
  percent: number;
  tooltip?: string;
  /** The strip alternates two inks; the legend's swatch takes the same. */
  tone: 0 | 1;
}

/**
 * The Timings tab (S4b3): the summary cards, and a strip of the send's phases drawn against the whole, honest about
 * what it has. A live send shows the phases the browser (or the Local Bridge) measured, and says where they came from;
 * when the server shares none it shows the total alone and says so; a send read back from history holds the total only
 * (it keeps no phases) and says "not recorded".
 */
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
  protected readonly words = timing;
  protected readonly waterfallTooltip = WATERFALL_TOOLTIP;
  protected readonly formatDuration = formatDuration;

  protected readonly cards = computed(() => {
    const data = this.exchange().inspection;
    return [
      { label: "Duration", tip: TIMING_SUMMARY_TOOLTIPS.duration, value: formatDuration(data?.duration) },
      {
        label: "Transfer",
        tip: TIMING_SUMMARY_TOOLTIPS.transferSize,
        value: formatBytes(data?.sizes?.transferSize),
      },
      {
        label: "Encoded",
        tip: TIMING_SUMMARY_TOOLTIPS.encodedBodySize,
        value: formatBytes(data?.sizes?.encodedBodySize),
      },
      {
        label: "Decoded",
        tip: TIMING_SUMMARY_TOOLTIPS.decodedBodySize,
        value: formatBytes(data?.sizes?.decodedBodySize),
      },
    ];
  });

  /** What the strip is made of: the phases, then what they leave out; or the total alone. */
  protected readonly strip = computed((): { segments: Segment[]; source: string; total: number } => {
    const view = this.exchange();
    const phases = this.bars();
    const total = view.inspection?.duration ?? 0;
    if (phases.length) {
      const sum = phases.reduce((all, phase) => all + phase.duration, 0);
      const whole = Math.max(total, sum);
      const segments: Segment[] = phases.map((phase, index) => ({
        key: phase.key ?? phase.label,
        label: phase.label,
        duration: phase.duration,
        percent: Math.max((phase.duration / whole) * 100, MIN_SEGMENT_PERCENT),
        tooltip: phase.tooltip,
        tone: (index % 2) as 0 | 1,
      }));
      const left = whole - sum;
      if ((left / whole) * 100 >= MIN_SEGMENT_PERCENT)
        segments.push({
          key: "unmeasured",
          label: timing.unaccounted,
          duration: left,
          percent: (left / whole) * 100,
          tone: (segments.length % 2) as 0 | 1,
        });
      return {
        segments,
        total: whole,
        source: view.route === "bridge" ? timing.sourceBridge : timing.sourceBrowser,
      };
    }
    const single = this.fallback()[0];
    return {
      segments: single
        ? [{ key: "total", label: single.label, duration: single.duration, percent: 100, tone: 0 as const }]
        : [],
      total: single?.duration ?? 0,
      source: timing.totalOnly,
    };
  });

  /** A send read back from history: the total it kept, no phases. */
  protected readonly recordedTotal = computed(() => this.exchange().record?.durationMs);
}
