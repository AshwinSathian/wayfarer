import { DIALOG_DATA, Dialog as CdkDialog, DialogRef } from "@angular/cdk/dialog";
import { Overlay } from "@angular/cdk/overlay";
import { ChangeDetectionStrategy, Component, Injectable, InjectionToken, inject } from "@angular/core";
import { firstValueFrom } from "rxjs";
import { Icon } from "../shared/icon/icon";
import { Button } from "./button";

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

/** The id prefix of one confirmation's title and message, shared by the dialog and its content. */
const CONFIRM_ID = new InjectionToken<string>("confirm id");

/** The confirmation itself. Focus starts on the button that backs out. */
@Component({
  selector: "ui-confirm",
  imports: [Icon, Button],
  template: `
    @if (options.anchor) {
      <div class="rounded-xl p-4 type-callout bg-canvas-overlay border border-separator">
        <span class="text-label-secondary-on-fill" [id]="id + '-message'">{{ options.message }}</span>
        <div class="flex items-center gap-2 mt-3">
          <button uiButton type="button" tone="danger" variant="text" size="sm" (click)="ref.close(true)">{{ options.acceptLabel ?? "Proceed" }}</button>
          <button uiButton type="button" tone="secondary" variant="text" size="sm" cdkFocusInitial (click)="ref.close(false)">
            {{ options.rejectLabel ?? "Cancel" }}
          </button>
        </div>
      </div>
    } @else {
      <div class="flex flex-col items-center p-8 bg-canvas-overlay rounded-2xl">
        <div class="flex items-center justify-center w-12 h-12 rounded-full bg-status-error/10 mb-4"><app-icon name="warning" class="icon-lg text-status-error" /></div>
        <span class="type-title-2 text-label-primary mb-2" [id]="id + '-title'">{{ options.title }}</span>
        <p class="type-body text-label-secondary-on-fill text-center max-w-xs" [id]="id + '-message'">{{ options.message }}</p>
        <div class="flex items-center gap-3 mt-6">
          <button uiButton type="button" tone="danger" class="w-28" (click)="ref.close(true)">{{ options.acceptLabel ?? "Proceed" }}</button>
          <button uiButton type="button" tone="secondary" variant="text" class="w-28" cdkFocusInitial (click)="ref.close(false)">
            {{ options.rejectLabel ?? "Cancel" }}
          </button>
        </div>
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class ConfirmDialog {
  protected readonly options = inject<ConfirmOptions>(DIALOG_DATA);
  protected readonly ref = inject<DialogRef<boolean>>(DialogRef);
  protected readonly id = inject(CONFIRM_ID);
}

/**
 * Asks the user to confirm something (WAI-ARIA alert dialog pattern).
 * Resolves true only when they choose the accept button; Escape, the other
 * button and a click outside all resolve false.
 */
@Injectable({ providedIn: "root" })
export class Confirm {
  private readonly dialog = inject(CdkDialog);
  private readonly overlay = inject(Overlay);

  async confirm(options: ConfirmOptions): Promise<boolean> {
    const id = `ui-confirm-${nextId++}`;
    const popup = !!options.anchor;
    const ref = this.dialog.open<boolean>(ConfirmDialog, {
      data: options,
      providers: [{ provide: CONFIRM_ID, useValue: id }],
      role: "alertdialog",
      ariaModal: true,
      ariaLabelledBy: popup ? `${id}-message` : `${id}-title`,
      ariaDescribedBy: popup ? null : `${id}-message`,
      autoFocus: "[cdkFocusInitial]",
      restoreFocus: true,
      hasBackdrop: true,
      backdropClass: popup ? "ui-confirm-popup-backdrop" : "ui-dialog-backdrop",
      panelClass: popup ? "ui-confirm-popup" : "ui-confirm-panel",
      positionStrategy: options.anchor
        ? this.overlay
            .position()
            .flexibleConnectedTo(options.anchor)
            .withPositions([
              { originX: "center", originY: "bottom", overlayX: "center", overlayY: "top", offsetY: 10 },
              { originX: "end", originY: "bottom", overlayX: "end", overlayY: "top", offsetY: 10 },
              { originX: "center", originY: "top", overlayX: "center", overlayY: "bottom", offsetY: -10 },
            ])
            .withViewportMargin(8)
        : undefined,
    });
    return (await firstValueFrom(ref.closed)) === true;
  }
}
