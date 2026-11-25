import { ChangeDetectionStrategy, Component, computed, input, output } from "@angular/core";
import { MenuTrigger } from "@angular/aria/menu";
import {
  buildCurl,
  copyNote,
  formatDuration,
  redactExport,
  type HarExchange,
  type RedactOptions,
} from "@wayfarer/core";
import type { ExchangeView } from "../../state/exchange-view";
import { NOT_COPIED, writeToClipboard } from "../../shared/http/clipboard";
import { statusTone } from "../../shared/http/status-tone";
import { transientNote } from "../../shared/http/transient-note";
import { Icon } from "../../shared/icon/icon";
import { exportRedactor } from "../../shared/inspect/export";
import { harText, type HarSource } from "../../shared/inspect/har-export";
import { buildExportEntry } from "../../shared/inspect/response-export-entry";
import { formatBytes } from "../../shared/inspect/timing-bars";
import { UiButton } from "../../ui/button";
import { UiMenu } from "../../ui/menu";
import { UiMenuItem } from "../../ui/menu-item";
import { UiTooltip } from "../../ui/tooltip";

/**
 * The response's status line (U-030), drawn onto the `<div>` the viewer gives it (an attribute selector: the line's
 * rules name that div): the status, what it took, where the request went and Export.
 */
@Component({
  // eslint-disable-next-line @angular-eslint/component-selector
  selector: "div[appResponseStatus]",
  imports: [Icon, MenuTrigger, UiButton, UiMenu, UiTooltip],
  templateUrl: "./response-status.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResponseStatus {
  readonly exchange = input.required<ExchangeView>();
  readonly loading = input(false);
  readonly recordOpen = input(false);
  readonly recordOpenChange = output<boolean>();
  /** The HAR the person asked to see before it is copied or saved (P4.6 c). */
  readonly exportHar = output<HarSource>();

  protected readonly statusTone = statusTone;
  protected readonly formatDuration = formatDuration;
  protected readonly formatBytes = formatBytes;
  /** What the last copy did, beside the export button for a few seconds (U-050). */
  protected readonly copyStatus = transientNote();

  protected readonly canExport = computed(() => {
    const view = this.exchange();
    return !this.loading() && !!view.exportContext && view.statusCode !== undefined;
  });

  readonly exportItems: UiMenuItem[] = [
    { label: "Copy as cURL", icon: "terminal", command: () => void this.copyAsCurl() },
    { label: "Copy as HAR", icon: "content_copy", command: () => void this.copyAsHar() },
    { separator: true },
    // Credentials are masked unless asked for; a vault secret is masked either way (D5).
    {
      label: "Copy as cURL with credentials",
      icon: "terminal",
      command: () => void this.copyAsCurl({ credentials: true }),
    },
    {
      label: "Copy as HAR with credentials",
      icon: "content_copy",
      command: () => void this.copyAsHar({ credentials: true }),
    },
    { separator: true },
    // The file, shown before it is copied or saved (P4.6 c).
    {
      label: "Export as HAR…",
      icon: "download",
      command: () =>
        this.exportHar.emit({
          name: "wayfarer-response",
          credentials: true,
          exchanges: (options) => this.harExchanges(options),
        }),
    },
  ];

  async copyAsCurl(options: RedactOptions = {}): Promise<void> {
    const context = this.exchange().exportContext;
    if (!context) return;
    const source = { ...context, headers: Object.entries(context.headers), body: context.exportBody };
    const copied = await writeToClipboard(buildCurl(redactExport(source, options)));
    this.copyStatus.show(copied ? copyNote("cURL", source, options, buildCurl) : NOT_COPIED);
  }

  async copyAsHar(options: RedactOptions = {}): Promise<void> {
    const exchanges = this.harExchanges(options);
    if (!exchanges.length) return;
    const text = await harText(exchanges);
    if (!(await writeToClipboard(text))) return this.copyStatus.show(NOT_COPIED);
    // Vault secrets are masked in a HAR whatever is asked; the note says only what this copy did to credentials.
    const masked = !options.credentials && text !== (await harText(this.harExchanges({ credentials: true })));
    this.copyStatus.show(
      `Copied as HAR${options.credentials ? ", with credentials" : ""}.${masked ? " Its credentials are replaced by ***." : ""}`,
    );
  }

  /**
   * The exchange on screen for a HAR, masked: the request as it was sent, with its body in every mode, and the
   * response when it is text. The response is masked as well: a server may send a credential back.
   */
  private harExchanges(options: RedactOptions): HarExchange[] {
    const view = this.exchange();
    const context = view.exportContext;
    const entry = buildExportEntry({
      context,
      inspection: view.inspection,
      statusCode: view.statusCode,
      statusText: view.statusText,
      responseHeaders: view.headers,
      isError: view.isError,
      responseData: view.data,
      responseError: view.error,
    });
    if (!entry || !context) return [];
    const redactor = exportRedactor(context, options);
    const body = entry.res.body;
    const { dns, tcp, tls, request, ttfb, content } = entry.phases ?? {};
    return [
      {
        startedAt: entry.startedDateTime,
        timeMs: entry.time,
        request: redactExport(
          { ...context, headers: Object.entries(context.headers), body: context.exportBody },
          options,
        ),
        response: {
          status: entry.res.status,
          statusText: entry.res.statusText,
          headers: redactor.headers(entry.res.headers, options),
          ...(typeof body === "string" && !view.binary && { text: redactor.text(body) }),
          size: entry.res.sizes?.encodedBodySize,
        },
        timings: { dns, connect: tcp, ssl: tls, send: request, wait: ttfb, receive: content },
      },
    ];
  }
}
