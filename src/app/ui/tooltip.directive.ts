import { Overlay, OverlayRef } from "@angular/cdk/overlay";
import { ComponentPortal } from "@angular/cdk/portal";
import { NgTemplateOutlet } from "@angular/common";
import { ChangeDetectionStrategy, Component, Directive, ElementRef, OnDestroy, TemplateRef, inject, input, signal } from "@angular/core";

let nextId = 0;

/** What the overlay shows: the text, or the caller's template. */
@Component({
  selector: "ui-tooltip-panel",
  imports: [NgTemplateOutlet],
  template: `@if (template(); as tpl) {<ng-container [ngTemplateOutlet]="tpl" />} @else {{{ text() }}}`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class TooltipPanelComponent {
  readonly text = input("");
  readonly template = input<TemplateRef<unknown> | null>(null);
}

/**
 * Describes its host on hover and on keyboard focus (WAI-ARIA tooltip
 * pattern). Text gives a small tooltip; a template gives a card under the
 * host. Either way it is not interactive: it closes on pointer leave, blur
 * and Escape, stays open while the pointer is over it, and is announced
 * through aria-describedby. An empty value shows nothing.
 */
@Directive({
  selector: "[uiTooltip]",
  host: {
    "(mouseenter)": "show()",
    "(mouseleave)": "hideSoon()",
    "(focusin)": "show()",
    "(focusout)": "hide()",
    "(document:keydown.escape)": "hide()",
    "[attr.aria-describedby]": "describedBy()",
  },
})
export class TooltipDirective implements OnDestroy {
  readonly uiTooltip = input<string | TemplateRef<unknown> | null | undefined>("");
  readonly uiTooltipPosition = input<"top" | "bottom">("top");

  private readonly overlay = inject(Overlay);
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);
  private readonly id = `ui-tooltip-${nextId++}`;
  protected readonly describedBy = signal<string | null>(null);
  private overlayRef: OverlayRef | null = null;
  private hideTimer: ReturnType<typeof setTimeout> | undefined;

  show(): void {
    clearTimeout(this.hideTimer);
    const content = this.uiTooltip();
    if (!content || this.overlayRef) return;

    const card = typeof content !== "string";
    const above = { originX: "center", originY: "top", overlayX: "center", overlayY: "bottom", offsetY: -4 } as const;
    const below = { originX: "center", originY: "bottom", overlayX: "center", overlayY: "top", offsetY: 4 } as const;
    const positions = card
      ? [
          { originX: "start", originY: "bottom", overlayX: "start", overlayY: "top", offsetY: 10 } as const,
          { originX: "start", originY: "top", overlayX: "start", overlayY: "bottom", offsetY: -10 } as const,
        ]
      : this.uiTooltipPosition() === "bottom"
        ? [below, above]
        : [above, below];

    const ref = this.overlay.create({
      positionStrategy: this.overlay.position().flexibleConnectedTo(this.host).withPositions(positions).withViewportMargin(8),
      scrollStrategy: this.overlay.scrollStrategies.close(),
      panelClass: card ? "ui-popover" : "ui-tooltip",
    });
    const pane = ref.overlayElement;
    pane.id = this.id;
    pane.setAttribute("role", "tooltip");
    pane.addEventListener("mouseenter", () => clearTimeout(this.hideTimer));
    pane.addEventListener("mouseleave", () => this.hideSoon());
    const panel = ref.attach(new ComponentPortal(TooltipPanelComponent));
    panel.setInput(card ? "template" : "text", content);
    panel.changeDetectorRef.detectChanges();
    ref.updatePosition();
    ref.detachments().subscribe(() => this.hide());

    this.overlayRef = ref;
    this.describedBy.set(this.id);
  }

  /** Leaves time for the pointer to travel from the host onto the tooltip. */
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
    ref.dispose();
  }

  ngOnDestroy(): void {
    this.hide();
  }
}
