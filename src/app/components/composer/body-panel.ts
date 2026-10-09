import { ChangeDetectionStrategy, Component, computed, inject, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { MatButton } from "@angular/material/button";
import { MatOption } from "@angular/material/core";
import { MatSelect } from "@angular/material/select";
import { type BodyMode, type MultipartPart, type RawLanguage } from "@wayfarer/core";
import { RequestFiles } from "../../services/request-files";
import { Icon } from "../../shared/icon/icon";
import { WorkspaceStore } from "../../state/workspace-store";
import { JsonEditor } from "../json-editor/json-editor";
import { MultipartEditor } from "./multipart-editor";
import { RowsEditor } from "./rows-editor/rows-editor";

/** The request body: none, text in a language, form fields, multipart parts or one file. */
@Component({
  selector: "app-body-panel",
  imports: [FormsModule, Icon, JsonEditor, MatButton, MatSelect, MatOption, MultipartEditor, RowsEditor],
  templateUrl: "./body-panel.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BodyPanel {
  protected readonly store = inject(WorkspaceStore);
  private readonly files = inject(RequestFiles);

  protected readonly modes: { label: string; value: BodyMode }[] = [
    { label: "None", value: "none" },
    { label: "Raw", value: "raw" },
    { label: "Form (URL-encoded)", value: "urlencoded" },
    { label: "Multipart", value: "multipart" },
    { label: "Binary file", value: "binary" },
  ];
  protected readonly languages: { label: string; value: RawLanguage }[] = [
    { label: "JSON", value: "json" },
    { label: "Text", value: "text" },
    { label: "XML", value: "xml" },
    { label: "HTML", value: "html" },
    { label: "JavaScript", value: "javascript" },
  ];

  protected readonly body = computed(() => this.store.draft().body);
  /** Why the last file picked was refused. */
  protected readonly fileError = signal("");

  /**
   * A multipart body's `Content-Type` carries the boundary between its
   * parts, and only the browser knows it. A header row would replace it.
   */
  protected readonly contentTypeBreaksMultipart = computed(() => {
    const draft = this.store.draft();
    return (
      draft.body.mode === "multipart" &&
      draft.headers.some((row) => row.enabled && row.key.trim().toLowerCase() === "content-type")
    );
  });

  /** Chooses a mode, starting its part when there is none yet. */
  protected setMode(mode: BodyMode): void {
    const body = this.body();
    this.fileError.set("");
    this.store.setBody({
      mode,
      raw: body.raw ?? { language: "json", text: "" },
      urlencoded: body.urlencoded?.length ? body.urlencoded : [{ key: "", value: "", enabled: true }],
      multipart: body.multipart?.length ? body.multipart : [{ kind: "text", key: "", value: "", enabled: true }],
    });
  }

  protected setRaw(change: Partial<{ language: RawLanguage; text: string }>): void {
    this.store.setBody({ raw: { language: "json", text: "", ...this.body().raw, ...change } });
  }

  protected addField(): void {
    this.store.setBody({ urlencoded: [...(this.body().urlencoded ?? []), { key: "", value: "", enabled: true }] });
  }

  protected removeField(index: number): void {
    this.store.setBody({ urlencoded: (this.body().urlencoded ?? []).filter((_, i) => i !== index) });
  }

  protected addPart(): void {
    this.setParts([...this.parts(), { kind: "text", key: "", value: "", enabled: true }]);
  }

  protected removePart(index: number): void {
    this.setParts(this.parts().filter((_, i) => i !== index));
  }

  protected setPartKind(index: number, kind: MultipartPart["kind"]): void {
    this.replacePart(index, (part) =>
      kind === "text"
        ? { kind, key: part.key, enabled: part.enabled, value: "" }
        : { kind, key: part.key, enabled: part.enabled, fileId: "", fileName: "" }
    );
  }

  protected setPartFile(index: number, file: File): void {
    const ref = this.pick(file);
    if (ref) {
      this.replacePart(index, (part) => ({ kind: "file", key: part.key, enabled: part.enabled, ...ref }));
    }
  }

  protected setBinary(input: HTMLInputElement): void {
    const file = input.files?.[0];
    // Cleared so that picking the same file again is a change.
    input.value = "";
    const ref = file && this.pick(file);
    if (file && ref) {
      this.store.setBody({ binary: { ...ref, contentType: file.type || undefined } });
    }
  }

  private pick(file: File): { fileId: string; fileName: string } | null {
    const result = this.files.pick(file);
    this.fileError.set(typeof result === "string" ? result : "");
    return typeof result === "string" ? null : result;
  }

  private parts(): MultipartPart[] {
    return this.body().multipart ?? [];
  }

  private setParts(multipart: MultipartPart[]): void {
    this.store.setBody({ multipart });
  }

  private replacePart(index: number, change: (part: MultipartPart) => MultipartPart): void {
    this.setParts(this.parts().map((part, i) => (i === index ? change(part) : part)));
  }
}
