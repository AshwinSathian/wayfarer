import { isCurlCommand } from "@wayfarer/core";
import { ChangeDetectionStrategy, Component, ElementRef, inject, output, viewChild } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { MatButton, MatIconButton } from "@angular/material/button";
import { MatFormField } from "@angular/material/form-field";
import { MatInput } from "@angular/material/input";
import { MatProgressSpinner } from "@angular/material/progress-spinner";
import { MatMenu, MatMenuItem, MatMenuTrigger } from "@angular/material/menu";
import { MatTooltip } from "@angular/material/tooltip";
import { HTTP_METHODS } from "../../models/history";
import { RequestSave } from "../../services/request-save";
import { Icon } from "../../shared/icon/icon";
import { WorkspaceStore } from "../../state/workspace-store";
import { ComposerView } from "./composer-view";

/** The method and URL bar with New, Copy as cURL, Save and Send. */
@Component({
  selector: "app-address-row",
  imports: [FormsModule, Icon, MatButton, MatFormField, MatInput, MatIconButton, MatMenu, MatMenuItem, MatMenuTrigger, MatProgressSpinner, MatTooltip],
  templateUrl: "./address-row.html",
  styleUrl: "./address-row.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddressRow {
  protected readonly store = inject(WorkspaceStore);
  protected readonly view = inject(ComposerView);
  private readonly requestSave = inject(RequestSave);

  readonly send = output<void>();

  private readonly urlInput = viewChild<ElementRef<HTMLInputElement>>("urlInput");

  protected readonly requestMethods = HTTP_METHODS;
  protected readonly loadedCollectionRequest = this.requestSave.loadedCollectionRequest;
  protected readonly savingRequest = this.requestSave.savingRequest;

  /**
   * The field itself is upper-cased, with the caret kept where it was. The
   * draft alone would not do it: typing "patch" over "PATCH" leaves the
   * draft unchanged, so nothing would be written back to the field.
   */
  protected onMethodInput(input: HTMLInputElement): void {
    const caret = input.selectionStart;
    input.value = input.value.toUpperCase();
    input.setSelectionRange(caret, caret);
    this.view.onRequestMethodChange(input.value);
  }

  /** A cURL command pasted into the address becomes the request it describes (P4.5). Any other text is pasted as it is. */
  protected onPaste(event: ClipboardEvent): void {
    const text = event.clipboardData?.getData("text/plain") ?? "";
    if (!isCurlCommand(text)) return;
    event.preventDefault();
    void this.view.pasteCurl(text);
  }

  focusUrl(): void {
    const el = this.urlInput()?.nativeElement;
    if (!el) {
      return;
    }
    el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    el.focus();
  }

  protected async save(): Promise<void> {
    await this.requestSave.save(this.store.snapshot(), this.store.scriptsAllowed());
  }
}
