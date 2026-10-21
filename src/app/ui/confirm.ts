import { ApplicationRef, ChangeDetectionStrategy, Component, EnvironmentInjector, Injectable, createComponent, inject, viewChild } from "@angular/core";
import { MatButton } from "@angular/material/button";
import { Icon } from "../shared/icon/icon";
import { UiModal } from "./modal";

export interface ConfirmOptions {
  /** Heading of a centred confirmation. Omit it together with setting `anchor` for a small popup. */
  title?: string;
  message: string;
  /** Label of the button that goes ahead. Default "Proceed". */
  acceptLabel?: string;
  /** Label of the button that backs out. Default "Cancel". */
  rejectLabel?: string;
  /** Show the confirmation as a small popup under this element instead of a centred dialog. */
  anchor?: HTMLElement;
}

let nextId = 0;

/** The space between the popup and its button, and between the popup and the window's edge. */
const GAP = 10;
const MARGIN = 8;

/**
 * The confirmation itself, a modal `<dialog>` (WAI-ARIA alert dialog
 * pattern). Focus starts on the button that backs out.
 */
@Component({
  selector: "ui-confirm",
  imports: [Icon, MatButton, UiModal],
  template: `
    <dialog
      uiModal
      dismissable
      role="alertdialog"
      [class]="options.anchor ? 'ui-confirm-popup' : 'ui-confirm'"
      [attr.aria-labelledby]="id + (options.anchor ? '-message' : '-title')"
      [attr.aria-describedby]="options.anchor ? null : id + '-message'"
      (closeRequest)="answer(false)"
    >
      @if (options.anchor) {
        <div class="rounded-xl p-4 type-callout bg-canvas-overlay border border-separator">
          <span class="text-label-secondary-on-fill" [id]="id + '-message'">{{ options.message }}</span>
          <div class="flex items-center gap-2 mt-3">
            <button matButton class="btn-danger btn-sm" type="button" (click)="answer(true)">{{ options.acceptLabel ?? "Proceed" }}</button>
            <button matButton class="btn-secondary btn-sm" type="button" cdkFocusInitial (click)="answer(false)">
              {{ options.rejectLabel ?? "Cancel" }}
            </button>
          </div>
        </div>
      } @else {
        <div class="flex flex-col items-center p-8 bg-canvas-overlay">
          <div class="flex items-center justify-center w-12 h-12 rounded-full bg-status-error/10 mb-4"><app-icon name="warning" class="icon-lg text-status-error" /></div>
          <span class="type-title-2 text-label-primary mb-2" [id]="id + '-title'">{{ options.title }}</span>
          <p class="type-body text-label-secondary-on-fill text-center max-w-xs" [id]="id + '-message'">{{ options.message }}</p>
          <div class="flex items-center gap-3 mt-6">
            <button matButton="filled" type="button" class="btn-danger w-28" (click)="answer(true)">{{ options.acceptLabel ?? "Proceed" }}</button>
            <button matButton type="button" class="btn-secondary w-28" cdkFocusInitial (click)="answer(false)">
              {{ options.rejectLabel ?? "Cancel" }}
            </button>
          </div>
        </div>
      }
    </dialog>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class ConfirmDialog {
  readonly id = `ui-confirm-${nextId++}`;
  options: ConfirmOptions = { message: "" };
  answer: (accepted: boolean) => void = () => undefined;
  readonly modal = viewChild.required(UiModal);
}

/**
 * Asks the user to confirm something. Resolves true only when they choose
 * the accept button; Escape, the other button and a click outside all
 * resolve false.
 */
@Injectable({ providedIn: "root" })
export class Confirm {
  private readonly app = inject(ApplicationRef);
  private readonly injector = inject(EnvironmentInjector);

  confirm(options: ConfirmOptions): Promise<boolean> {
    const ref = createComponent(ConfirmDialog, { environmentInjector: this.injector });
    const dialog = ref.instance;
    dialog.options = options;
    document.body.append(ref.location.nativeElement as HTMLElement);
    this.app.attachView(ref.hostView);
    ref.changeDetectorRef.detectChanges();
    const modal = dialog.modal();
    modal.show();
    if (options.anchor) place(modal.element, options.anchor);
    return new Promise((resolve) => {
      dialog.answer = (accepted) => {
        dialog.answer = () => undefined;
        modal.close();
        ref.destroy();
        resolve(accepted);
      };
    });
  }
}

/**
 * Under the button and centred on it, else under it against its end, else
 * above it, whichever is first to fit in the window: the places the CDK's
 * popup took.
 */
function place(popup: HTMLElement, anchor: HTMLElement): void {
  const at = anchor.getBoundingClientRect();
  // Its size as laid out: it is still growing into place (overlay-appear).
  const { offsetWidth: width, offsetHeight: height } = popup;
  const centre = at.left + at.width / 2 - width / 2;
  const places = [
    { left: centre, top: at.bottom + GAP },
    { left: at.right - width, top: at.bottom + GAP },
    { left: centre, top: at.top - GAP - height },
  ];
  const fits = ({ left, top }: { left: number; top: number }) =>
    left >= MARGIN && top >= MARGIN && left + width <= innerWidth - MARGIN && top + height <= innerHeight - MARGIN;
  const { left, top } = places.find(fits) ?? places[0];
  popup.style.left = `${left}px`;
  popup.style.top = `${top}px`;
}
