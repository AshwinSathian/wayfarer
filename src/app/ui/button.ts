import { Directive, input } from "@angular/core";

export type ButtonVariant = "filled" | "outlined" | "text" | "icon";

/**
 * A button (D3.3j): the platform's `<button>` (or `<a>`) with none of the
 * browser's look, drawn by `button.css`.
 *
 *   <button uiButton="filled" type="button">Save</button>
 *   <button uiButton="outlined" class="btn-secondary btn-sm" type="button">Cancel</button>
 *   <button uiButton type="button">Clear</button>                         text
 *   <button uiButton="icon" class="btn-plain" type="button" aria-label="Close"><app-icon name="close" /></button>
 *
 * The tone is `btn-secondary`, `btn-danger` or `btn-success`, the size
 * `btn-sm`, and `btn-square` an icon alone in a filled or outlined button.
 * Role, focus, the keys and `disabled` are the element's own.
 */
@Directive({
  selector: "button[uiButton], a[uiButton]",
  host: {
    class: "ui-button",
    "[class.ui-button-filled]": "variant() === 'filled'",
    "[class.ui-button-outlined]": "variant() === 'outlined'",
    "[class.ui-button-text]": "variant() === 'text'",
    "[class.ui-button-icon]": "variant() === 'icon'",
  },
})
export class UiButton {
  /** `uiButton` with no value is a text button. */
  readonly variant = input<ButtonVariant, ButtonVariant | "">("text", {
    alias: "uiButton",
    transform: (value) => value || "text",
  });
}
