import {
  ApplicationRef,
  ChangeDetectionStrategy,
  Component,
  booleanAttribute,
  inject,
  input,
  output,
} from "@angular/core";
import { UiButton } from "./button";
import { Icon } from "../shared/icon/icon";
import { UiModal } from "./modal";

let nextId = 0;

/**
 * A modal dialog, named by its header: the platform's `<dialog>` through
 * `UiModal` (D3.3g), kept in step with `visible`:
 *
 *   <ui-dialog header="Settings" [visible]="open()" (visibleChange)="open.set($event)" width="540px">
 *     …body…
 *     <div uiDialogFooter>…buttons…</div>
 *   </ui-dialog>
 *
 * Escape and, if allowed, a click on the backdrop ask the owner to close by
 * emitting `visibleChange(false)`. The body is in the page only while the
 * dialog is open, but Angular makes projected content with the page: keep
 * anything heavy (an editor) inside `@if` of the open state.
 */
@Component({
  selector: "ui-dialog",
  imports: [Icon, UiButton, UiModal],
  template: `
    <dialog
      uiModal
      class="ui-dialog"
      [open]="visible()"
      [dismissable]="dismissableMask()"
      [attr.aria-labelledby]="titleId"
      [style.width]="width()"
      [style.max-width]="maxWidth() ?? 'calc(100vw - 32px)'"
      (closeRequest)="requestClose()"
      (closed)="hide.emit()"
    >
      @if (visible()) {
        <div class="dialog-header">
          <span class="dialog-title type-title-3" [id]="titleId">{{ header() }}</span>
          <button
            uiButton="icon"
            type="button"
            class="btn-secondary dialog-close"
            aria-label="Close"
            (click)="requestClose()"
          >
            <app-icon name="close" />
          </button>
        </div>
        <div class="dialog-content"><ng-content /></div>
        <div class="dialog-footer"><ng-content select="[uiDialogFooter]" /></div>
      }
    </dialog>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Dialog {
  readonly header = input("");
  readonly visible = input(false);
  readonly visibleChange = output<boolean>();
  /** Emitted once each time the dialog has closed, whatever closed it. */
  readonly hide = output<void>();
  readonly width = input<string>();
  readonly maxWidth = input<string>();
  /** A click on the backdrop closes the dialog. */
  readonly dismissableMask = input(false, { transform: booleanAttribute });

  protected readonly titleId = `ui-dialog-title-${nextId++}`;
  private readonly app = inject(ApplicationRef);

  /**
   * Asks the owner to close: it sets `visible` to false, which closes the
   * dialog. Closing here as well would leave it shut while `visible` is
   * still true if the owner reopens before the change is rendered. It is
   * drawn at once (from a key or a click, never inside a render): until the
   * dialog has closed, the page under it is inert, and a key typed straight
   * after Escape went nowhere.
   */
  protected requestClose(): void {
    this.visibleChange.emit(false);
    this.app.tick();
  }
}
