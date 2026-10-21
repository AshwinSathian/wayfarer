import { FocusMonitor } from "@angular/cdk/a11y";
import {
  DestroyRef,
  Directive,
  ElementRef,
  EmbeddedViewRef,
  TemplateRef,
  ViewContainerRef,
  afterRenderEffect,
  inject,
  input,
} from "@angular/core";

let nextId = 0;

/** Between the host and the tooltip, and between the tooltip and the window's edge. */
const GAP = 8;
/** Time for the pointer to travel from the host onto the tooltip. */
const HIDE_DELAY_MS = 80;

export type TooltipPosition = "above" | "below";

/**
 * Where a tooltip of `size` goes against `host`: on its side, or the other
 * side when only that one has room; centred on the host (a card starts at
 * its start edge), and inside the window by `GAP`.
 */
export function placeTooltip(
  host: DOMRect,
  size: { width: number; height: number },
  window: { width: number; height: number },
  position: TooltipPosition,
  align: "center" | "start",
): { left: number; top: number } {
  const above = host.top - GAP - size.height;
  const below = host.bottom + GAP;
  const roomAbove = above >= GAP;
  const roomBelow = below + size.height <= window.height - GAP;
  const top =
    position === "above" ? (roomAbove || !roomBelow ? above : below) : roomBelow || !roomAbove ? below : above;
  const left = align === "start" ? host.left : host.left + (host.width - size.width) / 2;
  const clamp = (value: number, max: number) => Math.max(GAP, Math.min(value, max - GAP));
  return { left: clamp(left, window.width - size.width), top: clamp(top, window.height - size.height) };
}

/**
 * A tooltip (WAI-ARIA's pattern, D3.3h): text, or a card of a template, in
 * the platform's `popover`, in the top layer and placed against its host.
 * It shows on hover, not for a touch, and on focus from the keyboard, not
 * a click's or code's. It stays while the pointer is on it, moves with its
 * host on a scroll, and goes on leave, blur, a press on the host and
 * Escape. Escape is heard in the capture phase and not
 * stopped: a menu trigger stops it on its button, and a dialog the tooltip
 * is in closes too.
 *
 * The popover is the body's, moved into the dialog its host is in when it
 * shows: the page outside a modal dialog is inert, and a tooltip there would
 * not hear the pointer that keeps it open. Not beside its host, where it
 * would change what a rule of siblings (`a + b`, Tailwind's `space-y-*`)
 * finds. Text describes its host
 * (`aria-describedby`) from the start, unless it repeats the host's
 * `aria-label`; a card describes it while shown. Empty text is no tooltip.
 *
 *   <button aria-label="New tab" uiTooltip="New tab (Alt+T)">…</button>
 *   <span tabindex="0" [uiTooltip]="details" uiTooltipPosition="below">…</span>
 */
@Directive({
  selector: "[uiTooltip]",
  host: {
    "(pointerenter)": "pointerEnter($event)",
    "(pointerleave)": "hideSoon()",
    "(pointerdown)": "hide()",
  },
})
export class UiTooltip {
  readonly uiTooltip = input.required<string | TemplateRef<unknown>>();
  readonly uiTooltipPosition = input<TooltipPosition>("below");

  private readonly host: HTMLElement = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly viewContainer = inject(ViewContainerRef);
  /** The popover. */
  readonly popover: HTMLElement = document.createElement("div");
  private card: EmbeddedViewRef<unknown> | null = null;
  private hideTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly onKeydown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") this.hide();
  };
  private readonly onScroll = (): void => this.place();

  constructor() {
    const tip = this.popover;
    tip.id = `ui-tooltip-${nextId++}`;
    tip.className = "ui-tooltip";
    tip.setAttribute("role", "tooltip");
    tip.popover = "manual";
    tip.addEventListener("pointerenter", () => clearTimeout(this.hideTimer));
    tip.addEventListener("pointerleave", () => this.hideSoon());

    // After the render, so the host's own aria-label binding is there to compare with.
    afterRenderEffect(() => {
      const content = this.uiTooltip();
      if (!tip.isConnected) document.body.append(tip);
      if (!content) this.hide();
      tip.classList.toggle("ui-tooltip-card", content instanceof TemplateRef);
      if (content instanceof TemplateRef) return;
      tip.textContent = content;
      this.describe(content !== "" && content !== this.host.getAttribute("aria-label"));
    });

    // Focus from the keyboard, as the CDK tells it: not a click's, and not focus set by code (a
    // dialog's first element: WebKit draws a ring there after a click too). Blur hides it.
    const focusMonitor = inject(FocusMonitor);
    const focus = focusMonitor
      .monitor(this.host)
      .subscribe((origin) => (origin === "keyboard" ? this.show() : this.hide()));

    inject(DestroyRef).onDestroy(() => {
      focus.unsubscribe();
      focusMonitor.stopMonitoring(this.host);
      this.hide();
      tip.remove();
    });
  }

  protected pointerEnter(event: PointerEvent): void {
    if (event.pointerType !== "touch") this.show();
  }

  show(): void {
    clearTimeout(this.hideTimer);
    const content = this.uiTooltip();
    if (!content || this.popover.matches(":popover-open")) return;
    if (content instanceof TemplateRef) {
      this.card = this.viewContainer.createEmbeddedView(content);
      this.card.detectChanges();
      this.popover.replaceChildren(...this.card.rootNodes);
      this.describe(true);
    }
    // Into the dialog the host is in now: a dialog's projected content is made with the page,
    // before the dialog holds it.
    (this.host.closest("dialog") ?? document.body).append(this.popover);
    this.popover.showPopover();
    this.place();
    document.addEventListener("keydown", this.onKeydown, true);
    document.addEventListener("scroll", this.onScroll, true);
  }

  /** Against the host, also after a scroll: Tab scrolls a host into view after it has shown its tooltip. */
  private place(): void {
    // The layout box: the entrance animation scales the tooltip, and its bounding box with it.
    const { left, top } = placeTooltip(
      this.host.getBoundingClientRect(),
      { width: this.popover.offsetWidth, height: this.popover.offsetHeight },
      { width: document.documentElement.clientWidth, height: document.documentElement.clientHeight },
      this.uiTooltipPosition(),
      this.card ? "start" : "center",
    );
    this.popover.style.left = `${left}px`;
    this.popover.style.top = `${top}px`;
  }

  /** Leaves time for the pointer to travel from the host onto the tooltip. */
  hideSoon(): void {
    clearTimeout(this.hideTimer);
    this.hideTimer = setTimeout(() => this.hide(), HIDE_DELAY_MS);
  }

  hide(): void {
    clearTimeout(this.hideTimer);
    document.removeEventListener("keydown", this.onKeydown, true);
    document.removeEventListener("scroll", this.onScroll, true);
    if (this.popover.matches(":popover-open")) this.popover.hidePopover();
    if (this.card) {
      this.card.destroy();
      this.card = null;
      this.popover.replaceChildren();
      this.describe(false);
    }
  }

  private describe(on: boolean): void {
    if (on) this.host.setAttribute("aria-describedby", this.popover.id);
    else this.host.removeAttribute("aria-describedby");
  }
}
