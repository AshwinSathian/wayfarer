import { Dialog as CdkDialog, DialogConfig, DialogRef } from "@angular/cdk/dialog";
import { Overlay } from "@angular/cdk/overlay";
import {
  ChangeDetectionStrategy,
  Component,
  Directive,
  OnDestroy,
  TemplateRef,
  ViewContainerRef,
  booleanAttribute,
  effect,
  inject,
  input,
  output,
  untracked,
  viewChild,
} from "@angular/core";
import { MatIconButton } from "@angular/material/button";
import { MatDialog, MatDialogActions, MatDialogContent, MatDialogRef, MatDialogTitle } from "@angular/material/dialog";
import { Icon } from "../shared/icon/icon";

/** The part of CDK's dialog configuration a panel decides for itself. */
type PanelConfig = Pick<
  DialogConfig,
  "role" | "ariaLabel" | "ariaLabelledBy" | "panelClass" | "backdropClass" | "width" | "maxWidth" | "maxHeight" | "height" | "positionStrategy"
>;

/**
 * What a modal dialog and a drawer share: they open when `visible` becomes
 * true and close when it becomes false; Escape (and, if allowed, a click on
 * the backdrop) asks the owner to close by emitting `visibleChange(false)`.
 * CDK Dialog provides the focus trap, the return of focus to the element
 * that had it, scroll blocking, `aria-modal` and the backdrop.
 */
@Directive()
abstract class ModalPanel implements OnDestroy {
  readonly visible = input(false);
  readonly visibleChange = output<boolean>();
  /** Emitted once each time the panel has closed, whatever closed it. */
  readonly hide = output<void>();

  protected readonly dialog = inject(CdkDialog);
  protected readonly overlay = inject(Overlay);
  private readonly viewContainer = inject(ViewContainerRef);
  protected abstract readonly content: () => TemplateRef<unknown>;
  protected abstract config(): PanelConfig;
  /** Whether a click on the backdrop closes the panel. */
  protected abstract closesOnBackdrop(): boolean;
  private ref: DialogRef | null = null;

  constructor() {
    effect(() => {
      const visible = this.visible();
      untracked(() => (visible ? this.open() : this.dismiss()));
    });
  }

  /**
   * Asks the owner to close: it sets `visible` to false, which closes the
   * panel. Closing here as well would leave the panel shut while `visible`
   * is still true if the owner reopens before the change is rendered.
   */
  protected requestClose(): void {
    this.visibleChange.emit(false);
  }

  private open(): void {
    if (this.ref) return;
    const ref = this.dialog.open(this.content(), {
      viewContainerRef: this.viewContainer,
      hasBackdrop: true,
      // Closing is decided here, so the owner always hears about it.
      disableClose: true,
      ariaModal: true,
      autoFocus: "first-tabbable",
      restoreFocus: true,
      ...this.config(),
    });
    const onKeydown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) {
        event.preventDefault();
        this.requestClose();
      }
    };
    ref.keydownEvents.subscribe(onKeydown);
    // The CDK sends a key only to the topmost overlay that listens. A
    // Material tooltip open over a button in here is such an overlay: it
    // takes Escape for itself and stops it. While one is showing, Escape is
    // read from the panel's own element, which hears it first.
    ref.overlayRef.overlayElement.addEventListener("keydown", (event) => {
      if (document.querySelector(".mat-mdc-tooltip-panel")) onKeydown(event);
    });
    ref.backdropClick.subscribe(() => {
      if (this.closesOnBackdrop()) this.requestClose();
    });
    this.ref = ref;
  }

  private dismiss(): void {
    const ref = this.ref;
    if (!ref) return;
    this.ref = null;
    ref.close();
    this.hide.emit();
  }

  ngOnDestroy(): void {
    this.ref?.close();
    this.ref = null;
  }
}

/**
 * A modal dialog, named by its header. Material's dialog is opened from
 * code; this opens it from a template and keeps it in step with `visible`:
 *
 *   <ui-dialog header="Settings" [visible]="open()" (visibleChange)="open.set($event)" width="540px">
 *     …body…
 *     <div uiDialogFooter>…buttons…</div>
 *   </ui-dialog>
 *
 * Escape and, if allowed, a click on the backdrop ask the owner to close by
 * emitting `visibleChange(false)`. Material provides the focus trap, the
 * return of focus to the element that had it, scroll blocking and aria-modal.
 */
@Component({
  selector: "ui-dialog",
  imports: [Icon, MatIconButton, MatDialogTitle, MatDialogContent, MatDialogActions],
  template: `
    <ng-template #content>
      <div class="dialog-header">
        <span mat-dialog-title>{{ header() }}</span>
        <button matIconButton type="button" class="btn-secondary dialog-close" aria-label="Close" (click)="requestClose()">
          <app-icon name="close" />
        </button>
      </div>
      <mat-dialog-content><ng-content /></mat-dialog-content>
      <mat-dialog-actions class="dialog-footer"><ng-content select="[uiDialogFooter]" /></mat-dialog-actions>
    </ng-template>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Dialog implements OnDestroy {
  readonly header = input("");
  readonly visible = input(false);
  readonly visibleChange = output<boolean>();
  /** Emitted once each time the dialog has closed, whatever closed it. */
  readonly hide = output<void>();
  readonly width = input<string>();
  readonly maxWidth = input<string>();
  /** A click on the backdrop closes the dialog. */
  readonly dismissableMask = input(false, { transform: booleanAttribute });

  private readonly dialog = inject(MatDialog);
  private readonly viewContainer = inject(ViewContainerRef);
  private readonly content = viewChild.required<TemplateRef<unknown>>("content");
  private ref: MatDialogRef<unknown> | null = null;

  constructor() {
    effect(() => {
      const visible = this.visible();
      untracked(() => (visible ? this.open() : this.dismiss()));
    });
  }

  /**
   * Asks the owner to close: it sets `visible` to false, which closes the
   * dialog. Closing here as well would leave it shut while `visible` is
   * still true if the owner reopens before the change is rendered.
   */
  protected requestClose(): void {
    this.visibleChange.emit(false);
  }

  private open(): void {
    if (this.ref) return;
    const ref = this.dialog.open(this.content(), {
      viewContainerRef: this.viewContainer,
      // Closing is decided here, so the owner always hears about it.
      disableClose: true,
      ariaModal: true,
      panelClass: "dialog-panel",
      backdropClass: "dialog-backdrop",
      width: this.width(),
      maxWidth: this.maxWidth() ?? "calc(100vw - 32px)",
      maxHeight: "90vh",
      // Material moves focus in when its opening animation ends, and keeps
      // the panel in place until its closing one does. A field typed into
      // straight away lost focus, and a click after closing hit the panel.
      // The entrance is drawn in CSS (animations.css).
      enterAnimationDuration: "0ms",
      exitAnimationDuration: "0ms",
    });
    const onKeydown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) {
        event.preventDefault();
        this.requestClose();
      }
    };
    ref.keydownEvents().subscribe(onKeydown);
    // The CDK sends a key only to the topmost overlay that listens. A
    // Material tooltip open over a button in here is such an overlay: it
    // takes Escape for itself and stops it. While one is showing, Escape is
    // read from the dialog's own element, which hears it first.
    ref.afterOpened().subscribe(() =>
      document.getElementById(ref.id)?.addEventListener("keydown", (event) => {
        if (document.querySelector(".mat-mdc-tooltip-panel")) onKeydown(event);
      })
    );
    ref.backdropClick().subscribe(() => {
      if (this.dismissableMask()) this.requestClose();
    });
    this.ref = ref;
  }

  private dismiss(): void {
    const ref = this.ref;
    if (!ref) return;
    this.ref = null;
    ref.close();
    this.hide.emit();
  }

  ngOnDestroy(): void {
    this.ref?.close();
    this.ref = null;
  }
}

/**
 * A panel that slides in from one side and behaves like a modal dialog.
 * It has no header of its own, so it needs an `ariaLabel`.
 */
@Component({
  selector: "ui-drawer",
  template: `<ng-template #content><ng-content /></ng-template>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Drawer extends ModalPanel {
  readonly side = input<"left" | "right">("left");
  readonly width = input<string>();
  readonly ariaLabel = input.required<string>();

  protected readonly content = viewChild.required<TemplateRef<unknown>>("content");

  protected config(): PanelConfig {
    const position = this.overlay.position().global().top("0");
    return {
      role: "dialog",
      ariaLabel: this.ariaLabel(),
      panelClass: ["ui-drawer-panel", `ui-drawer-panel--${this.side()}`],
      backdropClass: "ui-drawer-backdrop",
      positionStrategy: this.side() === "left" ? position.left("0") : position.right("0"),
      width: this.width(),
      maxWidth: "100vw",
      height: "100%",
    };
  }

  protected closesOnBackdrop(): boolean {
    return true;
  }
}
