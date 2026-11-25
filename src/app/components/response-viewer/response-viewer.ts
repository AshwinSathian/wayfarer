import { formatDuration, MAX_REDIRECTS, type ExchangeRecord } from "@wayfarer/core";
import {
  ChangeDetectionStrategy,
  Component,
  Signal,
  computed,
  inject,
  input,
  model,
  output,
  signal,
  effect,
} from "@angular/core";
import { FailurePanel } from "../failure-panel/failure-panel";
import { Tab, TabContent, TabPanel, Tabs } from "@angular/aria/tabs";
import type { BinaryBody, FailureAction, ResponseEnvelope, SendTimings, SentView, TestResult } from "@wayfarer/core";
import { AiSettings } from "../../services/ai-settings";
import { Diagnostics } from "../../services/diagnostics";
import { Icon } from "../../shared/icon/icon";
import { ResponseExportContext } from "../../shared/inspect/response-export-entry";
import { ResponseInspection } from "../../shared/inspect/response-inspector";
import { getFallbackBars, getTimingBars } from "../../shared/inspect/timing-bars";
import { type HarSource } from "../../shared/inspect/har-export";
import { JsonWorkerClient } from "../../shared/json-worker/json-worker-client";
import { liveExchange } from "../../state/exchange-view";
import type { ShownEvent } from "../../state/tab-state";
import { UiButton } from "../../ui/button";
import { UiSpinner } from "../../ui/spinner";
import { UiTabList } from "../../ui/tabs";
import { AiExplain } from "../ai-explain/ai-explain";
import { ExchangeRecordView } from "../exchange-record/exchange-record";
import { HarExportDialog } from "../har-export/har-export-dialog";
import { BodyModel } from "./body-model";
import { EventList } from "./event-list";
import { ResponseBody } from "./response-body";
import { ResponseHeaders } from "./response-headers";
import { ResponseSent } from "./response-sent";
import { ResponseStatus } from "./response-status";
import { ResponseTests } from "./response-tests";
import { ResponseTimings } from "./response-timings";

export type { ResponseExportContext } from "../../shared/inspect/response-export-entry";

type ResponseTab = "body" | "headers" | "timings" | "sent" | "tests" | "events";

/** Below this, a send shows nothing: a quick reply is not preceded by an indicator that flashes (U-078). */
const SENDING_SHOWN_AFTER_MS = 1000;

/**
 * The response pane: the status line, the exchange record, the redirects and the tabs. Its inputs are the open tab's
 * response (the composer binds them from the store, which forwards to that tab); they are gathered into one
 * `ExchangeView`, and each part (`ResponseStatus`, `ResponseBody`, `ResponseHeaders`, `ResponseTimings`,
 * `ResponseTests`, `EventList`) draws from that view alone.
 */
@Component({
  selector: "app-response-viewer",
  imports: [
    AiExplain,
    EventList,
    ExchangeRecordView,
    FailurePanel,
    HarExportDialog,
    Icon,
    Tab,
    TabContent,
    TabPanel,
    Tabs,
    UiTabList,
    UiButton,
    UiSpinner,
    ResponseBody,
    ResponseHeaders,
    ResponseSent,
    ResponseStatus,
    ResponseTests,
    ResponseTimings,
  ],
  templateUrl: "./response-viewer.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResponseViewer {
  protected readonly ai = inject(AiSettings);
  private readonly diagnostics = inject(Diagnostics);
  private readonly jsonWorker = inject(JsonWorkerClient);

  readonly loading = input(false);
  /** When the send on its way started (`Date.now()`). */
  readonly sendingSince = input<number | null>(null);
  /**
   * How long the send has been on its way, drawn only after about a second
   * (D3.7): a reply sooner than that has no indicator at all, and the answer
   * appears in the frame it is ready.
   */
  private readonly now = signal(Date.now());
  protected readonly sendingFor = computed(() => {
    const since = this.sendingSince();
    if (!this.loading() || since === null) return null;
    const ms = this.now() - since;
    return ms >= SENDING_SHOWN_AFTER_MS ? formatDuration(ms) : null;
  });
  /** Beside the request (from 768 px) the response fills its pane, and a JSON or XML body the room left in it. */
  readonly fill = input(false);
  readonly responseData = input("");
  readonly responseError = input("");
  readonly responseBodyIsJson = input(false);
  readonly responseHeaders = input<{ name: string; value: string }[]>([]);
  readonly responseStatusCode = input<number>();
  readonly responseStatusText = input<string>();
  readonly isError = input(false);
  /** The one thing a failure panel offers, chosen: the composer does it (send again, open a setting). */
  readonly failureAction = output<FailureAction>();
  readonly inspection = input<Signal<ResponseInspection | null> | null>();
  readonly responseContentLength = input<number>();
  readonly exportContext = input<ResponseExportContext | null>(null);
  readonly testResults = input<TestResult[]>([]);
  /** What the request's scripts wrote with `console`. */
  readonly scriptLogs = input<string[]>([]);
  /** The request had scripts that were left out because they are not approved. */
  readonly scriptsSkipped = input(false);
  /** The held line's and the empty Tests line's button: the request's Scripts tab, which the composer holds (U-202). */
  readonly openScripts = output<void>();
  /** How long the scripts and the request took, each by itself; shown when a script ran. */
  readonly timings = input<SendTimings | null>(null);
  readonly responseBinary = input<BinaryBody | null>(null);
  /** The URL the response came from, when the request was redirected. */
  readonly redirectedTo = input<string>();
  /** The redirects that were followed through the Local Bridge (P5.4), and why no more were. */
  readonly redirects = input<ResponseEnvelope["redirects"]>();
  /** The response was got with the server's certificate not verified. */
  readonly tlsInsecure = input(false);
  /** Where the response came from (P6.4): the page, or the Local Bridge. */
  readonly route = input<"direct" | "bridge" | null>(null);
  /** What the send did (D4.12), shown under the status line while open. */
  readonly record = input<ExchangeRecord | null>(null);
  /** The request as sent, masked as history keeps it (the Sent tab). */
  readonly sent = input<SentView | null>(null);
  readonly recordOpen = input(false);
  readonly recordOpenChange = output<boolean>();
  /** The `Content-Type` header as received: it chooses the view. */
  readonly responseContentType = input("");
  /** The browser withheld some response headers (a direct answer from another origin). */
  readonly headersLimited = input(false);
  /** The events of a response that is an event stream (P5.6), how many it gave in all, and what there is to say of it. */
  readonly events = input<ShownEvent[]>([]);
  readonly eventCount = input(0);
  readonly eventsNote = input("");
  readonly stopStream = output<void>();
  readonly reconnectStream = output<void>();
  readonly activeTab = model<ResponseTab>("body");

  protected readonly inspectionValue = computed((): ResponseInspection | null => this.inspection()?.() ?? null);

  /** The exchange on screen: the live variant, from the response the composer hands in. */
  readonly exchange = computed(() =>
    liveExchange({
      statusCode: this.responseStatusCode(),
      statusText: this.responseStatusText(),
      headers: this.responseHeaders(),
      headersLimited: this.headersLimited(),
      isError: this.isError(),
      data: this.responseData(),
      error: this.responseError(),
      bodyIsJson: this.responseBodyIsJson(),
      binary: this.responseBinary(),
      contentType: this.responseContentType(),
      contentLength: this.responseContentLength(),
      redirectedTo: this.redirectedTo(),
      redirects: this.redirects(),
      tlsInsecure: this.tlsInsecure(),
      route: this.route(),
      record: this.record(),
      sent: this.sent(),
      inspection: this.inspectionValue(),
      timings: this.timings(),
      testResults: this.testResults(),
      scriptLogs: this.scriptLogs(),
      scriptsSkipped: this.scriptsSkipped(),
      events: this.events(),
      eventCount: this.eventCount(),
      eventsNote: this.eventsNote(),
      exportContext: this.exportContext(),
    }),
  );

  /** The tab on show: with no response only Tests and Sent exist, and Sent only while the tab holds a send. */
  protected readonly shownTab = computed((): ResponseTab => {
    const { sent, isError, statusCode, testResults } = this.exchange();
    const tab = this.activeTab();
    if (isError && statusCode === undefined) {
      const there: ResponseTab[] = [
        ...(testResults.length ? (["tests"] as const) : []),
        ...(sent ? (["sent"] as const) : []),
      ];
      return there.includes(tab) ? tab : (there[0] ?? "tests");
    }
    return tab === "sent" && !sent ? "body" : tab;
  });

  /** The Body tab's views, formatting and search. */
  protected readonly body = new BodyModel(this.exchange, this.activeTab, this.jsonWorker, this.diagnostics);
  readonly views = this.body.views;
  readonly view = this.body.view;
  readonly viewOverride = this.body.viewOverride;
  readonly xmlText = this.body.xmlText;
  readonly filteredJson = this.body.filteredJson;
  readonly imageUrl = this.body.imageUrl;
  readonly onSearchQueryChange = (value: string) => this.body.onSearchQueryChange(value);

  readonly timingBars = computed(() => getTimingBars(this.inspectionValue()));
  readonly fallbackBars = computed(() => getFallbackBars(this.inspectionValue()));

  /** What the HAR dialog exports. Null while it is closed. */
  protected readonly harSource = signal<HarSource | null>(null);

  get testFailCount(): number {
    return this.testResults().filter((r) => !r.passed).length;
  }

  /** The scripts did not run, so the Tests tab says so instead of showing nothing (S4b3). */
  protected readonly testsHeld = computed(() => this.scriptsSkipped());

  /** The exchange record of a send that got no response: the panel says it, and the record holds the rest. */
  protected readonly failedRecord = computed(() => {
    const { isError, statusCode, record } = this.exchange();
    return isError && statusCode === undefined && record?.failure ? record : null;
  });

  /** Why the response is a redirect that was not followed, in words. */
  protected readonly redirectNote = computed(() => {
    switch (this.redirects()?.stopped) {
      case "other-host":
        return "Not followed: this redirect leaves the host, and the request holds a vault secret that was written for this one. To send the request there, put that address into it.";
      case "location":
        return "Not followed: its Location is not an http or https address.";
      case "limit":
        return `Not followed: ${MAX_REDIRECTS} redirects are followed at most.`;
      case "off":
        return "Not followed: Follow redirects is off for this request.";
      default:
        return "";
    }
  });

  constructor() {
    // The time so far ticks only while a send is on its way.
    effect((onCleanup) => {
      if (!this.loading()) return;
      const timer = setInterval(() => this.now.set(Date.now()), 100);
      onCleanup(() => clearInterval(timer));
    });
  }
}
