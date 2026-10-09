import { ChangeDetectionStrategy, Component, input, output } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { MatButton, MatIconButton } from "@angular/material/button";
import { MatCheckbox } from "@angular/material/checkbox";
import { MatOption } from "@angular/material/core";
import { MatFormField } from "@angular/material/form-field";
import { MatInput } from "@angular/material/input";
import { MatSelect } from "@angular/material/select";
import type { MultipartPart } from "@wayfarer/core";
import { Icon } from "../../shared/icon/icon";

/** The parts of a multipart body: each a name with a text value or a file. */
@Component({
  selector: "app-multipart-editor",
  imports: [FormsModule, Icon, MatButton, MatIconButton, MatCheckbox, MatFormField, MatInput, MatSelect, MatOption],
  templateUrl: "./multipart-editor.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MultipartEditor {
  readonly parts = input<MultipartPart[]>([]);

  /** A field was edited in place. */
  readonly partChange = output<void>();
  readonly add = output<void>();
  readonly remove = output<number>();
  readonly kindChange = output<{ index: number; kind: MultipartPart["kind"] }>();
  readonly filePicked = output<{ index: number; file: File }>();

  protected onFile(index: number, input: HTMLInputElement): void {
    const file = input.files?.[0];
    // Cleared so that picking the same file again is a change.
    input.value = "";
    if (file) {
      this.filePicked.emit({ index, file });
    }
  }
}
