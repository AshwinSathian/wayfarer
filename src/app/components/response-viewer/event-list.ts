import { ChangeDetectionStrategy, Component, input, output } from "@angular/core";
import { MatButton } from "@angular/material/button";
import { UiSpinner } from "../../ui/spinner";
import type { ShownEvent } from "../../state/tab-state";

/**
 * The events of a response that is an event stream (P5.6): id, event, data
 * and when each arrived. While the stream is open the list grows and offers
 * Stop; once it has ended it offers Reconnect, which sends the last id.
 */
@Component({
  selector: "app-event-list",
  imports: [MatButton, UiSpinner],
  templateUrl: "./event-list.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventList {
  readonly events = input.required<ShownEvent[]>();
  /** How many events the stream gave in all: the list may hold only the newest. */
  readonly count = input(0);
  /** The stream is open. */
  readonly live = input(false);
  readonly note = input("");
  readonly stop = output<void>();
  readonly reconnect = output<void>();
}
