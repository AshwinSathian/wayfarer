import { ChangeDetectionStrategy, Component, input, output } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { MatFormField } from "@angular/material/form-field";
import { MatInput } from "@angular/material/input";
import { MatButton, MatIconButton } from "@angular/material/button";
import { Icon } from "../../../shared/icon/icon";

type ContextType = "Body" | "Headers";

@Component({
  selector: "app-api-params-basic",
  imports: [MatFormField, MatInput, 
    Icon, FormsModule,
    MatButton, MatIconButton,
  ],
  templateUrl: "./basic-editor.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ApiParamsBasic {
  readonly context = input<ContextType>("Headers");
  readonly items = input<{
    key: string;
    value: unknown;
}[]>([]);
  readonly addLabel = input("Add Item");
  readonly isAddDisabled = input<(ctx: ContextType) => boolean>(() => false);
  // eslint-disable-next-line @typescript-eslint/no-empty-function -- default before the parent binds a real handler
  readonly addItem = input<(ctx: ContextType) => void>(() => { });
  // eslint-disable-next-line @typescript-eslint/no-empty-function -- default before the parent binds a real handler
  readonly removeItem = input<(index: number, ctx: ContextType) => void>(() => { });
  readonly disableItem = input<(item: {
    key: string;
    value: unknown;
}, index: number) => boolean>(() => false);

  /**
   * Fires on every keystroke in a key/value field. `[(ngModel)]="item.key"`
   * mutates the bound object in place (it's a reference into the parent's
   * array), which never touches the `items` input's own reference — so the
   * parent has no other way to know the content changed.
   */
  readonly itemChange = output<void>();

  /** Objects, arrays and null (from JSON mode) can't be edited as one text field; they're shown read-only as JSON. */
  isStructured(value: unknown): boolean {
    return typeof value === "object";
  }

  asJson(value: unknown): string {
    return JSON.stringify(value);
  }
}
