import { ChangeDetectionStrategy, Component, computed, inject } from "@angular/core";
import { DatePipe } from "@angular/common";
import { UiButton } from "../../ui/button";
import { MatCheckbox } from "@angular/material/checkbox";
import { MatFormField } from "@angular/material/form-field";
import { MatInput } from "@angular/material/input";
import { UiSpinner } from "../../ui/spinner";
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
  imports: [DatePipe, Icon, UiButton, MatCheckbox, MatFormField, MatInput, UiSpinner],
  templateUrl: "./socket-view.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SocketView {
  protected readonly client = inject(SocketClient);
  private readonly tabs = inject(Tabs);
  protected readonly state = computed(() => this.tabs.active().socket);

  /** Enter sends; Shift+Enter is a line break in the message. */
  protected onKeydown(event: KeyboardEvent): void {
    if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
    event.preventDefault();
    this.client.send();
  }
}
