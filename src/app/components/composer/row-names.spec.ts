import { TestBed } from "@angular/core/testing";
import { describe, expect, it } from "vitest";
import { setupComposer } from "../../../testing/composer-setup";
import { WorkspaceStore } from "../../state/workspace-store";
import { MultipartEditor } from "./multipart-editor";
import { ParamsPanel } from "./params-panel";
import { RowsEditor } from "./rows-editor/rows-editor";

// U-071: a row is named by what it holds, not by its place. "Send parameter 2" and "Remove part" say nothing of
// which row a screen reader is on.
function names(host: HTMLElement): string[] {
  return [...host.querySelectorAll("[aria-label]")].map((element) => element.getAttribute("aria-label") ?? "");
}

describe("row names (U-071)", () => {
  it("names a query parameter's controls by its key", async () => {
    await setupComposer();
    TestBed.inject(WorkspaceStore).patch({
      params: [
        { key: "page", value: "2", enabled: true },
        { key: "", value: "", enabled: true },
      ],
    });
    const fixture = TestBed.createComponent(ParamsPanel);
    await fixture.whenStable();
    expect(names(fixture.nativeElement as HTMLElement)).toEqual([
      "Send page",
      "Parameter name, 1 of 2",
      "Value of page",
      "Remove page",
      "Send this parameter",
      "Parameter name, 2 of 2",
      "Value of this parameter",
      "Remove this parameter",
    ]);
  });

  it("names a header's controls by its name", async () => {
    TestBed.configureTestingModule({ imports: [RowsEditor] });
    const fixture = TestBed.createComponent(RowsEditor);
    fixture.componentRef.setInput("noun", "header");
    fixture.componentRef.setInput("addLabel", "Add header");
    fixture.componentRef.setInput("items", [{ key: "Accept", value: "*/*", enabled: true }]);
    await fixture.whenStable();
    expect(names(fixture.nativeElement as HTMLElement)).toEqual([
      "Send Accept",
      "Header name, 1 of 1",
      "Value of Accept",
      "Remove Accept",
      "Add header",
    ]);
  });

  it("names a part's controls by its name", async () => {
    TestBed.configureTestingModule({ imports: [MultipartEditor] });
    const fixture = TestBed.createComponent(MultipartEditor);
    fixture.componentRef.setInput("parts", [{ key: "note", value: "hi", kind: "text", enabled: true }]);
    await fixture.whenStable();
    expect(names(fixture.nativeElement as HTMLElement)).toEqual([
      "Send note",
      "Part name, 1 of 1",
      "Type of note",
      "Value of note",
      "Remove note",
      "Add part",
    ]);
  });
});
