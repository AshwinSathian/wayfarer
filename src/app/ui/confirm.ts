import { DIALOG_DATA, Dialog as CdkDialog, DialogRef } from "@angular/cdk/dialog";
import { Overlay } from "@angular/cdk/overlay";
import { ChangeDetectionStrategy, Component, Injectable, inject } from "@angular/core";
import { MatDialog, MatDialogRef } from "@angular/material/dialog";
import { firstValueFrom } from "rxjs";
import { Icon } from "../shared/icon/icon";
import { MatButton } from "@angular/material/button";

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

/** What a confirmation is opened with: the caller's options, and the id prefix of its title and message. */
interface ConfirmData {
  options: ConfirmOptions;
  id: string;
}

/** The confirmation itself. Focus starts on the button that backs out. */
@Component({
  selector: "ui-confirm",
  imports: [Icon, MatButton],
  template: `
    @if (options.anchor) {
      <div class="rounded-xl p-4 type-callout bg-canvas-overlay border border-separator">
        <span class="text-label-secondary-on-fill" [id]="id + '-message'">{{ options.message }}</span>
        <div class="flex items-center gap-2 mt-3">
          <button matButton class="btn-danger btn-sm" type="button" (click)="close(true)">{{ options.acceptLabel ?? "Proceed" }}</button>
          <button matButton class="btn-secondary btn-sm" type="button" cdkFocusInitial (click)="close(false)">
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
          <button matButton="filled" type="button" class="btn-danger w-28" (click)="close(true)">{{ options.acceptLabel ?? "Proceed" }}</button>
          <button matButton type="button" class="btn-secondary w-28" cdkFocusInitial (click)="close(false)">
            {{ options.rejectLabel ?? "Cancel" }}
          </button>
        </div>
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class ConfirmDialog {
  private readonly data = inject<ConfirmData>(DIALOG_DATA);
  protected readonly options = this.data.options;
  protected readonly id = this.data.id;
  /** The centred confirmation is Material's dialog; the popup under a button is the CDK's. */
  private readonly ref = inject<MatDialogRef<ConfirmDialog, boolean>>(MatDialogRef, { optional: true }) ?? inject<DialogRef<boolean>>(DialogRef);

  protected close(accepted: boolean): void {
    this.ref.close(accepted);
  }
}

/**
 * Asks the user to confirm something (WAI-ARIA alert dialog pattern).
 * Resolves true only when they choose the accept button; Escape, the other
 * button and a click outside all resolve false.
 */
@Injectable({ providedIn: "root" })
export class Confirm {
  private readonly matDialog = inject(MatDialog);
  private readonly dialog = inject(CdkDialog);
  private readonly overlay = inject(Overlay);

  async confirm(options: ConfirmOptions): Promise<boolean> {
    const id = `ui-confirm-${nextId++}`;
    const data: ConfirmData = { options, id };
    const anchor = options.anchor;
    if (!anchor) {
      const ref = this.matDialog.open<ConfirmDialog, ConfirmData, boolean>(ConfirmDialog, {
        data,
        role: "alertdialog",
        ariaModal: true,
        ariaLabelledBy: `${id}-title`,
        ariaDescribedBy: `${id}-message`,
        autoFocus: "[cdkFocusInitial]",
        backdropClass: "dialog-backdrop",
        panelClass: "confirm-panel",
        maxWidth: "calc(100vw - 32px)",
        // As for ui-dialog: focus moves in at once, and the page is free the moment it closes.
        delayFocusTrap: false,
        enterAnimationDuration: "0ms",
        exitAnimationDuration: "0ms",
      });
      return (await firstValueFrom(ref.afterClosed())) === true;
    }
    // Material's dialog is placed in the window, not against an element, so
    // the small popup under a button is the CDK's dialog, which Material's
    // is built on.
    const ref = this.dialog.open<boolean>(ConfirmDialog, {
      data,
      role: "alertdialog",
      ariaModal: true,
      ariaLabelledBy: `${id}-message`,
      ariaDescribedBy: null,
      autoFocus: "[cdkFocusInitial]",
      restoreFocus: true,
      hasBackdrop: true,
      backdropClass: "ui-confirm-popup-backdrop",
      panelClass: "ui-confirm-popup",
      positionStrategy: this.overlay
        .position()
        .flexibleConnectedTo(anchor)
        .withPositions([
          { originX: "center", originY: "bottom", overlayX: "center", overlayY: "top", offsetY: 10 },
          { originX: "end", originY: "bottom", overlayX: "end", overlayY: "top", offsetY: 10 },
          { originX: "center", originY: "top", overlayX: "center", overlayY: "bottom", offsetY: -10 },
        ])
        .withViewportMargin(8),
    });
    return (await firstValueFrom(ref.closed)) === true;
  }
}
