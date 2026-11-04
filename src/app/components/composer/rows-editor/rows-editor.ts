import { ChangeDetectionStrategy, Component, ElementRef, input, output, viewChildren } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { UiButton } from "../../../ui/button";
import { UiCheckbox } from "../../../ui/checkbox";
import { UiInput } from "../../../ui/input";
import type { Row } from "@wayfarer/core";
import { Icon } from "../../../shared/icon/icon";

/** Name and value rows, each with a switch for whether it is sent: headers, the fields of a form body, and (without the switch) variables. */
@Component({
  selector: "app-rows-editor",
  imports: [FormsModule, Icon, UiButton, UiCheckbox, UiInput],
  templateUrl: "./rows-editor.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RowsEditor {
  /** What one row is, in the accessible names: "Header name, 1 of 3", and "Value of this header" before it has a name (U-071). */
  readonly noun = input("header");
  readonly items = input<Row[]>([]);
  readonly addLabel = input("Add row");
  /** Whether each row has its "send" switch. Variables have none: a variable is there or it is not. */
  readonly switches = input(true);

  /**
   * A field was edited. `[(ngModel)]` changes the row in place, which the
   * parent cannot see any other way.
   */
  readonly itemChange = output<void>();
  readonly add = output<void>();
  readonly remove = output<number>();

  protected title(): string {
    return this.noun().charAt(0).toUpperCase() + this.noun().slice(1);
  }

  private readonly nameFields = viewChildren<ElementRef<HTMLInputElement>>("nameField");

  /** A row is sent once it has a name: the blank row is unchecked until then (L-17). */
  protected rename(item: Row, key: string): void {
    if (!item.key && key) item.enabled = true;
    item.key = key;
    this.itemChange.emit();
  }

  /** No second blank row: with one there, the button takes the caret to its name (L-18). */
  protected addRow(): void {
    const blank = this.items().findIndex((item) => !item.key);
    if (blank < 0) this.add.emit();
    else this.nameFields()[blank]?.nativeElement.focus();
  }
}
