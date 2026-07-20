import { CommonModule } from "@angular/common";
import { Component, Input } from "@angular/core";
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
})
export class ApiParamsBasicComponent {
  @Input() context: ContextType = "Headers";
  @Input() items: { key: string; value: unknown }[] = [];
  @Input() addLabel = "Add Item";
  @Input() isAddDisabled: (ctx: ContextType) => boolean = () => false;
  // eslint-disable-next-line @typescript-eslint/no-empty-function -- default before the parent binds a real handler
  @Input() addItem: (ctx: ContextType) => void = () => {};
  // eslint-disable-next-line @typescript-eslint/no-empty-function -- default before the parent binds a real handler
  @Input() removeItem: (index: number, ctx: ContextType) => void = () => {};
  @Input()
  disableItem: (item: { key: string; value: unknown }, index: number) => boolean =
    () => false;
}
