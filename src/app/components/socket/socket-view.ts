import { ChangeDetectionStrategy, Component, computed, inject, signal } from "@angular/core";
import { parseJson, stringifyJson } from "@wayfarer/core";
import { DatePipe } from "@angular/common";
import { UiButton } from "../../ui/button";
import { UiCheckbox } from "../../ui/checkbox";
import { UiInput } from "../../ui/input";
import { UiSegmented, type UiSegment } from "../../ui/segmented";
import { UiTooltip } from "../../ui/tooltip";
import { SocketClient } from "../../services/socket-client";
import { Icon } from "../../shared/icon/icon";
import { Tabs } from "../../state/tabs";

/**
 * A tab's WebSocket (P5.7): the subprotocols to ask for, the message to send,
 * and a log of what went in and out. It stands where a request's panels and
 * its response stand, for an address that starts with `ws:` or `wss:`.
 */
@Component({
  selector: "app-socket-view",
  imports: [DatePipe, Icon, UiButton, UiCheckbox, UiInput, UiSegmented, UiTooltip],
  templateUrl: "./socket-view.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SocketView {
  protected readonly client = inject(SocketClient);
  private readonly tabs = inject(Tabs);
  protected readonly state = computed(() => this.tabs.active().socket);

  /** Which messages the log shows, and the text they hold (U-048). */
  protected readonly showing = signal<"all" | "in" | "out">("all");
  protected readonly showOptions: readonly UiSegment<"all" | "in" | "out">[] = [
    { value: "all", label: "All" },
    { value: "in", label: "Received" },
    { value: "out", label: "Sent" },
  ];
  protected readonly search = signal("");
  /** The log's rows by their place, with what each shows. A message that is JSON can be read formatted. */
  protected readonly rows = computed(() => {
    const showing = this.showing();
    const search = this.search().trim().toLowerCase();
    return this.state()
      .log()
      .map((entry, index) => ({ entry, index, json: this.formatted(entry.text) }))
      .filter(({ entry }) => showing === "all" || entry.direction === showing)
      .filter(({ entry }) => !search || entry.text.toLowerCase().includes(search));
  });
  /** The rows shown formatted, by their place in the log. */
  protected readonly open = signal<ReadonlySet<number>>(new Set());

  protected toggle(index: number): void {
    this.open.update((open) => {
      const next = new Set(open);
      if (!next.delete(index)) next.add(index);
      return next;
    });
  }

  /** The message as indented JSON, when it is a JSON object or list; otherwise null. */
  private formatted(text: string): string | null {
    const trimmed = text.trim();
    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null;
    const parsed = parseJson(trimmed);
    return parsed.ok ? (stringifyJson(parsed.value, 2) ?? null) : null;
  }

  /** Enter sends; Shift+Enter is a line break in the message. */
  protected onKeydown(event: KeyboardEvent): void {
    if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
    event.preventDefault();
    this.client.send();
  }
}
