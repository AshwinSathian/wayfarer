import { ChangeDetectionStrategy, Component, input, output } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { MatButton, MatIconButton } from "@angular/material/button";
import { MatCheckbox } from "@angular/material/checkbox";
import { MatFormField } from "@angular/material/form-field";
import { MatInput } from "@angular/material/input";
import type { Row } from "@wayfarer/core";
import { Icon } from "../../../shared/icon/icon";

/** Name and value rows, each with a switch for whether it is sent: headers, the fields of a form body, and (without the switch) variables. */
@Component({
  selector: "app-rows-editor",
  imports: [FormsModule, Icon, MatButton, MatIconButton, MatCheckbox, MatFormField, MatInput],
  templateUrl: "./rows-editor.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RowsEditor {
  /** What the rows are, in the accessible names: "Headers name, row 1". */
  readonly context = input("Headers");
  readonly items = input<Row[]>([]);
  readonly addLabel = input("Add Item");
  /** Whether each row has its "send" switch. Variables have none: a variable is there or it is not. */
  readonly switches = input(true);

  /**
   * A field was edited. `[(ngModel)]` changes the row in place, which the
   * parent cannot see any other way.
   */
  readonly itemChange = output<void>();
  readonly add = output<void>();
  readonly remove = output<number>();

  /** No second blank row. */
  protected addDisabled(): boolean {
    const last = this.items().at(-1);
    return !!last && (last.key === "" || last.value === "");
  }
}
