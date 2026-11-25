import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  input,
  output,
} from "@angular/core";
import { ROUTE_NAMES, compare, diffExchanges, formatDuration, type PastRequest } from "@wayfarer/core";
import { UiButton } from "../../ui/button";
import { Icon } from "../../shared/icon/icon";

/** What an entry is called in a heading: its method and address. */
function name(entry: PastRequest): string {
  return `${entry.sent.method} ${entry.sent.url}`;
}

/**
 * Two exchanges side by side in words: status, route, request, headers, body (a JSON body by path, the paths that
 * changed first) and the time, with `not recorded` for what history does not keep. It is given two history entries and
 * nothing else, so everything it can show was masked when the entries were written (claim C-007); a live response is
 * compared as the entry its send wrote.
 */
@Component({
  selector: "app-exchange-diff",
  imports: [Icon, UiButton],
  templateUrl: "./exchange-diff.html",
  styleUrl: "./exchange-diff.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "exchange-diff" },
})
export class ExchangeDiff {
  readonly a = input.required<PastRequest>();
  readonly b = input.required<PastRequest>();
  /** Back to the list, or the entry the diff was started from. */
  readonly closed = output<void>();

  protected readonly words = compare;
  protected readonly route = ROUTE_NAMES;
  protected readonly formatDuration = formatDuration;
  protected readonly diff = computed(() => diffExchanges(this.a(), this.b()));
  protected readonly nameA = computed(() => name(this.a()));
  protected readonly nameB = computed(() => name(this.b()));
  protected readonly heading = computed(() => compare.comparing(this.nameA(), this.nameB()));

  protected values(values: string[]): string {
    return values.length ? values.join(", ") : "none";
  }

  protected kindWord(change: { kind: "added" | "removed" | "changed" }): string {
    return change.kind === "added" ? "Added" : change.kind === "removed" ? "Removed" : "Changed";
  }

  constructor() {
    // The choice that held focus is gone, or the list is hidden: focus goes to Back, so that Escape closes the rail.
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    afterNextRender(() => host.querySelector<HTMLElement>("button")?.focus());
  }
}
