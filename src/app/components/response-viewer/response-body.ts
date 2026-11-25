import { ChangeDetectionStrategy, Component, input } from "@angular/core";
import { FormsModule } from "@angular/forms";
import type { ExchangeView } from "../../state/exchange-view";
import { Icon } from "../../shared/icon/icon";
import { UiButton } from "../../ui/button";
import { UiInput } from "../../ui/input";
import { UiSelect } from "../../ui/select";
import { JsonEditor } from "../json-editor/json-editor";
import type { BodyModel } from "./body-model";
import { HtmlPreview } from "./html-preview";

/**
 * The Body tab's content, drawn onto the `<div>` the tab pane holds (an attribute selector, so that the pane's
 * layout rules, which name its child `div`, still find it). What it shows and does is `BodyModel`'s.
 */
@Component({
  // eslint-disable-next-line @angular-eslint/component-selector
  selector: "div[appResponseBody]",
  imports: [FormsModule, Icon, UiButton, UiInput, UiSelect, JsonEditor, HtmlPreview],
  templateUrl: "./response-body.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResponseBody {
  readonly exchange = input.required<ExchangeView>();
  readonly model = input.required<BodyModel>();
  /** The pane is filled by a JSON or XML body (beside the request). */
  readonly fill = input(false);
}
