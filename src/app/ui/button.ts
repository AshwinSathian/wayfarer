import { booleanAttribute, Directive, input } from "@angular/core";

/**
 * Styles a native `<button>` (or a `<label>` wrapping a file input). The
 * element stays native: type, disabled, aria-* and click are plain
 * attributes. Content is projected as-is: an `<app-icon>`, text, or both.
 */
@Directive({
  selector: "button[uiButton], label[uiButton]",
  host: {
    class: "ui-btn",
    "[class.ui-btn--secondary]": 'tone() === "secondary"',
    "[class.ui-btn--danger]": 'tone() === "danger"',
    "[class.ui-btn--success]": 'tone() === "success"',
    "[class.ui-btn--outlined]": 'variant() === "outlined"',
    "[class.ui-btn--text]": 'variant() === "text"',
    "[class.ui-btn--sm]": 'size() === "sm"',
    "[class.ui-btn--icon]": "iconOnly()",
  },
})
export class Button {
  readonly tone = input<"primary" | "secondary" | "danger" | "success">("primary");
  readonly variant = input<"solid" | "outlined" | "text">("solid");
  readonly size = input<"md" | "sm">("md");
  /** The button holds only an icon: it becomes a fixed-width square. Name it with aria-label. */
  readonly iconOnly = input(false, { transform: booleanAttribute });
}
