import { Directive } from "@angular/core";

/**
 * A text field (D3.3k): the platform's `<input>` or `<textarea>` with none
 * of the browser's look, drawn by `input.css`. The element is the box: width
 * and flex utilities go on it.
 *
 *   <input uiInput class="font-mono w-full" placeholder="value" />
 *   <textarea uiInput class="font-mono w-full" rows="3"></textarea>
 *
 * `field-inline` is the short field of a tree row's rename; `address-field`
 * and `method-field` are the halves of the address bar, which draws their box.
 * Focus, the keys, `disabled` and the value are the element's own.
 */
@Directive({
  selector: "input[uiInput], textarea[uiInput]",
  host: { class: "ui-input" },
})
export class UiInput {}
