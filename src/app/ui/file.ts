import { ChangeDetectionStrategy, Component, input, output, signal } from "@angular/core";
import { Icon } from "../shared/icon/icon";
import { UiButton } from "./button";

/**
 * A file field (D3.5, U-059): the file chosen, by name, or a place to drop
 * one, with a button that opens the system's picker and one that clears.
 *
 *   <ui-file label="File to send as the body" [fileName]="name()" (picked)="use($event)" (cleared)="clear()" />
 *
 * It is the platform's `<input type="file">`, hidden: the system's dialog,
 * `accept` and the file are the browser's, the look and the words ours (the
 * maintainer, 2026-10-20: nothing looks native). The input carries `label`
 * as its name, so a test reaches it with `setInputFiles`. What the browser
 * does not do is ours, each with a test in `file.spec.ts`: a file dropped
 * anywhere on the field is taken, the same file chosen twice is a change,
 * and the field can be emptied.
 */
@Component({
  selector: "ui-file",
  imports: [Icon, UiButton],
  template: `
    <app-icon name="upload_file" class="ui-file-icon icon-sm" />
    @if (fileName(); as name) {
      <span class="ui-file-name">{{ name }}</span>
    } @else {
      <span class="ui-file-empty">Drop a file here, or</span>
    }
    <!-- One button whose words change: one swapped for another took focus with it. -->
    <button #choose uiButton class="btn-sm" type="button" [disabled]="disabled()" (click)="input.click()">
      {{ fileName() ? "Choose another…" : "Choose a file…" }}
    </button>
    @if (fileName() && clearable()) {
      <button
        uiButton="icon"
        class="btn-plain"
        type="button"
        [disabled]="disabled()"
        [attr.aria-label]="'Remove ' + fileName()"
        (click)="clear(choose)"
      >
        <app-icon name="close" />
      </button>
    }
    <input
      #input
      type="file"
      class="hidden"
      [attr.accept]="accept() || null"
      [attr.aria-label]="label()"
      [disabled]="disabled()"
      (change)="onChange(input)"
    />
  `,
  styleUrl: "./file.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: "ui-file",
    "[class.ui-file-over]": "over()",
    "[class.ui-file-disabled]": "disabled()",
    "(dragover)": "onDragOver($event)",
    "(dragleave)": "over.set(false)",
    "(drop)": "onDrop($event)",
  },
})
export class UiFile {
  /** The file chosen, by the name it was picked under; empty for none. */
  readonly fileName = input("");
  /** The hidden input's name: what the file is for ("File to send as the body"). */
  readonly label = input.required<string>();
  /** The types the system's picker offers, as the input's `accept`. */
  readonly accept = input("");
  readonly disabled = input(false);
  /** Whether a chosen file can be removed. */
  readonly clearable = input(true);

  readonly picked = output<File>();
  readonly cleared = output<void>();

  /** A file is being dragged over the field. */
  protected readonly over = signal(false);

  protected onChange(input: HTMLInputElement): void {
    const file = input.files?.[0];
    // Emptied, so that the same file chosen again is a change.
    input.value = "";
    if (file) this.picked.emit(file);
  }

  /** The remove button goes with the file: focus goes to the button that chooses one. */
  protected clear(choose: HTMLButtonElement): void {
    this.cleared.emit();
    choose.focus();
  }

  protected onDragOver(event: DragEvent): void {
    if (this.disabled() || !event.dataTransfer?.types.includes("Files")) return;
    // Without this the browser opens the dropped file in the tab.
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    this.over.set(true);
  }

  protected onDrop(event: DragEvent): void {
    this.over.set(false);
    const file = event.dataTransfer?.files[0];
    if (this.disabled() || !file) return;
    event.preventDefault();
    this.picked.emit(file);
  }
}
