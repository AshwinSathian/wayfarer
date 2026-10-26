import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import { Icon } from "../../shared/icon/icon";
import type { BrowserLimits } from "@wayfarer/core";
import { WorkspaceStore } from "../../state/workspace-store";

/**
 * The warnings below as plain text, for the composer's live region (U-075):
 * the region is there from the first render, and a warning drawn with its
 * own region was often not heard.
 */
export function warningsText(limits: BrowserLimits): string {
  const said: string[] = [];
  if (limits.mixedContent === "blocked")
    said.push(
      "The browser will block this request: this page was loaded over HTTPS, and a page like that may not call an http:// address. Use https://, or send it through the Local Bridge.",
    );
  if (limits.dropped.length) {
    const one = limits.dropped.length === 1;
    const who = limits.route === "bridge" ? "The Local Bridge" : "The browser";
    const why =
      limits.route === "bridge"
        ? `the Local Bridge sets ${one ? "this header" : "these headers"} itself, for the connection it makes.`
        : `a page is not allowed to set ${one ? "this header" : "these headers"}.`;
    said.push(`${who} will not send ${limits.dropped.join(", ")}: ${why}`);
  }
  return said.join(" ");
}

/**
 * What will go wrong with the request as it is, said above it: the browser
 * blocks the address, or drops a header (P2.14). The certificate check
 * turned off shows here too, from every tab, since it is set in Settings
 * (`BrowserNotes`). The rest of what the browser does is in that tab.
 */
@Component({
  selector: "app-request-warnings",
  imports: [Icon],
  template: `
    @let limits = store.browserLimits();
    @if (store.draft().settings.tlsInsecure === true) {
      <p
        ><span class="tls-off-pill"><app-icon name="warning" class="icon-xs" /> TLS verification off</span></p
      >
    }
    @if (limits.mixedContent === "blocked") {
      <p class="browser-note-mixed type-footnote text-status-warning flex items-start gap-1.5" aria-hidden="true">
        <app-icon name="warning" class="icon-xs mt-0.5 shrink-0" />
        <span
          >The browser will block this request: this page was loaded over HTTPS, and a page like that may not call an
          <code>http://</code> address. Use <code>https://</code>, or send it through the Local Bridge.</span
        >
      </p>
    }
    @if (limits.dropped.length) {
      <p class="browser-note-dropped type-footnote text-status-warning flex items-start gap-1.5" aria-hidden="true">
        <app-icon name="warning" class="icon-xs mt-0.5 shrink-0" />
        <span>
          {{ limits.route === "bridge" ? "The Local Bridge" : "The browser" }} will not send
          @for (name of limits.dropped; track $index) {
            <code>{{ name }}</code
            >{{ $last ? ":" : ", " }}
          }
          @if (limits.route === "bridge") {
            the Local Bridge sets {{ limits.dropped.length === 1 ? "this header" : "these headers" }} itself, for the
            connection it makes.
          } @else {
            a page is not allowed to set {{ limits.dropped.length === 1 ? "this header" : "these headers" }}.
          }
        </span>
      </p>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RequestWarnings {
  protected readonly store = inject(WorkspaceStore);
}
