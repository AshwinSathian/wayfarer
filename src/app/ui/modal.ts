import { InteractivityChecker } from "@angular/cdk/a11y";
import { Directive, ElementRef, OnDestroy, booleanAttribute, effect, inject, input, output, untracked } from "@angular/core";

/** The modal dialogs open now, the last one on top. */
const open: HTMLDialogElement[] = [];

/**
 * After a dialog closes, focus that went back to the page (the element it
 * came from is gone, or never had focus: Safari does not focus a button on
 * a click), or that is still in the dialog just closed, goes to the dialog
 * still open under it. Otherwise Escape and Tab no longer reach that dialog.
 */
export function keepFocusInDialogs(): void {
  const active = document.activeElement;
  if (active && active !== document.body && !active.closest("dialog:not([open])")) return;
  open.at(-1)?.focus();
}

/**
 * The platform's modal `<dialog>` (D3.3g), shown with `showModal()`: the
 * browser puts it in the top layer over everything, draws its `::backdrop`
 * and makes the rest of the page inert. What the browser does not do alike
 * in the three engines, or not as a modal of this app should, is here:
 *
 * - focus starts on the element marked `cdkFocusInitial` (the CDK's mark;
 *   `autofocus` is refused by the linter), else the first one Tab reaches
 *   (Material's rule). The browser gives it back to what had it when the
 *   dialog closes (all three engines, measured); if that is gone, it goes
 *   to the dialog still open under it;
 * - Tab and Shift+Tab wrap inside the dialog: the browser's go on to its
 *   own toolbar after the last element;
 * - Escape asks the owner to close (`closeRequest`), read from the dialog's
 *   own element, so a key a popup inside it took (a select's list, a menu)
 *   does not reach it, and a Material tooltip over a button in it, which
 *   takes Escape on the page's body, does not keep it open. With focus on
 *   the body (a field blurred, a button WebKit did not focus), the topmost
 *   dialog hears it on the document. The browser's own close on Escape is
 *   cancelled: the owner decides;
 * - a click on the backdrop asks too, when `dismissable` is set.
 *
 *   <dialog uiModal [open]="visible()" (closeRequest)="visible.set(false)" aria-labelledby="…">…</dialog>
 *
 * `show()` and `close()` act at once, for an owner that must move focus in
 * the task that asked (a drawer, #223); the binding then finds it as it is.
 */
@Directive({
  selector: "dialog[uiModal]",
  exportAs: "uiModal",
  host: {
    class: "ui-modal",
    tabindex: "-1",
    "aria-modal": "true",
    "(keydown)": "keydown($event)",
    "(document:keydown.escape)": "escapeOutside($event)",
    "(cancel)": "$event.preventDefault()",
    "(pointerdown)": "pressedOutside = outside($event)",
    "(click)": "click($event)",
  },
})
export class UiModal implements OnDestroy {
  readonly open = input(false, { transform: booleanAttribute });
  readonly dismissable = input(false, { transform: booleanAttribute });
  /** Escape, or a click on the backdrop of a dismissable dialog. */
  readonly closeRequest = output<void>();
  /**
   * The dialog has closed, in the task that closed it. The browser's `close`
   * event comes a task later: an owner that reopened the dialog at once (a
   * second import) heard the first close after it, and shut the second.
   */
  readonly closed = output<void>();

  readonly element: HTMLDialogElement = inject<ElementRef<HTMLDialogElement>>(ElementRef).nativeElement;
  private readonly checker = inject(InteractivityChecker);
  protected pressedOutside = false;

  constructor() {
    effect(() => {
      const visible = this.open();
      untracked(() => (visible ? this.show() : this.close()));
    });
  }

  show(): void {
    if (this.element.open) return;
    this.element.showModal();
    open.push(this.element);
    (this.element.querySelector<HTMLElement>("[cdkFocusInitial]") ?? this.tabbable()[0] ?? this.element).focus();
  }

  close(): void {
    if (this.shut()) this.closed.emit();
  }

  private shut(): boolean {
    if (!this.element.open) return false;
    this.element.close();
    open.splice(open.indexOf(this.element), 1);
    keepFocusInDialogs();
    return true;
  }

  protected keydown(event: KeyboardEvent): void {
    if (event.key === "Escape" && !event.defaultPrevented) {
      event.preventDefault();
      this.closeRequest.emit();
    } else if (event.key === "Tab" && !event.ctrlKey && !event.metaKey) {
      // Alt+Tab too: in Safari that is the key that reaches every button.
      const items = this.tabbable();
      const edge = event.shiftKey ? items[0] : items.at(-1);
      if (!items.length || document.activeElement === edge || document.activeElement === this.element) {
        event.preventDefault();
        (event.shiftKey ? items.at(-1) : items[0])?.focus();
      }
    }
  }

  /** Escape with focus outside every dialog: on the body. */
  protected escapeOutside(event: Event): void {
    if (event.defaultPrevented || open.at(-1) !== this.element || this.element.contains(event.target as Node)) return;
    event.preventDefault();
    this.closeRequest.emit();
  }

  /** The press and the release both on the backdrop: a drag out of a field is not a click outside. */
  protected click(event: MouseEvent): void {
    if (this.dismissable() && this.pressedOutside && this.outside(event)) this.closeRequest.emit();
    this.pressedOutside = false;
  }

  /** The backdrop is the dialog's own pseudo-element: an event there targets the dialog, outside its box. */
  protected outside(event: MouseEvent): boolean {
    if (event.target !== this.element) return false;
    const box = this.element.getBoundingClientRect();
    return event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom;
  }

  private tabbable(): HTMLElement[] {
    return Array.from(this.element.querySelectorAll<HTMLElement>("*")).filter((el) => this.checker.isFocusable(el) && this.checker.isTabbable(el));
  }

  /** Its outputs are gone by now. */
  ngOnDestroy(): void {
    this.shut();
  }
}
