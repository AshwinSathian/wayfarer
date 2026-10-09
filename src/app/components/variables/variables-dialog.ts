import { ChangeDetectionStrategy, Component, effect, input, output, signal, untracked } from "@angular/core";
import { MatButton } from "@angular/material/button";
import { variableChanges, type Row, type VariableChange } from "@wayfarer/core";
import { Dialog } from "../../ui/dialog";
import { RowsEditor } from "../composer/rows-editor/rows-editor";

/**
 * Edits one set of variables that has no other fields: the globals, or a
 * collection's. A save gives what changed, not the rows, so that another
 * tab's change to another variable is kept (D22).
 */
@Component({
  selector: "app-variables-dialog",
  imports: [Dialog, MatButton, RowsEditor],
  template: `
    <ui-dialog [header]="header()" [visible]="visible()" (visibleChange)="visibleChange.emit($event)" width="560px">
      <p class="type-footnote text-label-secondary mb-3">{{ hint() }}</p>
      <app-rows-editor
        [context]="header()"
        [items]="rows()"
        [switches]="false"
        addLabel="Add variable"
        (add)="rows.set([...rows(), { key: '', value: '', enabled: true }])"
        (remove)="remove($event)"
      />
      <div uiDialogFooter>
        <div class="flex justify-end gap-2">
          <button matButton="outlined" class="btn-secondary" type="button" (click)="visibleChange.emit(false)">Cancel</button>
          <button matButton="filled" type="button" (click)="submit()">Save variables</button>
        </div>
      </div>
    </ui-dialog>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VariablesDialog {
  readonly header = input.required<string>();
  /** One sentence on who can use these variables and what wins over them. */
  readonly hint = input("");
  /** The variables as they are stored. */
  readonly variables = input<Row[]>([]);
  readonly visible = input(false);

  readonly visibleChange = output<boolean>();
  readonly save = output<VariableChange[]>();

  /** A copy, edited in place by the rows editor. */
  protected readonly rows = signal<Row[]>([]);

  constructor() {
    // Each opening starts from what is stored then.
    effect(() => {
      if (this.visible()) {
        this.rows.set(untracked(this.variables).map((row) => ({ ...row })));
      }
    });
  }

  protected remove(index: number): void {
    this.rows.set(this.rows().filter((_, i) => i !== index));
  }

  protected submit(): void {
    const named = this.rows()
      .map((row) => ({ ...row, key: row.key.trim() }))
      .filter((row) => row.key);
    this.save.emit(variableChanges(this.variables(), named));
    this.visibleChange.emit(false);
  }
}
