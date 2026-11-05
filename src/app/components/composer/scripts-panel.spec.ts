import { TestBed } from "@angular/core/testing";
import { describe, expect, it } from "vitest";
import { setupComposer } from "../../../testing/composer-setup";
import { ScriptsPanel } from "./scripts-panel";

// U-189: a ▷ beside "Pre-request script" read as Run, or as a closed disclosure, and ↻ beside "Post-response
// script" as Replay. A heading is its words.
describe("the Scripts tab's headings", () => {
  it("carry no icon", async () => {
    await setupComposer();
    const fixture = TestBed.createComponent(ScriptsPanel);
    await fixture.whenStable();
    const headings = [...(fixture.nativeElement as HTMLElement).querySelectorAll("p.type-subhead")];
    expect(headings.map((heading) => heading.textContent?.trim())).toEqual([
      "Pre-request script",
      "Post-response script",
      "Tests",
    ]);
    for (const heading of headings) expect(heading.parentElement?.querySelector("app-icon")).toBeNull();
  });
});
