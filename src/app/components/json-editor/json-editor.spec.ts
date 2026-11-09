import { Type } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as monaco from "monaco-editor/editor";
import { JsonEditor } from "./json-editor";
import { ScriptEditor } from "../script-editor/script-editor";

describe("an editor whose Monaco fails to load", () => {
  afterEach(() => vi.restoreAllMocks());

  // A tab left open across a deploy asks for chunks the server no longer has: the editor says so, not an empty box.
  const editors: [string, Type<unknown>][] = [
    ["JsonEditor", JsonEditor],
    ["ScriptEditor", ScriptEditor],
  ];
  for (const [name, component] of editors) {
    it(`${name} says it could not load, and to reload`, async () => {
      vi.spyOn(monaco.editor, "createModel").mockImplementation(() => {
        throw new Error("Failed to fetch dynamically imported module");
      });
      const fixture = TestBed.createComponent(component);
      const element = fixture.nativeElement as HTMLElement;
      document.body.append(element);
      await vi.waitFor(() => expect(element.textContent).toContain("The editor could not load."), {
        timeout: 3000,
      });
      expect(element.textContent).toContain("Reload the page");
      fixture.destroy();
    });
  }
});
