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
import { Icon } from "../shared/icon/icon";
import { Button } from "./button";

let nextId = 0;

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
    // On the panel's own element, not `ref.keydownEvents`: the CDK sends a
    // key only to the topmost overlay that listens, and a Material tooltip
    // open over a button in here would take Escape for itself.
    ref.overlayRef.overlayElement.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !event.defaultPrevented) {
        event.preventDefault();
        this.requestClose();
      }
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
 * A modal dialog (WAI-ARIA dialog pattern), named by its header:
 *
 *   <ui-dialog header="Settings" [visible]="open()" (visibleChange)="open.set($event)" width="540px">
 *     …body…
 *     <div uiDialogFooter>…buttons…</div>
 *   </ui-dialog>
 */
@Component({
  selector: "ui-dialog",
  imports: [Icon, Button],
  template: `
    <ng-template #content>
      <div class="ui-dialog-header">
        <span class="ui-dialog-title" [id]="titleId">{{ header() }}</span>
        <button uiButton type="button" tone="secondary" variant="text" iconOnly class="ui-dialog-close" aria-label="Close" (click)="requestClose()">
          <app-icon name="close" />
        </button>
      </div>
      <div class="ui-dialog-content"><ng-content /></div>
      <div class="ui-dialog-footer"><ng-content select="[uiDialogFooter]" /></div>
    </ng-template>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Dialog extends ModalPanel {
  readonly header = input("");
  readonly width = input<string>();
  readonly maxWidth = input<string>();
  /** A click on the backdrop closes the dialog. */
  readonly dismissableMask = input(false, { transform: booleanAttribute });

  protected readonly titleId = `ui-dialog-title-${nextId++}`;
  protected readonly content = viewChild.required<TemplateRef<unknown>>("content");

  protected config(): PanelConfig {
    return {
      role: "dialog",
      ariaLabelledBy: this.titleId,
      panelClass: "ui-dialog-panel",
      backdropClass: "ui-dialog-backdrop",
      width: this.width(),
      maxWidth: this.maxWidth() ?? "calc(100vw - 32px)",
      maxHeight: "90%",
    };
  }

  protected closesOnBackdrop(): boolean {
    return this.dismissableMask();
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
