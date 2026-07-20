import { CommonModule } from "@angular/common";
import { ChangeDetectionStrategy, Component, input, output } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { ButtonModule } from "primeng/button";
import { InputTextModule } from "primeng/inputtext";

type ContextType = "Body" | "Headers";

@Component({
  selector: "app-api-params-basic",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ButtonModule,
    InputTextModule,
  ],
  templateUrl: "./basic-editor.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ApiParamsBasicComponent {
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
}
