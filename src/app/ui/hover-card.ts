import { Overlay, OverlayRef } from "@angular/cdk/overlay";
import { TemplatePortal } from "@angular/cdk/portal";
import { Directive, ElementRef, OnDestroy, TemplateRef, ViewContainerRef, inject, input, signal } from "@angular/core";

let nextId = 0;

/**
 * Shows a card of details under its host on hover and on keyboard focus.
 * Material's tooltip takes text only; this takes a template. Like a tooltip
 * (WAI-ARIA tooltip pattern) it is not interactive: it closes on pointer
 * leave, blur and Escape, stays open while the pointer is over it, and is
 * announced through aria-describedby.
 */
@Directive({
  selector: "[uiHoverCard]",
  host: {
    "(mouseenter)": "show()",
    "(mouseleave)": "hideSoon()",
    "(focusin)": "showForKeyboard($event)",
    "(focusout)": "hide()",
    "[attr.aria-describedby]": "describedBy()",
  },
})
export class HoverCard implements OnDestroy {
  readonly uiHoverCard = input.required<TemplateRef<unknown>>();

  private readonly overlay = inject(Overlay);
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);
  private readonly viewContainer = inject(ViewContainerRef);
  private readonly id = `ui-hover-card-${nextId++}`;
  protected readonly describedBy = signal<string | null>(null);
  private overlayRef: OverlayRef | null = null;
  private hideTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly onKeydown = (event: KeyboardEvent) => {
    if (event.key === "Escape") this.hide();
  };

  show(): void {
    clearTimeout(this.hideTimer);
    if (this.overlayRef) return;

    const ref = this.overlay.create({
      positionStrategy: this.overlay
        .position()
        .flexibleConnectedTo(this.host)
        .withPositions([
          { originX: "start", originY: "bottom", overlayX: "start", overlayY: "top", offsetY: 10 },
          { originX: "start", originY: "top", overlayX: "start", overlayY: "bottom", offsetY: -10 },
        ])
        .withViewportMargin(8),
      scrollStrategy: this.overlay.scrollStrategies.close(),
      panelClass: "ui-popover",
    });
    const pane = ref.overlayElement;
    pane.id = this.id;
    pane.setAttribute("role", "tooltip");
    pane.addEventListener("mouseenter", () => clearTimeout(this.hideTimer));
    pane.addEventListener("mouseleave", () => this.hideSoon());
    ref.attach(new TemplatePortal(this.uiHoverCard(), this.viewContainer)).detectChanges();
    ref.updatePosition();
    ref.detachments().subscribe(() => this.hide());

    // In the capture phase: a Material tooltip that is still fading out on
    // the next button takes Escape on its way up and stops it there.
    document.addEventListener("keydown", this.onKeydown, true);

    this.overlayRef = ref;
    this.describedBy.set(this.id);
  }

  /**
   * Focus opens the card only when the browser would draw a focus ring,
   * that is, for keyboard focus. Focus that a click or a closing dialog
   * puts back on the host does not pop a card up under the pointer.
   */
  showForKeyboard(event: FocusEvent): void {
    if ((event.target as Element).matches(":focus-visible")) this.show();
  }

  /** Leaves time for the pointer to travel from the host onto the card. */
  hideSoon(): void {
    clearTimeout(this.hideTimer);
    this.hideTimer = setTimeout(() => this.hide(), 80);
  }

  hide(): void {
    clearTimeout(this.hideTimer);
    const ref = this.overlayRef;
    if (!ref) return;
    this.overlayRef = null;
    this.describedBy.set(null);
    document.removeEventListener("keydown", this.onKeydown, true);
    ref.dispose();
  }

  ngOnDestroy(): void {
    this.hide();
  }
}
