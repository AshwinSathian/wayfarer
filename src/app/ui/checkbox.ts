import { Directive } from "@angular/core";

/**
 * A checkbox (D3.3l): the platform's `<input type="checkbox">` with none of
 * the browser's look, drawn by `checkbox.css`.
 *
 *   <label class="ui-checkbox-label"><input type="checkbox" uiCheckbox [checked]="on()" (change)="on.set($any($event.target).checked)" />Follow redirects</label>
 *   <input type="checkbox" uiCheckbox [attr.aria-label]="'Send header ' + n" [(ngModel)]="row.enabled" />
 *
 * Its text is its `<label>`, around it or pointing at its id; one with no
 * text is named by `aria-label`. The role, the checked state, Space,
 * `disabled` and the model are the element's own.
 *
 * `tabindex="0"`, as Material's had: without it WebKit's Tab, as Safari's
 * by default, passes over a checkbox (only Alt+Tab reaches it), and the
 * other engines stop on it.
 */
@Directive({
  selector: "input[type=checkbox][uiCheckbox]",
  host: { class: "ui-checkbox", tabindex: "0" },
})
export class UiCheckbox {}
