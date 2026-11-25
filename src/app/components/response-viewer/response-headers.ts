import { ChangeDetectionStrategy, Component, input } from "@angular/core";
import type { ExchangeView } from "../../state/exchange-view";

/** The Headers tab's content, drawn onto the `<div>` the tab pane holds (see `ResponseBody` for the selector). */
@Component({
  // eslint-disable-next-line @angular-eslint/component-selector
  selector: "div[appResponseHeaders]",
  templateUrl: "./response-headers.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResponseHeaders {
  readonly exchange = input.required<ExchangeView>();
}
